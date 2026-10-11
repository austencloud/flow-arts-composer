import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const transaction = {
    get: vi.fn(),
    update: vi.fn(),
  };

  return {
    transaction,
    runTransaction: vi.fn(),
    toastError: vi.fn(),
  };
});

vi.mock("firebase/firestore", () => ({
  collection: vi.fn((_db: unknown, path: string) => ({ path })),
  doc: vi.fn((_db: unknown, path: string) => ({ path })),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  query: vi.fn((value: unknown) => value),
  orderBy: vi.fn(),
  onSnapshot: vi.fn(),
  runTransaction: mocks.runTransaction,
  serverTimestamp: vi.fn(() => "server-timestamp"),
  writeBatch: vi.fn(() => ({
    set: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    commit: vi.fn(),
  })),
  arrayRemove: vi.fn(),
}));
vi.mock("#lib/shared/auth/firebase.js", () => ({
  getFirestoreInstance: vi.fn().mockResolvedValue({}),
}));
vi.mock("#lib/shared/toast/state/toast-state.svelte.js", () => ({
  toast: { error: mocks.toastError },
}));
vi.mock("#lib/shared/analytics/services/posthog.js", () => ({
  captureEvent: vi.fn(),
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
      kind: data["kind"] ?? "manual",
      sequenceIds: data["sequenceIds"] ?? [],
      sequenceCount: data["sequenceCount"] ?? 0,
      isPublic: false,
      sortOrder: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
    batchFetchSequences: vi.fn(),
    batchFetchPublicSequences: vi.fn(),
    CollectionError,
  };
});

import { removeSequencesFromCollection } from "#lib/shared/library/services/collection-manager.js";

describe("collection-manager bulk removal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.runTransaction.mockImplementation(
      async (
        _firestore: unknown,
        operation: (transaction: typeof mocks.transaction) => Promise<unknown>
      ) => operation(mocks.transaction)
    );
  });

  it("updates collection membership and every available reverse membership", async () => {
    const collectionData = {
      name: "Poi Combos",
      kind: "manual",
      sequenceIds: ["sequence-1", "sequence-2", "keep"],
      sequenceCount: 3,
    };
    mocks.transaction.get.mockImplementation(async (ref: { path: string }) => {
      if (ref.path.endsWith("/collections/collection-1")) {
        return {
          exists: () => true,
          data: () => collectionData,
        };
      }
      if (ref.path.endsWith("/sequences/sequence-1")) {
        return {
          exists: () => true,
          data: () => ({ collectionIds: ["collection-1", "other"] }),
        };
      }
      return { exists: () => false, data: () => ({}) };
    });

    const result = await removeSequencesFromCollection("collection-1", [
      "sequence-1",
      "sequence-2",
      "missing",
      "sequence-2",
    ]);

    expect(result).toEqual({
      requestedCount: 3,
      removedSequenceIds: ["sequence-1", "sequence-2"],
      alreadyAbsentSequenceIds: ["missing"],
      unprocessedSequenceIds: [],
    });
    expect(mocks.transaction.update).toHaveBeenCalledWith(
      { path: "users/user-1/collections/collection-1" },
      {
        sequenceIds: ["keep"],
        sequenceCount: 1,
        updatedAt: "server-timestamp",
      }
    );
    expect(mocks.transaction.update).toHaveBeenCalledWith(
      { path: "users/user-1/sequences/sequence-1" },
      {
        collectionIds: ["other"],
        updatedAt: "server-timestamp",
      }
    );
    expect(mocks.transaction.update).not.toHaveBeenCalledWith(
      { path: "users/user-1/sequences/sequence-2" },
      expect.anything()
    );
  });

  it("returns committed ids when a later Firestore chunk fails", async () => {
    const sequenceIds = Array.from(
      { length: 201 },
      (_, index) => `sequence-${index}`
    );
    const collectionData = {
      name: "Poi Combos",
      kind: "manual",
      sequenceIds,
      sequenceCount: sequenceIds.length,
    };
    mocks.transaction.get.mockImplementation(async (ref: { path: string }) =>
      ref.path.endsWith("/collections/collection-1")
        ? {
            exists: () => true,
            data: () => collectionData,
          }
        : { exists: () => false, data: () => ({}) }
    );
    let transactionCount = 0;
    mocks.runTransaction.mockImplementation(
      async (
        _firestore: unknown,
        operation: (transaction: typeof mocks.transaction) => Promise<unknown>
      ) => {
        transactionCount++;
        if (transactionCount === 2) throw new Error("network interrupted");
        return operation(mocks.transaction);
      }
    );
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const result = await removeSequencesFromCollection(
      "collection-1",
      sequenceIds
    );

    consoleError.mockRestore();
    expect(result.removedSequenceIds).toEqual(sequenceIds.slice(0, 200));
    expect(result.alreadyAbsentSequenceIds).toEqual([]);
    expect(result.unprocessedSequenceIds).toEqual(["sequence-200"]);
    expect(mocks.runTransaction).toHaveBeenCalledTimes(2);
    expect(mocks.toastError).not.toHaveBeenCalled();
  });
});
