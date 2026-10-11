import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A guest's first save MINTS users/{uid} — createOrUpdateUserDocument
 * deliberately skips anonymous sessions outside PROD, so this repository is the
 * doc's creator. An identity-less parent reads as a brand-new full account and
 * pages an admin "New user signed up: Someone". The activity write must carry
 * the guest flag while server-owned counters are reconciled by Cloud Functions.
 */

const firestoreMocks = vi.hoisted(() => {
  const batch = { set: vi.fn(), delete: vi.fn(), commit: vi.fn() };
  return {
    batch,
    getDoc: vi.fn(),
    getDocs: vi.fn(),
    updateDoc: vi.fn(),
    currentUser: { value: null as unknown },
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
  getAuthInstance: vi.fn(async () => ({
    get currentUser() {
      return firestoreMocks.currentUser.value;
    },
  })),
}));
vi.mock("#lib/shared/auth/state/auth-state.svelte.js", () => ({
  authState: {
    effectiveUserId: "user-1",
    user: { uid: "user-1", displayName: "Test User" },
  },
}));
vi.mock("#lib/shared/application/get-error-handler.js", () => ({
  getErrorHandler: () => ({ showUserError: vi.fn() }),
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
  firestoreGet: vi.fn(),
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
  notifyLibraryMutated: vi.fn(),
  notifyLibrarySequenceAdded: vi.fn(),
  notifyLibrarySequenceUpdated: vi.fn(),
}));
vi.mock("#lib/shared/library/services/library-recycle-bin.js", () => ({
  LibraryRecycleBin: class {},
}));
vi.mock("#lib/shared/library/services/library-batch-operations.js", () => ({
  LibraryBatchOperations: class {},
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

/** The users/{uid} write is the second batch.set of a save. */
async function profileWrite(): Promise<Record<string, unknown>> {
  const repository = new LibraryRepository(null as never);
  await repository.saveSequence(makeSequence(), { visibility: "private" });
  return firestoreMocks.batch.set.mock.calls[1]?.[1] as Record<string, unknown>;
}

describe("LibraryRepository profile write carries the guest flag", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    firestoreMocks.currentUser.value = null;
    firestoreMocks.getDoc.mockResolvedValue({
      exists: () => false,
      data: () => undefined,
    });
    firestoreMocks.getDocs.mockResolvedValue({ empty: true, docs: [] });
    firestoreMocks.batch.commit.mockResolvedValue(undefined);
    firestoreMocks.updateDoc.mockResolvedValue(undefined);
  });

  it("tags a guest's save so the minted doc is never identity-less", async () => {
    firestoreMocks.currentUser.value = { uid: "user-1", isAnonymous: true };

    expect(await profileWrite()).toEqual({
      publicProfileVersion: 2,
      lastActivityDate: "server-timestamp",
      isAnonymous: true,
    });
  });

  it("records a full account as not anonymous", async () => {
    firestoreMocks.currentUser.value = { uid: "user-1", isAnonymous: false };

    expect(await profileWrite()).toEqual({
      publicProfileVersion: 2,
      lastActivityDate: "server-timestamp",
      isAnonymous: false,
    });
  });

  it("omits the flag rather than guessing when there is no auth user", async () => {
    firestoreMocks.currentUser.value = null;

    expect(await profileWrite()).toEqual({
      publicProfileVersion: 2,
      lastActivityDate: "server-timestamp",
    });
  });
});
