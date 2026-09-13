import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Publishing a member of a public collection reaches outside collection-manager:
 * `publishSequence` takes no owner argument and resolves the effective user
 * itself, several times over. If the uid swaps while it runs, the membership
 * write that follows would land under the uid this operation captured while the
 * publish acted on somebody else's same-id sequence. It has to stop instead.
 */

const mocks = vi.hoisted(() => {
  const store = new Map<string, Record<string, unknown>>();
  // Successive effective uids; the last entry repeats once reached.
  const uids: string[] = ["user-1"];
  let releasePublish: (() => void) | null = null;
  const publishedIds: string[] = [];

  return {
    store,
    uids,
    publishedIds,
    publish: vi.fn(async (sequenceId: string) => {
      publishedIds.push(sequenceId);
      await new Promise<void>((resolve) => {
        releasePublish = resolve;
      });
    }),
    finishPublish: () => {
      if (!releasePublish) throw new Error("no publish in flight");
      releasePublish();
      releasePublish = null;
    },
    runTransaction: vi.fn(),
  };
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
  runTransaction: mocks.runTransaction,
  serverTimestamp: vi.fn(() => "server-timestamp"),
  writeBatch: vi.fn(),
  arrayRemove: vi.fn(),
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
vi.mock("$lib/shared/library/get-library-repository", () => ({
  getLibraryRepository: () => ({ publishSequence: mocks.publish }),
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
    getAuthenticatedUserId: vi.fn(() =>
      mocks.uids.length > 1 ? mocks.uids.shift()! : mocks.uids[0]!
    ),
    mapDocToCollection: (data: Record<string, unknown>, id: string) => ({
      id,
      name: data["name"] ?? "",
      ownerId: data["ownerId"] ?? "user-1",
      kind: data["kind"] ?? "manual",
      sequenceIds: data["sequenceIds"] ?? [],
      sequenceCount: data["sequenceCount"] ?? 0,
      isPublic: data["isPublic"] ?? false,
      sortOrder: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
    batchFetchSequences: vi.fn(),
    batchFetchPublicSequences: vi.fn(),
    filterExistingSequenceIds: vi.fn(),
    CollectionError,
  };
});

import { addSequenceToCollection } from "$lib/shared/library/services/collection-manager";

/** Several awaits stand between the call and the publish; wait for the state. */
async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 100 && !predicate(); attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  if (!predicate()) throw new Error("condition never became true");
}

describe("public collection membership across an owner switch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.store.clear();
    mocks.publishedIds.length = 0;
    mocks.uids.splice(0, mocks.uids.length, "user-1");
    mocks.store.set("users/user-1/collections/public-1", {
      name: "Community set",
      kind: "manual",
      isPublic: true,
      sequenceIds: [],
      sequenceCount: 0,
    });
    mocks.store.set("users/user-1/sequences/seq-1", { visibility: "private" });
  });

  it("refuses the membership write when the signed-in user changes during publish", async () => {
    // One call captures the write user, one passes the pre-publish check, and
    // every call after that sees the swapped-in user.
    mocks.uids.splice(0, mocks.uids.length, "user-1", "user-1", "user-2");
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const adding = addSequenceToCollection("public-1", "seq-1");
    const settled = adding.then(
      () => "resolved",
      (error: Error) => error
    );
    await waitFor(() => mocks.publishedIds.length > 0);
    expect(mocks.publishedIds).toEqual(["seq-1"]);

    mocks.finishPublish();
    const outcome = await settled;
    consoleError.mockRestore();

    expect(outcome).toBeInstanceOf(Error);
    expect((outcome as Error).message).toMatch(/signed-in user changed/i);
    // Nothing was written under the captured uid after the swap.
    expect(mocks.runTransaction).not.toHaveBeenCalled();
  });

  it("completes normally when the signed-in user does not change", async () => {
    mocks.runTransaction.mockResolvedValue(undefined);

    const adding = addSequenceToCollection("public-1", "seq-1");
    await waitFor(() => mocks.publishedIds.length > 0);
    mocks.finishPublish();
    await adding;

    expect(mocks.publishedIds).toEqual(["seq-1"]);
    expect(mocks.runTransaction).toHaveBeenCalledTimes(1);
  });
});
