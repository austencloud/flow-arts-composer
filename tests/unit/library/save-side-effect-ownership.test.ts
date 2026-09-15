/**
 * A save's SIDE EFFECTS belong to the account that made the save.
 *
 * The sequence write was fenced first, but a save fans out further: tag
 * creation, and four artifact writes (two hand paths, two solo props). Each of
 * those resolves its own uid from live auth AFTER its own awaits, and each
 * decides a Firestore PATH — `users/{uid}/tags`, `users/{uid}/handPaths`,
 * `users/{uid}/soloProps`. A guest whose sign-in collides with an existing
 * account would otherwise have these land in that account's subtree before
 * they ever consented to the import.
 *
 * The whole chain is covered here, not only the primary write.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const dbPutMock = vi.fn().mockResolvedValue(undefined);
const dbGetMock = vi.fn().mockResolvedValue(undefined);
const dbCountMock = vi.fn().mockResolvedValue(0);
const dbUpdateMock = vi.fn().mockResolvedValue(1);
const createUserTagMock = vi.fn().mockResolvedValue(undefined);
const findTagByNameMock = vi.fn().mockResolvedValue(undefined);
const ledgerIdsMock = vi.fn().mockReturnValue([] as string[]);

vi.mock("$lib/shared/persistence/database/tka-database", () => ({
  db: {
    sequences: {
      put: (...a: unknown[]) => dbPutMock(...a),
      get: (...a: unknown[]) => dbGetMock(...a),
      count: (...a: unknown[]) => dbCountMock(...a),
      update: (...a: unknown[]) => dbUpdateMock(...a),
    },
  },
}));
vi.mock("$lib/shared/library/services/saved-sequence-ledger", () => ({
  recordSavedSequenceId: vi.fn(),
  recordUnownedSequenceId: vi.fn(),
  getSavedSequenceIds: (...a: unknown[]) => ledgerIdsMock(...a),
  getOwnedSequenceIdSet: (...a: unknown[]) =>
    new Set(ledgerIdsMock(...a) as string[]),
  removeSavedSequenceIds: vi.fn(),
}));
vi.mock("$lib/shared/auth/state/auth-state.svelte", () => ({
  authState: {
    isAuthenticated: true,
    isAnonymous: true,
    user: { uid: "guest-current" },
    effectiveUserId: "guest-current" as string | null,
  },
}));
vi.mock("$lib/shared/auth/services/guest-identity", () => ({
  ensureGuestIdentity: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("$lib/shared/auth/state/auth-drawer-state.svelte", () => ({
  authDrawerState: { show: vi.fn(), offerGuestSaveNudge: vi.fn() },
}));
vi.mock("$lib/shared/toast/state/toast-state.svelte.ts", () => ({
  toast: { info: vi.fn(), warning: vi.fn(), error: vi.fn(), success: vi.fn() },
}));
vi.mock("$lib/shared/application/get-error-handler", () => ({
  getErrorHandler: () => ({ showUserError: vi.fn() }),
}));
vi.mock("$lib/shared/render/services/warm-sequence-cells", () => ({
  warmSequenceCells: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("$lib/shared/share/state/image-composition-state.svelte.ts", () => ({
  getImageCompositionManager: () => ({ darkMode: true }),
}));
vi.mock("$lib/features/library/services/tag-manager", () => ({
  findTagByName: (...a: unknown[]) => findTagByNameMock(...a),
  createUserTag: (...a: unknown[]) => createUserTagMock(...a),
}));
vi.mock("$lib/shared/library/services/sequence-content-hasher", () => ({
  computeHash: vi.fn().mockResolvedValue("hash-1"),
}));
vi.mock("$lib/features/library/services/library-sync-retry", () => ({
  markSequenceSyncStatus: vi.fn().mockResolvedValue(undefined),
}));
vi.mock(
  "$lib/shared/library/services/sequence-persistence-coordinator",
  () => ({ clearSequenceDeletionIntent: vi.fn() })
);
vi.mock("$lib/shared/analytics/services/posthog-lifecycle-reporter", () => ({
  reportPostHogLifecycleEvent: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("$lib/features/library/state/library-state.svelte", () => ({
  libraryState: { loadSequences: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock("$lib/shared/settings/state/settings-state.svelte", () => ({
  settingsService: {
    settings: {
      leftPropType: "club",
      rightPropType: "club",
      catDogMode: false,
    },
  },
}));

const { LibrarySaveService } =
  await import("$lib/features/library/services/library-save-service");
const { authState } = await import("$lib/shared/auth/state/auth-state.svelte");

function makeRepository() {
  return {
    hasMatchingContent: vi.fn().mockResolvedValue(false),
    saveSequenceWithMetadata: vi.fn().mockResolvedValue({}),
    attachThumbnail: vi.fn().mockResolvedValue(undefined),
  } as any;
}
/** A sequence with the compositional fields the artifact extractor needs. */
function makeDecomposedSequence() {
  return {
    id: "seq-1",
    steps: [{ letter: "A" }],
    thumbnails: [],
    leftSoloProp: { id: "left", handPath: { id: "lp" } },
    rightSoloProp: { id: "right", handPath: { id: "rp" } },
  } as any;
}
function makeOptions(tags: string[] = []) {
  return { name: "A", visibility: "private" as const, tags, notes: "" };
}

