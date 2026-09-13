import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dbPutMock = vi.fn();
const dbGetMock = vi.fn().mockResolvedValue(undefined);
const dbCountMock = vi.fn().mockResolvedValue(0);
const dbUpdateMock = vi.fn().mockResolvedValue(1);
const clearDeletionIntentMock = vi.fn();
const ledgerIdsMock = vi.fn().mockReturnValue([] as string[]);
const reportLifecycleMock = vi.fn().mockResolvedValue(undefined);

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
  getSavedSequenceIds: (...a: unknown[]) => ledgerIdsMock(...a),
  getOwnedSequenceIdSet: (...a: unknown[]) =>
    new Set(ledgerIdsMock(...a) as string[]),
  removeSavedSequenceIds: vi.fn(),
  recordUnownedSequenceId: vi.fn(),
  getUnownedSequenceIds: () => [],
  adoptUnownedSequenceIds: () => [],
}));
vi.mock("$lib/shared/auth/state/auth-state.svelte", () => ({
  authState: {
    isAuthenticated: true,
    isAnonymous: false,
    user: { displayName: "Test", uid: "u1" },
    effectiveUserId: "u1",
  },
}));
vi.mock("$lib/shared/auth/services/guest-identity", () => ({
  ensureGuestIdentity: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("$lib/shared/auth/state/auth-drawer-state.svelte", () => ({
  authDrawerState: { show: vi.fn(), offerGuestSaveNudge: vi.fn() },
}));
vi.mock("$lib/shared/toast/state/toast-state.svelte.ts", () => ({
  toast: { info: vi.fn(), warning: vi.fn(), error: vi.fn() },
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
  findTagByName: vi.fn().mockResolvedValue(undefined),
  createUserTag: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("$lib/shared/library/services/sequence-content-hasher", () => ({
  computeHash: vi.fn().mockResolvedValue("hash-1"),
}));
vi.mock("$lib/features/library/services/library-sync-retry", () => ({
  markSequenceSyncStatus: vi.fn().mockResolvedValue(undefined),
}));
vi.mock(
  "$lib/shared/library/services/sequence-persistence-coordinator",
  () => ({
    clearSequenceDeletionIntent: (...args: unknown[]) =>
      clearDeletionIntentMock(...args),
  })
);
vi.mock("$lib/shared/analytics/services/posthog-lifecycle-reporter", () => ({
  reportPostHogLifecycleEvent: (...args: unknown[]) =>
    reportLifecycleMock(...args),
}));
// Keep the real, Firestore-touching library-state module out of the test: the
// service's refreshLibraryState() dynamic-imports it after a successful save.
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
const { LibraryError } =
  await import("$lib/shared/library/domain/library-error");
const { authState } = await import("$lib/shared/auth/state/auth-state.svelte");
const { authDrawerState } =
  await import("$lib/shared/auth/state/auth-drawer-state.svelte");
const { toast } = await import("$lib/shared/toast/state/toast-state.svelte");

function makeSequence(o: Record<string, unknown> = {}) {
  return { id: "seq-1", steps: [{ letter: "A" }], thumbnails: [], ...o } as any;
}
function makeOptions() {
  return { name: "A", visibility: "private" as const, tags: [], notes: "" };
}
function makeRepository(o: Record<string, unknown> = {}) {
  return {
    hasMatchingContent: vi.fn().mockResolvedValue(false),
    saveSequenceWithMetadata: vi.fn().mockResolvedValue({}),
    attachThumbnail: vi.fn().mockResolvedValue(undefined),
    ...o,
  } as any;
}

describe("LibrarySaveService.saveSequence - durable-save contract", () => {
  it("opens only the account modal at the guest limit and writes nothing", async () => {
    (authState as any).isAnonymous = true;
    // The cap counts what THIS guest owns (saved-sequence-ledger), not every
    // row in the flat, never-cleared Dexie table — that raw count included a
    // prior session's rows and refused saves for a library that read empty.
    // Reaching the limit is now expressed the way the guest reaches it.
    ledgerIdsMock.mockReturnValue(["own-1", "own-2", "own-3"]);
    const service = new LibrarySaveService(null, null, makeRepository(), null);
    await expect(
      service.saveSequence(makeSequence(), makeOptions())
    ).rejects.toMatchObject({ code: "GUEST_CAP" });
    expect(authDrawerState.show).toHaveBeenCalledExactlyOnceWith(
      "signup",
      "save-limit"
    );
    expect(toast.info).not.toHaveBeenCalled();
    expect(dbPutMock).not.toHaveBeenCalled();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    dbGetMock.mockResolvedValue(undefined);
    dbCountMock.mockResolvedValue(0);
    ledgerIdsMock.mockReturnValue([]);
    // clearAllMocks preserves implementations set here; restore full-account auth.
    (authState as any).isAuthenticated = true;
    (authState as any).isAnonymous = false;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("rejects with LibraryError(PERSIST_FAILED) when the Dexie put fails", async () => {
    dbPutMock.mockRejectedValueOnce(new Error("quota"));
    const service = new LibrarySaveService(null, null, makeRepository(), null);
    await expect(
      service.saveSequence(makeSequence(), makeOptions())
    ).rejects.toMatchObject({ code: "PERSIST_FAILED" });
    expect(clearDeletionIntentMock).not.toHaveBeenCalled();
    dbPutMock.mockRejectedValueOnce(new Error("quota"));
    await expect(
      service.saveSequence(makeSequence(), makeOptions())
    ).rejects.toBeInstanceOf(LibraryError);
  });

  it("resolves with persisted:true and isGuest reflecting auth state on success", async () => {
    dbPutMock.mockResolvedValue(undefined);
    const service = new LibrarySaveService(null, null, makeRepository(), null);
    const result = await service.saveSequence(makeSequence(), makeOptions());
    expect(result.persisted).toBe(true);
    expect(result.isGuest).toBe(false);
    expect(result.sequenceId).toBe("seq-1");
    expect(clearDeletionIntentMock).toHaveBeenCalledOnce();
    expect(clearDeletionIntentMock).toHaveBeenCalledWith("seq-1");
    // The second argument is the acting account. The reporter stamps the LIVE
    // uid as the event owner, so a save followed by a sign-in would otherwise
    // put this milestone in the account they signed into.
    expect(reportLifecycleMock).toHaveBeenCalledWith(
      {
        event: "sequence_save",
        properties: {
          sequenceId: "seq-1",
          stepCount: 1,
          visibility: "private",
          durability: "cloud",
          source: "unspecified",
        },
      },
      "u1"
    );
  });

  it("writes the sequence to Dexie (db.sequences.put) so a guest library can read it back", async () => {
    dbPutMock.mockResolvedValue(undefined);
    // Anonymous guest: the durable Dexie write is exactly what makes the save
    // visible in the guest's Dexie-only library read (the SP1 fix). All four
    // migrated keep paths funnel through this saveSequence().
    (authState as any).isAuthenticated = false;
    (authState as any).isAnonymous = true;
    const service = new LibrarySaveService(null, null, makeRepository(), null);
    const result = await service.saveSequence(makeSequence(), makeOptions());
    expect(dbPutMock).toHaveBeenCalledTimes(1);
    const written = dbPutMock.mock.calls[0][0];
    expect(written).toMatchObject({ id: "seq-1", name: "A" });
    expect(result.isGuest).toBe(true);
    expect(result.persisted).toBe(true);
  });

  it("repairs stale step counts in the durable local copy", async () => {
    dbPutMock.mockResolvedValue(undefined);
    dbGetMock.mockResolvedValue(undefined);
    const service = new LibrarySaveService(null, null, makeRepository(), null);

    await service.saveSequence(
      makeSequence({
        steps: undefined,
        stepPairings: [{}, {}, {}, {}, {}, {}],
        sequenceLength: 0,
        metadata: { length: 0 },
      }),
      makeOptions()
    );

    expect(dbPutMock.mock.calls[0]?.[0]).toMatchObject({
      sequenceLength: 6,
      metadata: { length: 6 },
    });
  });

  it("reports only the save stages that still run in the foreground", async () => {
    vi.useFakeTimers();
    const progress: Array<{ step: number; stepLabel: string }> = [];
    const service = new LibrarySaveService(null, null, makeRepository(), null);

    const save = service.saveSequence(makeSequence(), makeOptions(), (update) =>
      progress.push(update)
    );
    await vi.advanceTimersByTimeAsync(800);
    await save;

    expect(progress).toEqual([
      { step: 1, stepLabel: "Saving locally" },
      { step: 2, stepLabel: "Creating tags" },
      { step: 3, stepLabel: "Syncing to cloud" },
      { step: 4, stepLabel: "Refreshing library" },
      { step: 5, stepLabel: "Complete" },
    ]);
  });

  it("rejects with LibraryError(ALREADY_EXISTS) synchronously for a new duplicate, no Dexie write", async () => {
    dbPutMock.mockResolvedValue(undefined);
    dbGetMock.mockResolvedValue(undefined);
    const repository = makeRepository({
      hasMatchingContent: vi.fn().mockResolvedValue(true),
    });
    const service = new LibrarySaveService(null, null, repository, null);
    await expect(
      service.saveSequence(makeSequence(), makeOptions())
    ).rejects.toMatchObject({ code: "ALREADY_EXISTS" });
    expect(repository.hasMatchingContent).toHaveBeenCalled();
    expect(dbPutMock).not.toHaveBeenCalled();
  });

  it("does not wait for thumbnail rendering before completing a durable save", async () => {
    vi.useFakeTimers();
    const getCardImageBlob = vi.fn(() => new Promise<Blob>(() => undefined));
    const uploadSequenceThumbnail = vi.fn();
    const repository = makeRepository();
    const service = new LibrarySaveService(
      { getCardImageBlob } as any,
      { uploadSequenceThumbnail } as any,
      repository,
      null
    );

    const save = service.saveSequence(makeSequence(), makeOptions());
    await vi.advanceTimersByTimeAsync(800);

    await expect(save).resolves.toMatchObject({
      sequenceId: "seq-1",
      persisted: true,
    });
    expect(dbPutMock).toHaveBeenCalledOnce();
    expect(getCardImageBlob).toHaveBeenCalledOnce();
    expect(uploadSequenceThumbnail).not.toHaveBeenCalled();
  });

  it("attaches a completed thumbnail locally and to the existing cloud save", async () => {
    vi.useFakeTimers();
    const thumbnailUrl = "https://assets.example.com/thumbnail.png";
    const repository = makeRepository();
    const service = new LibrarySaveService(
      {
        getCardImageBlob: vi
          .fn()
          .mockResolvedValue(new Blob(["png"], { type: "image/png" })),
      } as any,
      {
        uploadSequenceThumbnail: vi.fn().mockResolvedValue({
          url: thumbnailUrl,
          key: "thumbnail.png",
        }),
      } as any,
      repository,
      null
    );

    const save = service.saveSequence(makeSequence(), makeOptions());
    await vi.advanceTimersByTimeAsync(800);
    await save;
    await vi.waitFor(() =>
      expect(repository.attachThumbnail).toHaveBeenCalledTimes(1)
    );

    expect(dbUpdateMock).toHaveBeenCalledWith("seq-1", {
      thumbnails: [thumbnailUrl],
    });
    expect(repository.saveSequenceWithMetadata).toHaveBeenCalledOnce();
    // The third argument is the identity fence: the thumbnail patch is aimed at
    // the account that made the save, not at whoever is signed in by the time
    // the render and upload finish.
    expect(repository.attachThumbnail).toHaveBeenCalledWith(
      "seq-1",
      thumbnailUrl,
      "u1"
    );
  });
});

describe("LibrarySaveService.saveSequence - publication-moment intent capture", () => {
  const publicSteps = [
    { letter: "A" },
    { letter: "B" },
    { letter: "C" },
    { letter: "D" },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    dbPutMock.mockResolvedValue(undefined);
    dbGetMock.mockResolvedValue(undefined);
    dbCountMock.mockResolvedValue(0);
    ledgerIdsMock.mockReturnValue([]);
    (authState as any).isAuthenticated = true;
    (authState as any).isAnonymous = false;
  });

  it("stamps the creator's active props on a public save with no recorded intent", async () => {
    const service = new LibrarySaveService(null, null, makeRepository(), null);
    await service.saveSequence(makeSequence({ steps: publicSteps }), {
      ...makeOptions(),
      visibility: "public",
    });
    const expected = {
      leftPropType: "club",
      rightPropType: "club",
      catDogMode: false,
    };
    expect(dbPutMock.mock.calls[0]?.[0]).toMatchObject({
      creatorIntent: { propConfig: expected },
      intendedProp: expected,
    });
  });

  it("never restamps an existing recording on a public re-save", async () => {
    const recorded = {
      leftPropType: "buugeng",
      rightPropType: "buugeng",
      catDogMode: false,
    };
    const service = new LibrarySaveService(null, null, makeRepository(), null);
    await service.saveSequence(
      makeSequence({
        steps: publicSteps,
        creatorIntent: { propConfig: recorded },
      }),
      { ...makeOptions(), visibility: "public" }
    );
    expect(dbPutMock.mock.calls[0]?.[0]).toMatchObject({
      creatorIntent: { propConfig: recorded },
    });
  });

  it("does not stamp intent on a private save", async () => {
    const service = new LibrarySaveService(null, null, makeRepository(), null);
    await service.saveSequence(
      makeSequence({ steps: publicSteps }),
      makeOptions()
    );
    const written = dbPutMock.mock.calls[0]?.[0];
    expect(written.creatorIntent).toBeUndefined();
    expect(written.intendedProp).toBeUndefined();
  });

  it("does not stamp intent when the community gate downgrades the save to private", async () => {
    const service = new LibrarySaveService(null, null, makeRepository(), null);
    await service.saveSequence(makeSequence({ steps: [{ letter: "A" }] }), {
      ...makeOptions(),
      visibility: "public",
    });
    const written = dbPutMock.mock.calls[0]?.[0];
    expect(written.creatorIntent).toBeUndefined();
    expect(written.intendedProp).toBeUndefined();
  });
});
