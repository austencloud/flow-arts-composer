import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const batch = {
    set: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    commit: vi.fn(),
  };
  const transaction = {
    get: vi.fn(),
    update: vi.fn(),
  };

  return {
    batch,
    transaction,
    runTransaction: vi.fn(),
    getDoc: vi.fn(),
    getDocs: vi.fn(),
    captureEvent: vi.fn(),
  };
});

vi.mock("firebase/firestore", () => ({
  collection: vi.fn((_db: unknown, path: string) => ({ path })),
  doc: vi.fn((_db: unknown, path: string) => ({ path })),
  getDoc: mocks.getDoc,
  getDocs: mocks.getDocs,
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  query: vi.fn((value: unknown) => value),
  orderBy: vi.fn(),
  onSnapshot: vi.fn(),
  runTransaction: mocks.runTransaction,
  serverTimestamp: vi.fn(() => "server-timestamp"),
  writeBatch: vi.fn(() => mocks.batch),
  arrayUnion: vi.fn(),
  arrayRemove: vi.fn((value: string) => ({ remove: value })),
  increment: vi.fn((value: number) => ({ incrementBy: value })),
  documentId: vi.fn(),
  where: vi.fn(),
}));
vi.mock("#lib/shared/auth/firebase.js", () => ({
  getFirestoreInstance: vi.fn().mockResolvedValue({}),
}));
vi.mock("#lib/shared/toast/state/toast-state.svelte.ts", () => ({
  toast: { error: vi.fn() },
}));
vi.mock("#lib/shared/analytics/services/posthog.js", () => ({
  captureEvent: mocks.captureEvent,
}));
vi.mock("#lib/shared/library/services/collection-firestore-mapper.js", () => {
  class CollectionError extends Error {
    constructor(
      message: string,
      public code: string,
      public collectionId?: string
    ) {
      super(message);
    }
  }

  return {
    getAuthenticatedUserId: () => "user-1",
    mapDocToCollection: (data: Record<string, unknown>, id: string) => ({
      id,
      name: data["name"] ?? "",
      ownerId: "user-1",
      sequenceIds: data["sequenceIds"] ?? [],
      sequenceCount: data["sequenceCount"] ?? 0,
      isPublic: false,
      sortOrder: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...(data["systemType"] ? { systemType: data["systemType"] } : {}),
    }),
    batchFetchSequences: vi.fn(),
    batchFetchPublicSequences: vi.fn(),
    CollectionError,
  };
});

import {
  addSequenceToCollection,
  addSequencesToCollection,
  createSmartUserCollection,
  createUserCollection,
  deleteCollection,
} from "#lib/shared/library/services/collection-manager.js";

