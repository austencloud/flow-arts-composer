import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  setDoc: vi.fn(),
  deleteDoc: vi.fn(),
  trackCollectionFollowChanged: vi.fn(),
}));

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(),
  deleteDoc: h.deleteDoc,
  doc: vi.fn((...args: unknown[]) => ({ path: args.slice(1).join("/") })),
  onSnapshot: vi.fn(),
  serverTimestamp: vi.fn(() => "server-time"),
  setDoc: h.setDoc,
}));

vi.mock("#lib/shared/auth/firebase.js", () => ({
  getFirestoreInstance: vi.fn(async () => ({ id: "firestore" })),
}));

vi.mock("#lib/shared/library/data/firestore-paths.js", () => ({
  getFollowedCollectionPath: (
    userId: string,
    ownerId: string,
    collectionId: string
  ) => `users/${userId}/followedCollections/${ownerId}_${collectionId}`,
  getFollowedCollectionsPath: (userId: string) =>
    `users/${userId}/followedCollections`,
}));

vi.mock("#lib/shared/library/services/collection-firestore-mapper.js", () => ({
  getAuthenticatedUserId: vi.fn(() => "current-user"),
}));

vi.mock("#lib/shared/analytics/social-events.js", () => ({
  trackCollectionFollowChanged: h.trackCollectionFollowChanged,
}));

import {
  followCollection,
  unfollowCollection,
} from "#lib/shared/library/services/followed-collections.js";

describe("followed collection analytics completion boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.setDoc.mockResolvedValue(undefined);
    h.deleteDoc.mockResolvedValue(undefined);
  });

  it("emits after a completed follow write", async () => {
    await followCollection("owner-1", "collection-1", "community_collection");

    expect(h.trackCollectionFollowChanged).toHaveBeenCalledWith(
      "follow",
      "community_collection",
      "owner-1",
      "collection-1"
    );
    expect(h.setDoc.mock.invocationCallOrder[0]).toBeLessThan(
      h.trackCollectionFollowChanged.mock.invocationCallOrder[0]!
    );
  });

  it("does not emit when the follow write fails", async () => {
    h.setDoc.mockRejectedValueOnce(new Error("offline"));

    await expect(
      followCollection("owner-1", "collection-1", "community_collection")
    ).rejects.toThrow("offline");
    expect(h.trackCollectionFollowChanged).not.toHaveBeenCalled();
  });

  it("emits after a completed unfollow write and not after a failed one", async () => {
    await unfollowCollection("owner-1", "collection-1", "followed_collection");
    expect(h.trackCollectionFollowChanged).toHaveBeenCalledWith(
      "unfollow",
      "followed_collection",
      "owner-1",
      "collection-1"
    );

    h.trackCollectionFollowChanged.mockClear();
    h.deleteDoc.mockRejectedValueOnce(new Error("permission-denied"));
    await expect(
      unfollowCollection("owner-1", "collection-1", "followed_collection")
    ).rejects.toThrow("permission-denied");
    expect(h.trackCollectionFollowChanged).not.toHaveBeenCalled();
  });
});
