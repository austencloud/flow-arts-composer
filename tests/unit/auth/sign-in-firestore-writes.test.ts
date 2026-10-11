/**
 * What a signed-in page load writes to Firestore.
 *
 * Every page load for a signed-in account syncs the profile
 * (createOrUpdateUserDocument), links this browser to the account
 * (linkDeviceToUser) and merges onboarding progress with the cloud copy
 * (syncLocalToCloud). Each of them used to write on every visit, even with
 * nothing new: users/{uid} and the username claim, the private profile, the
 * device document (overwriting when the browser was first seen) and the
 * onboarding status. These tests run the real code against an in-memory
 * Firestore and count what reaches it.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "firebase/auth";

interface RecordedWrite {
  path: string;
  op: "set" | "merge" | "update";
  data: Record<string, unknown>;
}

const fake = vi.hoisted(() => {
  const docs = new Map<string, Record<string, unknown>>();
  const writes: RecordedWrite[] = [];
  const counters = { transactions: 0 };
  const snapshot = (path: string) => {
    const data = docs.get(path);
    return { exists: () => data !== undefined, data: () => data };
  };
  // A write also lands in the store, so a later page load reads it back. Its
  // server timestamps resolve to the moment it was written.
  const record = (write: RecordedWrite) => {
    writes.push(write);
    const writtenAt = Date.now();
    const landed = Object.fromEntries(
      Object.entries(write.data).map(([field, value]) => [
        field,
        value === "SERVER_TIME" ? { toMillis: () => writtenAt } : value,
      ])
    );
    docs.set(
      write.path,
      write.op === "set" ? landed : { ...docs.get(write.path), ...landed }
    );
  };
  return { docs, writes, counters, snapshot, record };
});

const h = vi.hoisted(() => ({
  reportErrorTelemetry: vi.fn(async () => undefined),
  getCurrentPostHogSessionId: vi.fn(async (): Promise<string | null> => null),
  authState: { user: { uid: "user-1" } as { uid: string } | null },
}));

vi.mock("firebase/firestore", () => ({
  doc: vi.fn((_firestore: unknown, ...segments: string[]) => ({
    path: segments.join("/"),
  })),
  getDoc: vi.fn(async (ref: { path: string }) => fake.snapshot(ref.path)),
  setDoc: vi.fn(
    async (
      ref: { path: string },
      data: Record<string, unknown>,
      options?: { merge?: boolean }
    ) => {
      fake.record({
        path: ref.path,
        op: options?.merge ? "merge" : "set",
        data,
      });
    }
  ),
  deleteDoc: vi.fn(),
  // Writes are queued and only recorded if the transaction body succeeds,
  // the way a real commit behaves.
  runTransaction: vi.fn(
    async (_firestore: unknown, body: (tx: unknown) => Promise<unknown>) => {
      fake.counters.transactions++;
      const queued: RecordedWrite[] = [];
      const tx = {
        get: vi.fn(async (ref: { path: string }) => fake.snapshot(ref.path)),
        set: vi.fn((ref: { path: string }, data: Record<string, unknown>) => {
          queued.push({ path: ref.path, op: "set", data });
          return tx;
        }),
        update: vi.fn(
          (ref: { path: string }, data: Record<string, unknown>) => {
            queued.push({ path: ref.path, op: "update", data });
            return tx;
          }
        ),
      };
      const result = await body(tx);
      queued.forEach(fake.record);
      return result;
    }
  ),
  serverTimestamp: vi.fn(() => "SERVER_TIME"),
}));

vi.mock("#lib/shared/auth/firebase.js", () => ({
  getFirestoreInstance: vi.fn(async () => ({ name: "firestore" })),
}));

vi.mock("#lib/shared/auth/state/auth-state.svelte.js", () => ({
  authState: h.authState,
}));

vi.mock("#lib/shared/foundation/services/device-id.js", () => ({
  getDeviceId: vi.fn(() => "device-1"),
}));

vi.mock("#lib/shared/auth/services/profile-picture-manager.js", () => ({
  getProviderIds: vi.fn(() => ({ googleId: null, facebookId: null })),
}));

vi.mock("#lib/shared/foundation/utils/avatar-generator.js", () => ({
  generateAvatarUrl: vi.fn(() => "generated-avatar"),
}));

vi.mock("#lib/shared/analytics/services/posthog.js", () => ({
  captureWhenReady: vi.fn(),
  getCurrentPostHogSessionId: h.getCurrentPostHogSessionId,
}));

vi.mock("#lib/shared/error/services/error-telemetry-reporter.js", () => ({
  reportErrorTelemetry: h.reportErrorTelemetry,
}));

vi.mock("#lib/shared/library/services/public-sequence-persister.js", () => ({
  refreshPublicSequenceOwnerProfile: vi.fn(async () => ({
    scanned: 0,
    updated: 0,
    unchanged: 0,
    skipped: 0,
  })),
}));

import { claimUsername } from "#lib/shared/auth/services/username-validator.js";
import { UserDocumentManager } from "#lib/shared/auth/services/user-document-manager.js";
import { knownAccountProfile } from "#lib/shared/auth/state/account-profile-snapshot.js";
import { linkDeviceToUser } from "#lib/shared/auth/services/device-id-service.js";
import { OnboardingPersister } from "#lib/shared/onboarding/services/onboarding-persister.js";

const UID = "user-1";
const PHOTO = "https://photos.example/matty.png";
const IN_JULY = { toMillis: () => Date.parse("2026-07-01T00:00:00Z") };
const PRIVATE_PROFILE_PATH = `userPrivateProfiles/${UID}`;
const DEVICE_PATH = `users/${UID}/devices/device-1`;
const ONBOARDING_PATH = `users/${UID}/onboarding/status`;

function minutesAgo(minutes: number) {
  const millis = Date.now() - minutes * 60 * 1000;
  return { toMillis: () => millis };
}

function signedInUser(): User {
  return {
    uid: UID,
    isAnonymous: false,
    displayName: "Matty Mover",
    email: "matty@example.com",
    photoURL: PHOTO,
    providerData: [],
    getIdToken: vi.fn(async () => "fresh-token"),
  } as unknown as User;
}

/** A profile already in step with signedInUser(), last seen 10 minutes ago. */
function storedProfile(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    displayName: "Matty Mover",
    username: "matty",
    usernameLowercase: "matty",
    photoURL: PHOTO,
    avatar: PHOTO,
    isAnonymous: false,
    sequenceCount: 0,
    lastActivityDate: minutesAgo(10),
    ...overrides,
  };
}

