import { beforeEach, describe, expect, it, vi } from "vitest";

const firestoreMocks = vi.hoisted(() => {
  const batch = {
    set: vi.fn(),
    delete: vi.fn(),
    commit: vi.fn(),
  };

  return {
    batch,
    getDoc: vi.fn(),
    getDocs: vi.fn(),
    updateDoc: vi.fn(),
    firestoreGet: vi.fn(),
    notifyLibrarySequenceUpdated: vi.fn(),
    notifyLibraryMutated: vi.fn(),
    showUserError: vi.fn(),
    deleteSequences: vi.fn(),
    deleteLocalSequences: vi.fn(),
    removeSavedSequenceIds: vi.fn(),
    captureEvent: vi.fn(),
    captureException: vi.fn(),
    previewReadOnly: false,
  };
});

vi.mock("firebase/firestore", () => ({
  collection: vi.fn((_db: unknown, path: string) => ({ path })),
  doc: vi.fn((_db: unknown, path: string) => ({ path })),
  getDoc: firestoreMocks.getDoc,
  getDocs: firestoreMocks.getDocs,
  setDoc: vi.fn(),
  updateDoc: firestoreMocks.updateDoc,
  deleteDoc: vi.fn(),
  query: vi.fn((value: unknown) => value),
  orderBy: vi.fn(),
  where: vi.fn(),
  limit: vi.fn(),
  onSnapshot: vi.fn(),
  serverTimestamp: vi.fn(() => "server-timestamp"),
  increment: vi.fn((value: number) => ({ incrementBy: value })),
  getCountFromServer: vi.fn(),
  writeBatch: vi.fn(() => firestoreMocks.batch),
}));

vi.mock("#lib/shared/auth/firebase.js", () => ({
  getFirestoreInstance: vi.fn().mockResolvedValue({}),
}));
vi.mock("#lib/shared/auth/state/auth-state.svelte.js", () => ({
  authState: {
    effectiveUserId: "user-1",
    user: { uid: "user-1", displayName: "Test User" },
    isFullAccount: true,
  },
}));
vi.mock("#lib/shared/debug/state/user-preview-state.svelte.js", () => ({
  isPreviewReadOnly: () => firestoreMocks.previewReadOnly,
}));
vi.mock("#lib/shared/application/get-error-handler.js", () => ({
  getErrorHandler: () => ({ showUserError: firestoreMocks.showUserError }),
}));
vi.mock("#lib/shared/toast/state/toast-state.svelte.ts", () => ({
  toast: { info: vi.fn(), error: vi.fn() },
}));
vi.mock("#lib/shared/offline/state/sync-status-state.svelte.js", () => ({
  trackWrite: (operation: () => Promise<unknown>) => operation(),
}));
vi.mock("#lib/shared/foundation/services/sequence-hydrator.js", () => ({
  hydrate: (sequence: unknown) => sequence,
  ensureComposition: (sequence: unknown) => sequence,
}));
vi.mock("#lib/shared/firestore/index.js", () => ({
  firestoreGet: firestoreMocks.firestoreGet,
  // The repository reads through firestoreGetDetailed so it can tell "absent"
  // apart from "we never reached the server". Derive it from the same stub the
  // tests already arrange, so a resolved value still reads as found.
  firestoreGetDetailed: vi.fn(async (...args: unknown[]) => {
    const data = await (
      firestoreMocks.firestoreGet as (...a: unknown[]) => Promise<unknown>
    )(...args);
    return data ? { status: "found", data } : { status: "absent" };
  }),
  firestoreList: vi.fn(),
  stripUndefined: (value: Record<string, unknown>) =>
    Object.fromEntries(
      Object.entries(value).filter(([, fieldValue]) => fieldValue !== undefined)
    ),
}));
vi.mock("#lib/shared/create/services/orientation-cycle-detector.js", () => ({
  detectOrientationCycle: vi.fn(),
}));
vi.mock("#lib/shared/library/services/sequence-content-hasher.js", () => ({
  computeHash: vi.fn().mockResolvedValue("content-hash"),
  CONTENT_HASH_VERSION: 1,
  HASH_VERSION_V1: 1,
}));
vi.mock("#lib/shared/library/services/fork-decision.js", () => ({
  decideFork: vi.fn(),
}));
vi.mock("#lib/shared/library/get-tag-migrator.js", () => ({
  getTagMigrator: () =>
    vi.fn().mockResolvedValue({ sequenceTags: [], tagIds: [] }),
}));
vi.mock("#lib/shared/library/library-events.js", () => ({
  notifyLibraryMutated: firestoreMocks.notifyLibraryMutated,
  notifyLibrarySequenceAdded: vi.fn(),
  notifyLibrarySequenceUpdated: firestoreMocks.notifyLibrarySequenceUpdated,
}));
vi.mock("#lib/shared/library/services/library-recycle-bin.js", () => ({
  LibraryRecycleBin: class {},
}));
vi.mock("#lib/shared/library/services/library-batch-operations.js", () => ({
  LibraryBatchOperations: class {
    deleteSequences = firestoreMocks.deleteSequences;
  },
}));
vi.mock(
  "#lib/shared/persistence/services/dexie-persistence-service.js",
  () => ({
    deleteSequences: firestoreMocks.deleteLocalSequences,
  })
);
vi.mock("#lib/shared/library/services/saved-sequence-ledger.js", () => ({
  removeSavedSequenceIds: firestoreMocks.removeSavedSequenceIds,
}));
vi.mock("#lib/shared/analytics/services/posthog.js", () => ({
  captureEvent: firestoreMocks.captureEvent,
  captureException: firestoreMocks.captureException,
}));

