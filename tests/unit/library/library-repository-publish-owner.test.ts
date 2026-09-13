import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Publishing is four awaits long — read the owner document, flip its
 * visibility, write the public mirror, touch the collections that reference it
 * — and each step used to resolve the effective user again. An
 * anonymous->Google upgrade or a sign-out in any of those gaps meant reading
 * one user's sequence and writing another's.
 *
 * This exercises the real LibraryRepository against a mocked Firestore SDK and
 * asserts the thing that matters: after the identity switches mid-publish,
 * nothing is written for the new user — no owner document, no public mirror, no
 * collection touch.
 */

const mocks = vi.hoisted(() => ({
  // The live effective uid, swappable mid-operation.
  currentUserId: { value: "user-A" },
  previewReadOnly: { value: false },
  updateDoc: vi.fn(async (_ref: { path: string }, _data?: unknown) => undefined),
  setDoc: vi.fn(async (_ref: { path: string }, _data?: unknown) => undefined),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  syncToPublicIndex: vi.fn(
    async (_sequence: unknown, _ownerId: string) => undefined
  ),
  removeFromPublicIndex: vi.fn(async (_sequenceId: string) => undefined),
  /** Sequence documents by "<uid>/<sequenceId>". */
  sequences: new Map<string, Record<string, unknown>>(),
  /** Resolves the pending owner-document read, so a swap can land mid-publish. */
  releaseRead: null as (() => void) | null,
  holdRead: { value: false },
}));

vi.mock("firebase/firestore", () => ({
  collection: vi.fn((_db: unknown, path: string) => ({ path })),
  doc: vi.fn((_db: unknown, path: string) => ({ path })),
  getDoc: mocks.getDoc,
  getDocs: mocks.getDocs,
  setDoc: mocks.setDoc,
  updateDoc: mocks.updateDoc,
  deleteDoc: vi.fn(),
  query: vi.fn((value: unknown) => value),
  orderBy: vi.fn(),
  where: vi.fn(),
  limit: vi.fn(),
  startAfter: vi.fn(),
  documentId: vi.fn(),
  onSnapshot: vi.fn(),
  serverTimestamp: vi.fn(() => "server-timestamp"),
  increment: vi.fn((value: number) => ({ incrementBy: value })),
  getCountFromServer: vi.fn(),
  writeBatch: vi.fn(() => ({
    set: vi.fn(),
    delete: vi.fn(),
    update: vi.fn(),
    commit: vi.fn(),
  })),
}));
vi.mock("$lib/shared/auth/firebase", () => ({
  getFirestoreInstance: vi.fn().mockResolvedValue({}),
  getAuthInstance: vi.fn(async () => ({ currentUser: null })),
}));
vi.mock("$lib/shared/auth/state/auth-state.svelte", () => ({
  authState: {
    get effectiveUserId() {
      return mocks.currentUserId.value;
    },
    get user() {
      return { uid: mocks.currentUserId.value };
    },
  },
}));
vi.mock("$lib/shared/debug/state/user-preview-state.svelte", () => ({
  isPreviewReadOnly: () => mocks.previewReadOnly.value,
}));
vi.mock("$lib/shared/application/get-error-handler", () => ({
  getErrorHandler: () => ({ showUserError: vi.fn() }),
}));
vi.mock("$lib/shared/toast/state/toast-state.svelte", () => ({
  toast: { info: vi.fn(), error: vi.fn() },
}));
vi.mock("$lib/shared/offline/state/sync-status-state.svelte", () => ({
  trackWrite: (operation: () => Promise<unknown>) => operation(),
}));
vi.mock("$lib/shared/foundation/services/sequence-hydrator", () => ({
  hydrate: (sequence: unknown) => sequence,
  ensureComposition: () => ({}),
}));
vi.mock("$lib/shared/firestore", () => ({
  firestoreGet: vi.fn(),
  firestoreList: vi.fn(),
  // The owner-document read the publish starts with. Held open on demand so the
  // identity can change while it is in flight.
  firestoreGetDetailed: vi.fn(async (collectionPath: string, id: string) => {
    if (mocks.holdRead.value) {
      mocks.holdRead.value = false;
      await new Promise<void>((resolve) => {
        mocks.releaseRead = resolve;
      });
    }
    const uid = collectionPath.split("/")[1] ?? "";
    const data = mocks.sequences.get(`${uid}/${id}`);
    return data
      ? { status: "found", data: { ...data, id } }
      : { status: "absent" };
  }),
  stripUndefined: (value: Record<string, unknown>) =>
    Object.fromEntries(
      Object.entries(value).filter(([, fieldValue]) => fieldValue !== undefined)
    ),
}));
vi.mock("$lib/shared/create/services/orientation-cycle-detector", () => ({
  detectOrientationCycle: vi.fn(),
}));
vi.mock("$lib/shared/library/services/sequence-content-hasher", () => ({
  computeHash: vi.fn().mockResolvedValue("content-hash"),
  CONTENT_HASH_VERSION: 1,
  HASH_VERSION_V1: 1,
}));
vi.mock("$lib/shared/library/services/fork-decision", () => ({
  decideFork: vi.fn(),
}));
vi.mock("$lib/shared/library/get-tag-migrator", () => ({
  getTagMigrator: () =>
    vi.fn().mockResolvedValue({ sequenceTags: [], tagIds: [] }),
}));
vi.mock("$lib/shared/library/library-events", () => ({
  notifyLibraryMutated: vi.fn(),
  notifyLibrarySequenceAdded: vi.fn(),
  notifyLibrarySequenceUpdated: vi.fn(),
}));
vi.mock("$lib/shared/library/services/library-recycle-bin", () => ({
  LibraryRecycleBin: class {},
}));
vi.mock("$lib/shared/library/services/library-batch-operations", () => ({
  LibraryBatchOperations: class {},
}));

