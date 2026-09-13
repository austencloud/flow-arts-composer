import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Deleting a collection has to survive its own membership.
 *
 * Firestore rejects an entire commit when one `update` targets a document that
 * does not exist, and refuses more than 500 writes per commit. A collection
 * legitimately holds sequences with no owner document (a saved public sequence
 * from another user — the add/remove paths explicitly allow it) and can hold up
 * to 500 members, so both limits are reachable from the UI. The fake below
 * enforces exactly those two Firestore rules so the failure is reproducible
 * without an emulator.
 */

const mocks = vi.hoisted(() => {
  const store = new Map<string, Record<string, unknown>>();
  const commits: number[] = [];
  const ARRAY_REMOVE = Symbol("arrayRemove");

  type Op =
    | { kind: "update"; path: string; data: Record<string, unknown> }
    | { kind: "set"; path: string; data: Record<string, unknown> }
    | { kind: "delete"; path: string };

  function makeBatch() {
    const ops: Op[] = [];
    return {
      ops,
      update: (ref: { path: string }, data: Record<string, unknown>) =>
        void ops.push({ kind: "update", path: ref.path, data }),
      set: (ref: { path: string }, data: Record<string, unknown>) =>
        void ops.push({ kind: "set", path: ref.path, data }),
      delete: (ref: { path: string }) =>
        void ops.push({ kind: "delete", path: ref.path }),
      commit: async () => {
        commits.push(ops.length);
        // Firestore: "Maximum 500 writes allowed per request".
        if (ops.length > 500) {
          throw new Error(
            `Transaction too big. Decrease transaction size. (${ops.length} writes)`
          );
        }
        // Firestore: update() requires the document to exist.
        for (const op of ops) {
          if (op.kind === "update" && !store.has(op.path)) {
            throw new Error(`No document to update: ${op.path}`);
          }
        }
        for (const op of ops) {
          if (op.kind === "delete") {
            store.delete(op.path);
            continue;
          }
          const current = store.get(op.path) ?? {};
          const next = { ...current };
          for (const [field, value] of Object.entries(op.data)) {
            if (
              value &&
              typeof value === "object" &&
              (value as { marker?: symbol }).marker === ARRAY_REMOVE
            ) {
              const removed = (value as { value: unknown }).value;
              next[field] = (
                Array.isArray(current[field]) ? current[field] : []
              ).filter((entry: unknown) => entry !== removed);
              continue;
            }
            next[field] = value;
          }
          store.set(op.path, next);
        }
      },
    };
  }

  return { store, commits, ARRAY_REMOVE, makeBatch };
});

vi.mock("firebase/firestore", () => ({
  collection: vi.fn((_db: unknown, path: string) => ({ path })),
  doc: vi.fn((_db: unknown, path: string) => ({ path })),
  getDoc: vi.fn(async (ref: { path: string }) => ({
    exists: () => mocks.store.has(ref.path),
    data: () => mocks.store.get(ref.path) ?? {},
  })),
  getDocs: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  query: vi.fn((value: unknown) => value),
  where: vi.fn(),
  documentId: vi.fn(),
  orderBy: vi.fn(),
  onSnapshot: vi.fn(),
  runTransaction: vi.fn(),
  serverTimestamp: vi.fn(() => "server-timestamp"),
  writeBatch: vi.fn(() => mocks.makeBatch()),
  arrayRemove: vi.fn((value: unknown) => ({
    marker: mocks.ARRAY_REMOVE,
    value,
  })),
}));
vi.mock("$lib/shared/auth/firebase", () => ({
  getFirestoreInstance: vi.fn().mockResolvedValue({}),
}));
vi.mock("$lib/shared/toast/state/toast-state.svelte", () => ({
  toast: { error: vi.fn() },
}));
vi.mock("$lib/shared/analytics/services/posthog", () => ({
  captureEvent: vi.fn(),
}));
vi.mock("$lib/shared/library/services/collection-firestore-mapper", () => {
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
      systemType: data["systemType"],
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
    batchFetchSequences: vi.fn(),
    batchFetchPublicSequences: vi.fn(),
    // The real helper chunks a documentId `in` query; against this fake store
    // its observable contract is "which of these ids have a document".
    filterExistingSequenceIds: vi.fn(
      async (_db: unknown, userId: string, ids: readonly string[]) =>
        new Set(
          ids.filter((id) => mocks.store.has(`users/${userId}/sequences/${id}`))
        )
    ),
    CollectionError,
  };
});