/** The private half of storedProfile(), stamped with that visit's session. */
function storedPrivateProfile(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    email: "matty@example.com",
    googleId: null,
    facebookId: null,
    postHogSessionId: "session-6",
    postHogSessionCapturedAt: minutesAgo(10),
    ...overrides,
  };
}

/** This browser, first linked in July and last seen 10 minutes ago. */
function storedDevice(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    deviceId: "device-1",
    firstSeen: IN_JULY,
    lastSeen: minutesAgo(10),
    userAgent: navigator.userAgent,
    ...overrides,
  };
}

/** Onboarding progress as the cloud copy stores it. */
function storedOnboarding(): Record<string, unknown> {
  return {
    appCompleted: true,
    appSkipped: false,
    appCompletedAt: "2026-07-01T00:00:00.000Z",
    lastSeenVersion: "3.2.0",
    viewer3DIntroSeen: true,
    sceneStudioSetupSeen: false,
    accountSetup: {
      backgroundChosenAt: null,
      reminderDismissals: 1,
      reminderSnoozedUntil: null,
    },
    updatedAt: IN_JULY,
  };
}

function holdClaim(owner: string) {
  fake.docs.set("usernames/matty", {
    userId: owner,
    createdAt: IN_JULY,
    updatedAt: IN_JULY,
  });
}

function writesUnder(prefix: string): RecordedWrite[] {
  return fake.writes.filter((write) => write.path.startsWith(prefix));
}

beforeEach(() => {
  vi.clearAllMocks();
  fake.docs.clear();
  fake.writes.length = 0;
  fake.counters.transactions = 0;
  h.getCurrentPostHogSessionId.mockResolvedValue(null);
  h.authState.user = { uid: UID };
  localStorage.clear();
});

describe("a signed-in page load with nothing new to save", () => {
  it("writes nothing to Firestore", async () => {
    holdClaim(UID);
    fake.docs.set(`users/${UID}`, storedProfile());
    fake.docs.set(PRIVATE_PROFILE_PATH, storedPrivateProfile());
    fake.docs.set(DEVICE_PATH, storedDevice());
    fake.docs.set(ONBOARDING_PATH, storedOnboarding());
    // This browser already holds the cloud copy of its onboarding progress.
    await new OnboardingPersister().loadStatus();
    // A newer PostHog session is live; on its own that is no reason to write.
    h.getCurrentPostHogSessionId.mockResolvedValue("session-7");

    await new UserDocumentManager().createOrUpdateUserDocument(signedInUser());
    await linkDeviceToUser(UID);
    await new OnboardingPersister().syncLocalToCloud();

    expect(h.reportErrorTelemetry).not.toHaveBeenCalled();
    expect(fake.writes).toEqual([]);
  });
});