import { LibraryRepository } from "$lib/shared/library/services/library-repository";

function makeRepository(): LibraryRepository {
  return new LibraryRepository({
    syncToPublicIndex: mocks.syncToPublicIndex,
    removeFromPublicIndex: mocks.removeFromPublicIndex,
  } as never);
}

function ownerSequence(overrides: Record<string, unknown> = {}) {
  return {
    id: "seq-1",
    name: "A",
    word: "A",
    steps: [{ letter: "A" }, { letter: "B" }, { letter: "C" }, { letter: "D" }],
    stepPairings: [{}, {}, {}, {}],
    thumbnails: [],
    visibility: "private",
    collectionIds: ["collection-1"],
    metadata: { length: 4 },
    ...overrides,
  };
}

/** Every Firestore path written during the operation. */
function writtenPaths(): string[] {
  return [
    ...mocks.updateDoc.mock.calls.map((call) => call[0].path),
    ...mocks.setDoc.mock.calls.map((call) => call[0].path),
  ];
}

describe("publishSequence owner chain", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sequences.clear();
    mocks.currentUserId.value = "user-A";
    mocks.previewReadOnly.value = false;
    mocks.holdRead.value = false;
    mocks.releaseRead = null;
    // Both users own a sequence with the same id — word-derived ids collide
    // across libraries, which is what makes the swap dangerous rather than
    // merely wrong.
    mocks.sequences.set("user-A/seq-1", ownerSequence());
    mocks.sequences.set("user-B/seq-1", ownerSequence({ name: "B's" }));
  });

  it("writes nothing for the new user when the identity switches mid-publish", async () => {
    const repository = makeRepository();
    mocks.holdRead.value = true;

    const publishing = repository.publishSequence("seq-1", "user-A");
    const settled = publishing.then(
      () => "resolved",
      (error: Error) => error
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    // The anonymous->Google upgrade lands while the owner read is in flight.
    mocks.currentUserId.value = "user-B";
    mocks.releaseRead?.();

    const outcome = await settled;

    // The headline: not one document of the user who arrived mid-operation.
    expect(
      mocks.syncToPublicIndex.mock.calls.map((call) => call[1])
    ).toEqual([]);
    expect(writtenPaths().filter((path) => path.includes("user-B"))).toEqual([]);
    expect(mocks.updateDoc).not.toHaveBeenCalled();
    expect(outcome).toBeInstanceOf(Error);
    expect((outcome as Error).message).toMatch(/signed-in user changed/i);
  });

  it("writes nothing at all when the identity switches before the mirror is written", async () => {
    // Already public: the repair path goes straight to the mirror and the
    // collection touch, with no visibility write in between.
    mocks.sequences.set("user-A/seq-1", ownerSequence({ visibility: "public" }));
    const repository = makeRepository();
    mocks.holdRead.value = true;

    const publishing = repository.publishSequence("seq-1", "user-A");
    const settled = publishing.then(
      () => "resolved",
      (error: Error) => error
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    mocks.currentUserId.value = "user-B";
    mocks.releaseRead?.();
    const outcome = await settled;

    expect(outcome).toBeInstanceOf(Error);
    expect(mocks.syncToPublicIndex).not.toHaveBeenCalled();
    expect(writtenPaths()).toEqual([]);
  });

  it("publishes as the captured owner when the identity holds", async () => {
    const repository = makeRepository();

    await repository.publishSequence("seq-1", "user-A");

    // The visibility write went to the captured owner's document.
    expect(
      mocks.updateDoc.mock.calls.map((call) => call[0].path)
    ).toContain("users/user-A/sequences/seq-1");
    expect(writtenPaths().filter((path) => path.includes("user-B"))).toEqual([]);
    expect(mocks.syncToPublicIndex).toHaveBeenCalledWith(
      expect.objectContaining({ id: "seq-1" }),
      "user-A"
    );
    // And the collection touch used the same owner.
    expect(
      mocks.updateDoc.mock.calls.map((call) => call[0].path)
    ).toContain("users/user-A/collections/collection-1");
  });

  it("refuses an owner that is not the signed-in user", async () => {
    const repository = makeRepository();

    await expect(
      repository.publishSequence("seq-1", "user-B")
    ).rejects.toThrow(/signed-in user changed/i);
    expect(writtenPaths()).toEqual([]);
    expect(mocks.syncToPublicIndex).not.toHaveBeenCalled();
  });

  it("still resolves the live user when no owner is passed", async () => {
    const repository = makeRepository();

    await repository.publishSequence("seq-1");

    expect(
      mocks.updateDoc.mock.calls.map((call) => call[0].path)
    ).toContain("users/user-A/sequences/seq-1");
  });
});