beforeEach(() => {
  vi.clearAllMocks();
  dbPutMock.mockResolvedValue(undefined);
  dbGetMock.mockResolvedValue(undefined);
  dbCountMock.mockResolvedValue(0);
  ledgerIdsMock.mockReturnValue([]);
  findTagByNameMock.mockResolvedValue(undefined);
  (authState as any).isAuthenticated = true;
  (authState as any).isAnonymous = true;
  (authState as any).effectiveUserId = "guest-current";
});

describe("tag creation is fenced to the saving account", () => {
  it("passes the saving account to the tag write", async () => {
    const service = new LibrarySaveService(null, null, makeRepository(), null);

    await service.saveSequence(makeDecomposedSequence(), makeOptions(["flow"]));

    expect(createUserTagMock).toHaveBeenCalledTimes(1);
    // Third argument is the fence, checked inside createUserTag AFTER it
    // resolves the uid whose subtree the tag would be written to.
    expect(createUserTagMock.mock.calls[0]?.[2]).toBe("guest-current");
  });

  it("keeps naming the saving account when a sign-in lands during the save", async () => {
    // The tag write happens after the local write; hook the switch to it so it
    // lands strictly after the owner snapshot.
    dbPutMock.mockImplementationOnce(async () => {
      (authState as any).isAnonymous = false;
      (authState as any).effectiveUserId = "collided-account";
    });
    const service = new LibrarySaveService(null, null, makeRepository(), null);

    await service.saveSequence(makeDecomposedSequence(), makeOptions(["flow"]));

    expect(createUserTagMock.mock.calls[0]?.[2]).toBe("guest-current");
  });

  it("writes no cloud tag at all when the save had no owner", async () => {
    (authState as any).effectiveUserId = null;
    const service = new LibrarySaveService(null, null, makeRepository(), null);

    await service.saveSequence(makeDecomposedSequence(), makeOptions(["flow"]));

    expect(createUserTagMock).not.toHaveBeenCalled();
  });
});

describe("artifact extraction is fenced to the saving account", () => {
  function makeExtractor() {
    return { extract: vi.fn().mockResolvedValue(undefined) };
  }

  it("extracts under the saving account, not a re-read of live auth", async () => {
    const extractor = makeExtractor();
    const service = new LibrarySaveService(
      null,
      null,
      makeRepository(),
      extractor as any
    );

    await service.saveSequence(makeDecomposedSequence(), makeOptions());

    await vi.waitFor(() => expect(extractor.extract).toHaveBeenCalledTimes(1));
    expect(extractor.extract.mock.calls[0]?.[1]).toBe("guest-current");
  });

  it("does not follow a sign-in that lands during the save", async () => {
    dbPutMock.mockImplementationOnce(async () => {
      (authState as any).isAnonymous = false;
      (authState as any).effectiveUserId = "collided-account";
    });
    const extractor = makeExtractor();
    const service = new LibrarySaveService(
      null,
      null,
      makeRepository(),
      extractor as any
    );

    await service.saveSequence(makeDecomposedSequence(), makeOptions());

    await vi.waitFor(() => expect(extractor.extract).toHaveBeenCalledTimes(1));
    // Previously this read authState fresh and would have handed the guest's
    // artifacts to the account they collided with.
    expect(extractor.extract.mock.calls[0]?.[1]).toBe("guest-current");
  });

  it("extracts nothing when the save had no owner", async () => {
    (authState as any).effectiveUserId = null;
    const extractor = makeExtractor();
    const service = new LibrarySaveService(
      null,
      null,
      makeRepository(),
      extractor as any
    );

    await service.saveSequence(makeDecomposedSequence(), makeOptions());

    expect(extractor.extract).not.toHaveBeenCalled();
  });
});