import { deleteCollection } from "$lib/shared/library/services/collection-manager";

const COLLECTION_PATH = "users/user-1/collections/collection-1";

function seedCollection(sequenceIds: string[], ownedIds: string[]): void {
  mocks.store.set(COLLECTION_PATH, {
    name: "Poi Combos",
    kind: "manual",
    sequenceIds,
    sequenceCount: sequenceIds.length,
  });
  for (const id of ownedIds) {
    mocks.store.set(`users/user-1/sequences/${id}`, {
      collectionIds: ["collection-1", "other"],
    });
  }
}

describe("deleteCollection", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.store.clear();
    mocks.commits.length = 0;
    mocks.store.set("users/user-1", {});
    // One case swaps in a failing batch; put the working one back so test
    // order can't decide the outcome.
    const { writeBatch } = await import("firebase/firestore");
    vi.mocked(writeBatch).mockImplementation(
      () => mocks.makeBatch() as unknown as ReturnType<typeof writeBatch>
    );
  });

  it("deletes a collection holding a saved public sequence the user doesn't own", async () => {
    seedCollection(["own-1", "foreign-1", "own-2"], ["own-1", "own-2"]);

    await deleteCollection("collection-1");

    expect(mocks.store.has(COLLECTION_PATH)).toBe(false);
    expect(mocks.store.get("users/user-1/sequences/own-1")).toEqual({
      collectionIds: ["other"],
    });
    expect(mocks.store.get("users/user-1/sequences/own-2")).toEqual({
      collectionIds: ["other"],
    });
  });

  it("deletes a full collection without exceeding Firestore's per-commit write ceiling", async () => {
    const ids = Array.from({ length: 500 }, (_, index) => `sequence-${index}`);
    seedCollection(ids, ids);

    await deleteCollection("collection-1");

    expect(mocks.store.has(COLLECTION_PATH)).toBe(false);
    expect(Math.max(...mocks.commits)).toBeLessThanOrEqual(500);
    expect(mocks.store.get("users/user-1/sequences/sequence-499")).toEqual({
      collectionIds: ["other"],
    });
  });

  it("leaves the collection deletable when reverse-membership cleanup fails part-way", async () => {
    const ids = Array.from({ length: 400 }, (_, index) => `sequence-${index}`);
    seedCollection(ids, ids);
    // The owner document for a later chunk disappears between the existence
    // read and its commit (a concurrent library delete).
    const { writeBatch } = await import("firebase/firestore");
    let batchCount = 0;
    vi.mocked(writeBatch).mockImplementation(() => {
      batchCount += 1;
      const batch = mocks.makeBatch();
      if (batchCount === 2) {
        return {
          ...batch,
          commit: async () => {
            throw new Error("network interrupted");
          },
        } as unknown as ReturnType<typeof writeBatch>;
      }
      return batch as unknown as ReturnType<typeof writeBatch>;
    });
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    await expect(deleteCollection("collection-1")).rejects.toThrow();
    consoleError.mockRestore();

    // The folder is still there, so the user can retry; arrayRemove makes the
    // already-cleaned chunk a no-op the second time.
    expect(mocks.store.has(COLLECTION_PATH)).toBe(true);
    expect(mocks.store.get("users/user-1/sequences/sequence-0")).toEqual({
      collectionIds: ["other"],
    });
  });

  it("refuses to delete a system collection", async () => {
    mocks.store.set(COLLECTION_PATH, {
      name: "Favorites",
      kind: "manual",
      systemType: "favorites",
      sequenceIds: [],
      sequenceCount: 0,
    });

    await expect(deleteCollection("collection-1")).rejects.toThrow();
    expect(mocks.store.has(COLLECTION_PATH)).toBe(true);
  });
});