describe("claimUsername", () => {
  it("writes nothing when the claim already belongs to the same user", async () => {
    holdClaim(UID);
    fake.docs.set(`users/${UID}`, storedProfile());

    await claimUsername(UID, "matty");

    expect(fake.writes).toEqual([]);
  });

  it("creates a missing claim, stamped with when it was claimed", async () => {
    fake.docs.set(`users/${UID}`, storedProfile());

    await claimUsername(UID, "matty");

    expect(writesUnder("usernames/")).toEqual([
      {
        path: "usernames/matty",
        op: "set",
        data: {
          userId: UID,
          createdAt: "SERVER_TIME",
          updatedAt: "SERVER_TIME",
        },
      },
    ]);
  });

  it("refuses a claim owned by someone else and writes nothing", async () => {
    holdClaim("someone-else");
    fake.docs.set(`users/${UID}`, storedProfile());

    await expect(claimUsername(UID, "matty")).rejects.toThrow(
      "Username is already taken"
    );
    expect(fake.writes).toEqual([]);
  });

  it("applies a capitalization-only rename to the profile and leaves the claim alone", async () => {
    holdClaim(UID);
    fake.docs.set(`users/${UID}`, storedProfile());

    await claimUsername(UID, "Matty");

    expect(fake.writes).toEqual([
      {
        path: `users/${UID}`,
        op: "update",
        data: {
          username: "Matty",
          usernameLowercase: "matty",
          updatedAt: "SERVER_TIME",
        },
      },
    ]);
  });
});

describe("a signed-in page load for an existing profile", () => {
  it("writes nothing to the public profile or the username claim when nothing changed", async () => {
    holdClaim(UID);
    fake.docs.set(`users/${UID}`, storedProfile());

    await new UserDocumentManager().createOrUpdateUserDocument(signedInUser());

    expect(h.reportErrorTelemetry).not.toHaveBeenCalled();
    expect(writesUnder("users/")).toEqual([]);
    expect(writesUnder("usernames/")).toEqual([]);
    // Even a transaction that writes nothing sends a commit.
    expect(fake.counters.transactions).toBe(0);
  });

  it("refreshes only lastActivityDate once the last recorded visit is over an hour old", async () => {
    holdClaim(UID);
    fake.docs.set(
      `users/${UID}`,
      storedProfile({ lastActivityDate: minutesAgo(120) })
    );

    await new UserDocumentManager().createOrUpdateUserDocument(signedInUser());

    expect(h.reportErrorTelemetry).not.toHaveBeenCalled();
    expect(writesUnder("users/")).toEqual([
      {
        path: `users/${UID}`,
        op: "merge",
        data: { lastActivityDate: "SERVER_TIME" },
      },
    ]);
  });

  it("stamps a changed field with fresh updatedAt and lastActivityDate in one write", async () => {
    // A guest who just linked a full account. Pulse reads lastActivityDate
    // from this same write to find the replay of the session that upgraded.
    holdClaim(UID);
    fake.docs.set(`users/${UID}`, storedProfile({ isAnonymous: true }));

    await new UserDocumentManager().createOrUpdateUserDocument(signedInUser());

    expect(h.reportErrorTelemetry).not.toHaveBeenCalled();
    expect(writesUnder("users/")).toEqual([
      {
        path: `users/${UID}`,
        op: "merge",
        data: {
          isAnonymous: false,
          updatedAt: "SERVER_TIME",
          lastActivityDate: "SERVER_TIME",
        },
      },
    ]);
  });

  it("repairs a username claim that was never created", async () => {
    fake.docs.set(`users/${UID}`, storedProfile());

    await new UserDocumentManager().createOrUpdateUserDocument(signedInUser());

    expect(h.reportErrorTelemetry).not.toHaveBeenCalled();
    expect(writesUnder("usernames/")).toEqual([
      {
        path: "usernames/matty",
        op: "set",
        data: {
          userId: UID,
          createdAt: "SERVER_TIME",
          updatedAt: "SERVER_TIME",
        },
      },
    ]);
  });

  it("remembers the profile it read, for this account only, so Account can draw it at once", async () => {
    holdClaim(UID);
    fake.docs.set(
      `users/${UID}`,
      storedProfile({ pronouns: "they/them", profileColor: "#22c55e" })
    );
    fake.docs.set(
      PRIVATE_PROFILE_PATH,
      storedPrivateProfile({ googlePhotoURL: "https://photos.example/g.png" })
    );

    await new UserDocumentManager().createOrUpdateUserDocument(signedInUser());

    expect(knownAccountProfile(UID)).toEqual({
      userId: UID,
      username: "matty",
      pronouns: "they/them",
      profileColor: "#22c55e",
      googlePhotoUrl: "https://photos.example/g.png",
    });
    expect(knownAccountProfile("someone-else")).toBeNull();
  });
});

