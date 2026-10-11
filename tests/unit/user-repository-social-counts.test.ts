import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  collection: vi.fn((_firestore: unknown, path: string) => path),
  doc: vi.fn((_firestore: unknown, path: string) => path),
  firestoreGet: vi.fn(),
  firestoreList: vi.fn(),
  getCountFromServer: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  getFirestoreInstance: vi.fn(async () => ({ name: "firestore" })),
  onSnapshot: vi.fn(),
  runTransaction: vi.fn(),
  serverTimestamp: vi.fn(),
  trackWrite: vi.fn(),
}));

vi.mock("firebase/firestore", () => ({
  collection: h.collection,
  doc: h.doc,
  documentId: vi.fn(),
  getCountFromServer: h.getCountFromServer,
  getDoc: h.getDoc,
  getDocs: h.getDocs,
  limit: vi.fn(),
  onSnapshot: h.onSnapshot,
  orderBy: vi.fn(),
  query: vi.fn((value: unknown) => value),
  runTransaction: h.runTransaction,
  serverTimestamp: h.serverTimestamp,
  startAfter: vi.fn(),
  where: vi.fn(),
}));

vi.mock("#lib/shared/auth/firebase.js", () => ({
  getFirestoreInstance: h.getFirestoreInstance,
}));

vi.mock("#lib/shared/firestore/index.js", async () => {
  const { z } = await import("zod");
  return {
    firestoreDate: z.any(),
    firestoreGet: h.firestoreGet,
    firestoreList: h.firestoreList,
  };
});

vi.mock("#lib/shared/toast/state/toast-state.svelte.js", () => ({
  toast: { error: vi.fn() },
}));

vi.mock("#lib/shared/offline/state/sync-status-state.svelte.js", () => ({
  trackWrite: h.trackWrite,
}));

import { getUserProfile } from "#lib/shared/community/services/user-repository.js";

const storedProfile = {
  publicProfileVersion: 2,
  displayName: "Cheech",
  username: "CheechChi",
  followerCount: 0,
  followingCount: 0,
  createdAt: new Date("2026-07-01T00:00:00Z"),
};

beforeEach(() => {
  vi.clearAllMocks();
  h.firestoreGet.mockResolvedValue(storedProfile);
  h.getDoc.mockResolvedValue({ exists: () => true });
  h.getCountFromServer.mockImplementation(async (path: string) => ({
    data: () => ({ count: path.endsWith("/followers") ? 1 : 3 }),
  }));
});

describe("profile social counts", () => {
  it("uses relationship collections instead of a stale profile counter", async () => {
    const profile = await getUserProfile("creator-1", "viewer-1");

    expect(profile).toMatchObject({
      followerCount: 1,
      followingCount: 3,
      isFollowing: true,
    });
    expect(h.getCountFromServer).toHaveBeenCalledTimes(2);
  });

  it("keeps cached counters when exact counts are unavailable offline", async () => {
    const consoleWarn = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    h.getCountFromServer.mockRejectedValue(new Error("offline"));

    const profile = await getUserProfile("creator-1", "viewer-1");

    expect(profile).toMatchObject({
      followerCount: 0,
      followingCount: 0,
      isFollowing: true,
    });
    expect(consoleWarn).toHaveBeenCalledOnce();
    consoleWarn.mockRestore();
  });
});