import { LibraryRepository } from "#lib/shared/library/services/library-repository.js";

function makeSequence() {
  return {
    id: "sequence-1",
    name: "A",
    word: "A",
    steps: [{ letter: "A" }],
    stepPairings: [{}],
    thumbnails: [],
    isFavorite: false,
    isCircular: false,
    tags: [],
    metadata: { length: 0 },
  } as never;
}

describe("LibraryRepository.saveSequence atomic persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    firestoreMocks.previewReadOnly = false;
    firestoreMocks.updateDoc.mockResolvedValue(undefined);
    firestoreMocks.getDoc.mockResolvedValue({
      exists: () => false,
      data: () => undefined,
    });
    firestoreMocks.getDocs.mockResolvedValue({
      empty: true,
      docs: [],
    });
    firestoreMocks.batch.commit.mockResolvedValue(undefined);
    firestoreMocks.deleteSequences.mockResolvedValue([
      {
        sequenceId: "sequence-1",
        status: "ok",
        deletion: {
          ownerDeleted: true,
          publicDeleted: true,
          claimsDeleted: 1,
          collectionsUpdated: 2,
        },
      },
    ]);
    firestoreMocks.deleteLocalSequences.mockResolvedValue(undefined);
  });

  it("rejects preview writes before a batch operation can reach Firestore", async () => {
    firestoreMocks.previewReadOnly = true;
    const repository = new LibraryRepository(null as never);

    await expect(
      repository.deleteSequences(["sequence-1"])
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(firestoreMocks.deleteSequences).not.toHaveBeenCalled();
  });

  it("commits the sequence and profile activity patch in one batch", async () => {
    const repository = new LibraryRepository(null as never);

    await repository.saveSequence(makeSequence(), { visibility: "private" });

    expect(firestoreMocks.batch.set).toHaveBeenCalledTimes(2);
    const sequenceWrite = firestoreMocks.batch.set.mock.calls[0];
    expect(sequenceWrite[0]).toEqual({
      path: "users/user-1/sequences/sequence-1",
    });
    expect(sequenceWrite[1]).toMatchObject({
      sequenceLength: 1,
      metadata: { length: 1 },
    });

    expect(firestoreMocks.batch.set.mock.calls[1]).toEqual([
      { path: "users/user-1" },
      {
        publicProfileVersion: 2,
        lastActivityDate: "server-timestamp",
      },
      { merge: true },
    ]);
    expect(firestoreMocks.batch.commit).toHaveBeenCalledOnce();
  });

  it("rejects the cloud sync when the atomic batch fails", async () => {
    firestoreMocks.batch.commit.mockRejectedValueOnce(
      new Error("permission-denied")
    );
    const repository = new LibraryRepository(null as never);

    await expect(
      repository.saveSequence(makeSequence(), { visibility: "private" })
    ).rejects.toMatchObject({ code: "NETWORK", sequenceId: "sequence-1" });
    expect(firestoreMocks.showUserError).toHaveBeenCalledOnce();
  });

  it("attaches a delayed thumbnail with a field-level write", async () => {
    const publicIndexSyncer = {
      syncToPublicIndex: vi.fn().mockResolvedValue(undefined),
      updateThumbnails: vi.fn().mockResolvedValue(undefined),
      removeFromPublicIndex: vi.fn(),
    };
    firestoreMocks.firestoreGet.mockResolvedValue({
      ...makeSequence(),
      visibility: "public",
      thumbnails: ["https://assets.example.com/old.png"],
      ownerId: "user-1",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const repository = new LibraryRepository(publicIndexSyncer as never);

    await repository.attachThumbnail(
      "sequence-1",
      "https://assets.example.com/new.png"
    );

    expect(firestoreMocks.updateDoc).toHaveBeenCalledWith(
      { path: "users/user-1/sequences/sequence-1" },
      {
        thumbnails: [
          "https://assets.example.com/new.png",
          "https://assets.example.com/old.png",
        ],
        updatedAt: "server-timestamp",
      }
    );
    expect(firestoreMocks.notifyLibrarySequenceUpdated).toHaveBeenCalledWith(
      "sequence-1",
      {
        thumbnails: [
          "https://assets.example.com/new.png",
          "https://assets.example.com/old.png",
        ],
      }
    );
    expect(publicIndexSyncer.updateThumbnails).toHaveBeenCalledWith(
      "sequence-1",
      [
        "https://assets.example.com/new.png",
        "https://assets.example.com/old.png",
      ]
    );
    expect(publicIndexSyncer.syncToPublicIndex).not.toHaveBeenCalled();
    expect(firestoreMocks.batch.commit).not.toHaveBeenCalled();
  });

  it("uses the complete cloud path and removes the durable local copy", async () => {
    const repository = new LibraryRepository(null as never);

    await repository.deleteSequence("sequence-1");

    expect(firestoreMocks.deleteSequences).toHaveBeenCalledWith(["sequence-1"]);
    expect(firestoreMocks.deleteLocalSequences).toHaveBeenCalledWith([
      "sequence-1",
    ]);
    expect(firestoreMocks.removeSavedSequenceIds).toHaveBeenCalledWith(
      "user-1",
      ["sequence-1"]
    );
    expect(firestoreMocks.captureEvent).toHaveBeenCalledWith(
      "library_sequence_delete_completed",
      expect.objectContaining({
        sequence_count: 1,
        cloud_attempted: true,
        owner_deleted_count: 1,
        public_deleted_count: 1,
        hash_claims_deleted_count: 1,
        collections_updated_count: 2,
        local_deleted_count: 1,
      })
    );
  });

  it("rejects instead of reporting completion when local deletion fails", async () => {
    firestoreMocks.deleteLocalSequences.mockRejectedValueOnce(
      new Error("Dexie unavailable")
    );
    const repository = new LibraryRepository(null as never);

    await expect(
      repository.deleteSequence("sequence-local-failure")
    ).rejects.toMatchObject({ code: "PERSIST_FAILED" });

    expect(firestoreMocks.removeSavedSequenceIds).not.toHaveBeenCalled();
    expect(firestoreMocks.captureEvent).toHaveBeenCalledWith(
      "library_sequence_delete_failed",
      expect.objectContaining({ failure_stage: "local" })
    );
    expect(firestoreMocks.captureEvent).not.toHaveBeenCalledWith(
      "library_sequence_delete_completed",
      expect.anything()
    );
  });
});