describe("the private profile on a signed-in page load", () => {
  it("stamps the live session just before the hourly lastActivityDate refresh", async () => {
    holdClaim(UID);
    fake.docs.set(
      `users/${UID}`,
      storedProfile({ lastActivityDate: minutesAgo(120) })
    );
    fake.docs.set(PRIVATE_PROFILE_PATH, storedPrivateProfile());
    h.getCurrentPostHogSessionId.mockResolvedValue("session-7");

    await new UserDocumentManager().createOrUpdateUserDocument(signedInUser());

    // Pulse links a replay only when postHogSessionCapturedAt is within five
    // minutes of lastActivityDate, and it reads the private profile as soon
    // as the users/{uid} write fires it, so the session has to land first.
    expect(h.reportErrorTelemetry).not.toHaveBeenCalled();
    expect(fake.writes).toEqual([
      {
        path: PRIVATE_PROFILE_PATH,
        op: "merge",
        data: {
          postHogSessionId: "session-7",
          postHogSessionCapturedAt: "SERVER_TIME",
        },
      },
      {
        path: `users/${UID}`,
        op: "merge",
        data: { lastActivityDate: "SERVER_TIME" },
      },
    ]);
  });

  it("writes only a changed private field, with no session stamp while the public profile is left alone", async () => {
    holdClaim(UID);
    fake.docs.set(`users/${UID}`, storedProfile());
    fake.docs.set(
      PRIVATE_PROFILE_PATH,
      storedPrivateProfile({ email: "old-address@example.com" })
    );
    h.getCurrentPostHogSessionId.mockResolvedValue("session-7");

    await new UserDocumentManager().createOrUpdateUserDocument(signedInUser());

    expect(h.reportErrorTelemetry).not.toHaveBeenCalled();
    expect(fake.writes).toEqual([
      {
        path: PRIVATE_PROFILE_PATH,
        op: "merge",
        data: { email: "matty@example.com" },
      },
    ]);
  });
});

describe("linking this browser on a signed-in page load", () => {
  it("records firstSeen once, when the browser is first linked", async () => {
    await linkDeviceToUser(UID);
    await linkDeviceToUser(UID);

    expect(fake.writes).toEqual([
      {
        path: DEVICE_PATH,
        op: "set",
        data: {
          deviceId: "device-1",
          firstSeen: "SERVER_TIME",
          lastSeen: "SERVER_TIME",
          userAgent: navigator.userAgent,
        },
      },
    ]);
  });

  it("refreshes only lastSeen once the browser was last seen over an hour ago", async () => {
    fake.docs.set(DEVICE_PATH, storedDevice({ lastSeen: minutesAgo(120) }));

    await linkDeviceToUser(UID);

    expect(fake.writes).toEqual([
      { path: DEVICE_PATH, op: "merge", data: { lastSeen: "SERVER_TIME" } },
    ]);
  });

  it("records a browser update along with a fresh lastSeen", async () => {
    fake.docs.set(
      DEVICE_PATH,
      storedDevice({ userAgent: "Mozilla/5.0 (an older browser)" })
    );

    await linkDeviceToUser(UID);

    expect(fake.writes).toEqual([
      {
        path: DEVICE_PATH,
        op: "merge",
        data: { userAgent: navigator.userAgent, lastSeen: "SERVER_TIME" },
      },
    ]);
  });
});

describe("syncing onboarding progress on a signed-in page load", () => {
  it("brings a new browser up to date without writing the cloud copy back", async () => {
    fake.docs.set(ONBOARDING_PATH, storedOnboarding());

    await new OnboardingPersister().syncLocalToCloud();

    expect(fake.writes).toEqual([]);
    const thisBrowser = new OnboardingPersister();
    expect(thisBrowser.hasCompletedApp()).toBe(true);
    expect(thisBrowser.getLastSeenVersion()).toBe("3.2.0");
  });

  it("saves progress this browser made while signed out", async () => {
    fake.docs.set(ONBOARDING_PATH, storedOnboarding());
    await new OnboardingPersister().loadStatus();
    h.authState.user = null;
    await new OnboardingPersister().markVersionAsSeen("3.3.0");
    h.authState.user = { uid: UID };

    await new OnboardingPersister().syncLocalToCloud();

    expect(fake.writes).toEqual([
      {
        path: ONBOARDING_PATH,
        op: "merge",
        data: expect.objectContaining({
          lastSeenVersion: "3.3.0",
          updatedAt: "SERVER_TIME",
        }),
      },
    ]);
  });
});