describe("collection-manager server-owned profile counts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.batch.commit.mockResolvedValue(undefined);
    mocks.runTransaction.mockImplementation(
      async (
        _firestore: unknown,
        operation: (transaction: typeof mocks.transaction) => Promise<void>
      ) => operation(mocks.transaction)
    );
  });

  it("creates a manual collection without a client-owned profile counter write", async () => {
    await createUserCollection("Inventions");

    expect(mocks.batch.set).toHaveBeenCalledTimes(2);
    expect(mocks.batch.set.mock.calls[0][0].path).toMatch(
      /^users\/user-1\/collections\//
    );
    expect(mocks.batch.set.mock.calls[1]).toEqual([
      { path: "users/user-1" },
      { lastActivityDate: "server-timestamp" },
      { merge: true },
    ]);
    expect(mocks.batch.set.mock.calls.flat()).not.toContainEqual(
      expect.objectContaining({ collectionCount: expect.anything() })
    );
    expect(mocks.batch.commit).toHaveBeenCalledOnce();
  });

  it("leaves smart-collection counts to the server-owned trigger", async () => {
    await createSmartUserCollection(
      "Moves",
      {
        source: "my-library",
        filters: [],
        sortMethod: "newest",
        sortDirection: "desc",
      },
      3
    );

    expect(mocks.batch.set).toHaveBeenCalledTimes(2);
    expect(mocks.batch.set.mock.calls[0][0].path).toMatch(
      /^users\/user-1\/collections\//
    );
    expect(mocks.batch.set.mock.calls[1]).toEqual([
      { path: "users/user-1" },
      { lastActivityDate: "server-timestamp" },
      { merge: true },
    ]);
    expect(mocks.batch.set.mock.calls.flat()).not.toContainEqual(
      expect.objectContaining({ collectionCount: expect.anything() })
    );
    expect(mocks.batch.commit).toHaveBeenCalledOnce();
  });

  it("deletes a custom collection without a client-owned profile counter write", async () => {
    mocks.getDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({
        name: "Inventions",
        sequenceIds: [],
        sequenceCount: 0,
      }),
    });

    await deleteCollection("collection-1");

    expect(mocks.getDocs).not.toHaveBeenCalled();
    expect(mocks.batch.delete).toHaveBeenCalledWith({
      path: "users/user-1/collections/collection-1",
    });
    expect(mocks.batch.set).toHaveBeenCalledOnce();
    expect(mocks.batch.set).toHaveBeenCalledWith(
      { path: "users/user-1" },
      { lastActivityDate: "server-timestamp" },
      { merge: true }
    );
    expect(mocks.batch.set.mock.calls.flat()).not.toContainEqual(
      expect.objectContaining({ collectionCount: expect.anything() })
    );
    expect(mocks.batch.commit).toHaveBeenCalledOnce();
  });

  it("derives membership count from ids and updates both documents in one transaction", async () => {
    const collectionData = {
      name: "Inventions",
      kind: "manual",
      sequenceIds: ["sequence-1"],
      sequenceCount: 7,
    };
    mocks.getDoc.mockResolvedValue({
      exists: () => true,
      data: () => collectionData,
    });
    mocks.transaction.get.mockImplementation(async (ref: { path: string }) =>
      ref.path.endsWith("/collections/collection-1")
        ? {
            exists: () => true,
            data: () => collectionData,
          }
        : {
            exists: () => true,
            data: () => ({ collectionIds: [] }),
          }
    );

    await addSequenceToCollection("collection-1", "sequence-1");

    expect(mocks.runTransaction).toHaveBeenCalledOnce();
    expect(mocks.transaction.update).toHaveBeenCalledWith(
      { path: "users/user-1/collections/collection-1" },
      {
        sequenceIds: ["sequence-1"],
        sequenceCount: 1,
        updatedAt: "server-timestamp",
      }
    );
    expect(mocks.transaction.update).toHaveBeenCalledWith(
      { path: "users/user-1/sequences/sequence-1" },
      {
        collectionIds: ["collection-1"],
        updatedAt: "server-timestamp",
      }
    );
  });

  it("adds a selection with one collection transaction and reverse memberships", async () => {
    const collectionData = {
      name: "Inventions",
      kind: "manual",
      sequenceIds: ["existing"],
      sequenceCount: 99,
    };
    mocks.getDoc.mockResolvedValue({
      exists: () => true,
      data: () => collectionData,
    });
    mocks.transaction.get.mockImplementation(async (ref: { path: string }) =>
      ref.path.endsWith("/collections/collection-1")
        ? {
            exists: () => true,
            data: () => collectionData,
          }
        : {
            exists: () => true,
            data: () => ({ collectionIds: [] }),
          }
    );

    const result = await addSequencesToCollection("collection-1", [
      "existing",
      "sequence-2",
      "sequence-3",
      "sequence-3",
    ]);

    expect(result).toEqual({
      requestedCount: 3,
      addedCount: 2,
      alreadyPresentCount: 1,
    });
    expect(mocks.runTransaction).toHaveBeenCalledOnce();
    expect(mocks.transaction.update).toHaveBeenCalledWith(
      { path: "users/user-1/collections/collection-1" },
      {
        sequenceIds: ["existing", "sequence-2", "sequence-3"],
        sequenceCount: 3,
        updatedAt: "server-timestamp",
      }
    );
    expect(mocks.transaction.update).toHaveBeenCalledWith(
      { path: "users/user-1/sequences/sequence-2" },
      {
        collectionIds: ["collection-1"],
        updatedAt: "server-timestamp",
      }
    );
    expect(mocks.transaction.update).toHaveBeenCalledWith(
      { path: "users/user-1/sequences/sequence-3" },
      {
        collectionIds: ["collection-1"],
        updatedAt: "server-timestamp",
      }
    );
  });
});
