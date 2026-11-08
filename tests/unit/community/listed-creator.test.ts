import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  canCreditCreator,
  canOpenProfile,
  creatorListingStatus,
  isListedCreator,
} from "#lib/shared/community/domain/listed-creator.js";

const visitor = { viewerIsAdmin: false };
const admin = { viewerIsAdmin: true };

describe("isListedCreator", () => {
  it("lists an ordinary person for everyone", () => {
    expect(isListedCreator({ username: "ana" }, visitor)).toBe(true);
    expect(isListedCreator({ username: "ana" }, admin)).toBe(true);
  });

  it.each([
    ["hidden", { username: "ana", isHidden: true }],
    ["disabled", { username: "ana", isDisabled: true }],
    ["on the old moderation list", { username: "netsua07" }],
    ["on the old list in other case", { username: "NetSua07" }],
  ])("drops someone %s for a visitor but not an admin", (_name, data) => {
    expect(isListedCreator(data, visitor)).toBe(false);
    expect(isListedCreator(data, admin)).toBe(true);
  });

  it.each([
    ["flagged guest", { isAnonymous: true }],
    ["legacy guest", { displayName: "Anonymous User" }],
  ])("drops a %s for everyone, admins included", (_name, data) => {
    expect(isListedCreator(data, visitor)).toBe(false);
    expect(isListedCreator(data, admin)).toBe(false);
  });
});

describe("canOpenProfile", () => {
  const person = { isSelf: false };

  it("keeps a hidden profile open by link, so credits work", () => {
    expect(
      canOpenProfile({ isHidden: true }, { ...visitor, ...person })
    ).toBe(true);
  });

  it("closes a disabled profile to all but admins", () => {
    const data = { isDisabled: true };
    expect(canOpenProfile(data, { ...visitor, ...person })).toBe(false);
    expect(canOpenProfile(data, { ...visitor, isSelf: true })).toBe(false);
    expect(canOpenProfile(data, { ...admin, ...person })).toBe(true);
  });

  it("closes a guest's profile to others", () => {
    const data = { isAnonymous: true };
    expect(canOpenProfile(data, { ...visitor, ...person })).toBe(false);
    expect(canOpenProfile(data, { ...visitor, isSelf: true })).toBe(true);
  });
});

describe("creatorListingStatus", () => {
  it("names the stronger state and the old list", () => {
    expect(creatorListingStatus({ isHidden: true, isDisabled: true })).toBe(
      "disabled"
    );
    expect(creatorListingStatus({ isHidden: true })).toBe("hidden");
    expect(creatorListingStatus({ username: "flowtacocat" })).toBe("hidden");
    expect(creatorListingStatus({ username: "ana" })).toBeNull();
  });
});

describe("canCreditCreator", () => {
  it("keeps a hidden person's credit and drops the rest", () => {
    expect(canCreditCreator({ isHidden: true })).toBe(true);
    expect(canCreditCreator({ isDisabled: true })).toBe(false);
    expect(canCreditCreator({ isAnonymous: true })).toBe(false);
  });
});

// ---- the repository paths that consume the helper

const h = vi.hoisted(() => ({
  getDocs: vi.fn(),
  firestoreGet: vi.fn(),
  isAdmin: false,
}));

