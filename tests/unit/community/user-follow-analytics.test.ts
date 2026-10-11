import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const transaction = {
    get: vi.fn(),
    set: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };

  return {
    transaction,
    runTransaction: vi.fn(
      async (
        _firestore: unknown,
        operation: (value: typeof transaction) => unknown
      ) => operation(transaction)
    ),
    trackWrite: vi.fn(async (operation: () => Promise<unknown>) => operation()),
    trackUserFollowChanged: vi.fn(),
    toastError: vi.fn(),
  };
});

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(),
  getCountFromServer: vi.fn(),
  getDocs: vi.fn(),
  doc: vi.fn((...args: unknown[]) => ({ path: args.slice(1).join("/") })),
  getDoc: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  onSnapshot: vi.fn(),
  runTransaction: h.runTransaction,
  serverTimestamp: vi.fn(() => "server-time"),
  documentId: vi.fn(),
  startAfter: vi.fn(),
}));

vi.mock("#lib/shared/auth/firebase.js", () => ({
  getFirestoreInstance: vi.fn(async () => ({ id: "firestore" })),
}));

vi.mock(
  "#lib/shared/community/domain/models/public-profile-contract.js",
  () => ({
    PUBLIC_PROFILE_VERSION: 1,
  })
);

vi.mock("#lib/shared/firestore/index.js", () => ({
  firestoreGet: vi.fn(),
  firestoreList: vi.fn(),
}));

vi.mock("#lib/shared/toast/state/toast-state.svelte.js", () => ({
  toast: { error: h.toastError },
}));

vi.mock("#lib/shared/offline/state/sync-status-state.svelte.js", () => ({
  trackWrite: h.trackWrite,
}));

vi.mock(
  "#lib/shared/community/domain/models/user-firestore-schemas.js",
  () => ({
    UserFirestoreDataSchema: {},
    FollowDocSchema: {},
  })
);

vi.mock("#lib/shared/analytics/social-events.js", () => ({
  trackUserFollowChanged: h.trackUserFollowChanged,
}));

import {
  followUser,
  unfollowUser,
} from "#lib/shared/community/services/user-repository.js";

describe("user follow analytics completion boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("emits follow only when the transaction creates the relationship", async () => {
    h.transaction.get
      .mockResolvedValueOnce({ exists: () => false })
      .mockResolvedValueOnce({ exists: () => true });

    await followUser("current-user", "target-user", "creator_directory");

    expect(h.transaction.set).toHaveBeenCalledTimes(2);
    expect(h.trackUserFollowChanged).toHaveBeenCalledWith(
      "follow",
      "creator_directory",
      "target-user"
    );
  });

  it("does not emit follow for an existing relationship", async () => {
    h.transaction.get.mockResolvedValueOnce({ exists: () => true });

    await followUser("current-user", "target-user", "creator_profile");

    expect(h.transaction.set).not.toHaveBeenCalled();
    expect(h.trackUserFollowChanged).not.toHaveBeenCalled();
  });

  it("emits unfollow only when the transaction deletes the relationship", async () => {
    h.transaction.get.mockResolvedValueOnce({ exists: () => true });

    await unfollowUser("current-user", "target-user", "creator_profile");

    expect(h.transaction.delete).toHaveBeenCalledTimes(2);
    expect(h.trackUserFollowChanged).toHaveBeenCalledWith(
      "unfollow",
      "creator_profile",
      "target-user"
    );
  });

  it("does not emit unfollow for an absent relationship", async () => {
    h.transaction.get.mockResolvedValueOnce({ exists: () => false });

    await unfollowUser("current-user", "target-user", "creator_directory");

    expect(h.transaction.delete).not.toHaveBeenCalled();
    expect(h.trackUserFollowChanged).not.toHaveBeenCalled();
  });
});
