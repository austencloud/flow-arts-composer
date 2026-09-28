/**
 * What a signed-in page load writes to Firestore.
 *
 * createOrUpdateUserDocument runs on every page load for a signed-in account.
 * It used to rewrite users/{uid} and re-claim usernames/{name} each time,
 * which overwrote the claim's createdAt, turned users/{uid}.updatedAt into a
 * page-view counter, and fired the pulseUserActivity trigger on every visit.
 * These tests run the real profile sync and username claim against an
 * in-memory Firestore and count what reaches it.
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
  return { docs, writes, counters, snapshot };
});

const h = vi.hoisted(() => ({
  reportErrorTelemetry: vi.fn(async () => undefined),
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
      fake.writes.push({
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
      fake.writes.push(...queued);
      return result;
    }
  ),
  serverTimestamp: vi.fn(() => "SERVER_TIME"),
}));

vi.mock("$lib/shared/auth/firebase", () => ({
  getFirestoreInstance: vi.fn(async () => ({ name: "firestore" })),
}));

vi.mock("$lib/shared/auth/services/profile-picture-manager", () => ({
  getProviderIds: vi.fn(() => ({ googleId: null, facebookId: null })),
}));

vi.mock("$lib/shared/foundation/utils/avatar-generator", () => ({
  generateAvatarUrl: vi.fn(() => "generated-avatar"),
}));

vi.mock("$lib/shared/analytics/services/posthog", () => ({
  captureWhenReady: vi.fn(),
  getCurrentPostHogSessionId: vi.fn(async () => null),
}));

vi.mock("$lib/shared/error/services/error-telemetry-reporter", () => ({
  reportErrorTelemetry: h.reportErrorTelemetry,
}));

vi.mock("$lib/shared/library/services/public-sequence-persister", () => ({
  refreshPublicSequenceOwnerProfile: vi.fn(async () => ({
    scanned: 0,
    updated: 0,
    unchanged: 0,
    skipped: 0,
  })),
}));

import { claimUsername } from "$lib/shared/auth/services/username-validator";
import { UserDocumentManager } from "$lib/shared/auth/services/user-document-manager";

const UID = "user-1";
const PHOTO = "https://photos.example/matty.png";
const CLAIMED_IN_JULY = { toMillis: () => Date.parse("2026-07-01T00:00:00Z") };

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

function holdClaim(owner: string) {
  fake.docs.set("usernames/matty", {
    userId: owner,
    createdAt: CLAIMED_IN_JULY,
    updatedAt: CLAIMED_IN_JULY,
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

    await new UserDocumentManager().createOrUpdateUserDocument(
      signedInUser()
    );

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

    await new UserDocumentManager().createOrUpdateUserDocument(
      signedInUser()
    );

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

    await new UserDocumentManager().createOrUpdateUserDocument(
      signedInUser()
    );

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

    await new UserDocumentManager().createOrUpdateUserDocument(
      signedInUser()
    );

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
});