vi.mock("firebase/firestore", () => ({
  collection: vi.fn((_f: unknown, path: string) => path),
  doc: vi.fn((_f: unknown, path: string) => path),
  documentId: vi.fn(() => "__name__"),
  getCountFromServer: vi.fn(async () => ({ data: () => ({ count: 0 }) })),
  getDoc: vi.fn(async () => ({ exists: () => false })),
  getDocs: h.getDocs,
  limit: vi.fn(),
  onSnapshot: vi.fn(),
  orderBy: vi.fn(),
  query: vi.fn((value: unknown) => value),
  runTransaction: vi.fn(),
  serverTimestamp: vi.fn(),
  startAfter: vi.fn(),
  updateDoc: vi.fn(),
  where: vi.fn(),
}));
vi.mock("#lib/shared/auth/firebase.js", () => ({
  getFirestoreInstance: vi.fn(async () => ({ name: "firestore" })),
}));
vi.mock("#lib/shared/auth/state/auth-state.svelte.js", () => ({
  isEffectiveAdmin: () => h.isAdmin,
}));
vi.mock("#lib/shared/firestore/index.js", async () => {
  const { z } = await import("zod");
  return {
    firestoreDate: z.any(),
    firestoreGet: h.firestoreGet,
    firestoreList: vi.fn(),
  };
});
vi.mock("#lib/shared/toast/state/toast-state.svelte.js", () => ({
  toast: { error: vi.fn() },
}));
vi.mock("#lib/shared/offline/state/sync-status-state.svelte.js", () => ({
  trackWrite: vi.fn(),
}));

import {
  getFollowers,
  getUserProfile,
  getUsersPaginated,
} from "#lib/shared/community/services/user-repository.js";

function snapshot(rows: Record<string, Record<string, unknown>>) {
  const docs = Object.entries(rows).map(([id, data]) => ({
    id,
    data: () => data,
  }));
  return { docs, empty: docs.length === 0 };
}

const ROWS = {
  plain: { displayName: "Plain", username: "plain" },
  hidden: { displayName: "Hidden", username: "hid", isHidden: true },
  disabled: { displayName: "Disabled", username: "dis", isDisabled: true },
  guest: { displayName: "Guest", isAnonymous: true },
  listed: { displayName: "Old list", username: "netsua07" },
};

describe("repository consumers", () => {
  beforeEach(() => {
    h.isAdmin = false;
    h.getDocs.mockReset();
    h.firestoreGet.mockReset();
  });

  async function rosterIds() {
    h.getDocs.mockResolvedValueOnce(snapshot(ROWS));
    const { users } = await getUsersPaginated({
      sortBy: "joinedDate",
      sortDirection: "desc",
      limit: 50,
      cursor: null,
    } as never);
    return users.map((user) => user.id);
  }

  it("roster: a visitor gets only the listed", async () => {
    expect(await rosterIds()).toEqual(["plain"]);
  });

  it("roster: an admin gets everyone but guests", async () => {
    h.isAdmin = true;
    expect(await rosterIds()).toEqual([
      "plain",
      "hidden",
      "disabled",
      "listed",
    ]);
  });

  async function followerIds() {
    h.getDocs
      .mockResolvedValueOnce({
        empty: false,
        docs: Object.keys(ROWS).map((id) => ({ id })),
      })
      .mockResolvedValueOnce(snapshot(ROWS));
    return (await getFollowers("someone")).map((user) => user.id);
  }

  it("follower list: a visitor gets only the listed", async () => {
    expect(await followerIds()).toEqual(["plain"]);
  });

  it("follower list: an admin gets everyone but guests", async () => {
    h.isAdmin = true;
    expect(await followerIds()).toHaveLength(4);
  });

  it("profile open: hidden opens, disabled reads as not found", async () => {
    h.firestoreGet.mockResolvedValueOnce({ ...ROWS.hidden, id: "hidden" });
    expect((await getUserProfile("hidden", "viewer"))?.id).toBe("hidden");

    h.firestoreGet.mockResolvedValueOnce({ ...ROWS.disabled, id: "disabled" });
    expect(await getUserProfile("disabled", "viewer")).toBeNull();
  });

  it("profile open: an admin opens a disabled profile", async () => {
    h.isAdmin = true;
    h.firestoreGet.mockResolvedValueOnce({ ...ROWS.disabled, id: "disabled" });
    expect((await getUserProfile("disabled", "admin"))?.isDisabled).toBe(true);
  });

  it("profile open: a guest's profile reads as not found", async () => {
    h.firestoreGet.mockResolvedValueOnce({ ...ROWS.guest, id: "guest" });
    expect(await getUserProfile("guest", "viewer")).toBeNull();
  });
});
