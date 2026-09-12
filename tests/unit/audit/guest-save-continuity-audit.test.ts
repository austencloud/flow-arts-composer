/**
 * AUDIT ARTIFACT — FAILING BY DESIGN. NOT A MERGE-READY CHANGE.
 *
 * These tests encode the *intended* guest-save → sign-in continuity contract
 * for findings F1, F2 and F3 of
 * `docs/superpowers/reviews/2026-09-12-guest-save-continuity-audit.md`.
 * They fail against current `main` — that failure IS the reproduction.
 *
 * Do not "fix" these tests. Fix the source they describe, or delete this file
 * along with the audit report. Nothing else in the suite depends on it.
 *
 * Harness: mirrors `tests/unit/library-save-service-persisted.test.ts`, the
 * project's existing mock set for LibrarySaveService.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const dbPutMock = vi.fn().mockResolvedValue(undefined);
const dbGetMock = vi.fn().mockResolvedValue(undefined);
const dbCountMock = vi.fn().mockResolvedValue(0);
const dbUpdateMock = vi.fn().mockResolvedValue(1);
const getSavedSequenceIdsMock = vi.fn().mockReturnValue([] as string[]);

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
  getSavedSequenceIds: (...a: unknown[]) => getSavedSequenceIdsMock(...a),
  removeSavedSequenceIds: vi.fn(),
}));
vi.mock("$lib/shared/auth/state/auth-state.svelte", () => ({
  authState: {
    isAuthenticated: true,
    isAnonymous: true,
    user: { uid: "anon-new" },
    effectiveUserId: "anon-new",
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
  showToast: vi.fn(),
}));
vi.mock("$lib/shared/toast/state/toast-state.svelte", () => ({
  toast: { info: vi.fn(), warning: vi.fn(), error: vi.fn(), success: vi.fn() },
  showToast: vi.fn(),
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

// --- mocks for the anonymous-upgrade / import-prompt half ---------------------
const repoSaveSequenceMock = vi.fn().mockResolvedValue({});
vi.mock("$lib/shared/library/get-library-repository", () => ({
  getLibraryRepository: () => ({
    saveSequence: (...a: unknown[]) => repoSaveSequenceMock(...a),
  }),
}));
vi.mock("$lib/shared/auth/firebase", () => ({
  getAuthInstance: vi.fn().mockResolvedValue({ currentUser: null }),
}));
vi.mock("$lib/shared/auth/services/pending-credential-link", () => ({
  stashPendingLink: vi.fn(),
}));
vi.mock("$lib/shared/auth/services/last-auth-method.svelte", () => ({
  recordLastAuthMethod: vi.fn(),
}));
vi.mock("$lib/shared/gamification/get-prop-unlock-manager", () => ({
  getPropUnlockManager: () => ({ mergeGuestCollection: vi.fn() }),
}));
vi.mock("$lib/shared/auth/services/auth-analytics-bridge", () => ({
  getAuthSubmissionContext: () => ({}),
}));
vi.mock("$lib/shared/persistence/services/dexie-persistence-service", () => ({
  getAllSequences: vi.fn().mockResolvedValue([]),
}));

const { LibrarySaveService } = await import(
  "$lib/features/library/services/library-save-service"
);
const { importDrafts } = await import(
  "$lib/shared/auth/services/anonymous-upgrade"
);

function makeSequence(o: Record<string, unknown> = {}) {
  return { id: "seq-1", steps: [{ letter: "A" }], thumbnails: [], ...o } as any;
}
function makeRepository(o: Record<string, unknown> = {}) {
  return {
    hasMatchingContent: vi.fn().mockResolvedValue(false),
    saveSequenceWithMetadata: vi.fn().mockResolvedValue({}),
    attachThumbnail: vi.fn().mockResolvedValue(undefined),
    ...o,
  } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  dbPutMock.mockResolvedValue(undefined);
  dbGetMock.mockResolvedValue(undefined);
  dbCountMock.mockResolvedValue(0);
  getSavedSequenceIdsMock.mockReturnValue([]);
  repoSaveSequenceMock.mockResolvedValue({});
});

describe("F1 — the guest save cap must count only THIS guest's own saves", () => {
  /**
   * Reproduction: sign in, save 3 sequences (each writes Dexie unconditionally,
   * library-save-service.ts:230), sign out. Dexie still holds 3 rows; it is
   * flat, not uid-scoped, and never cleared on sign-out. The new anonymous uid
   * owns none of them — its ledger is empty, so the browse engine renders an
   * EMPTY library (create-browse-engine.svelte.ts:645-665).
   *
   * The cap must agree with that read. Today it calls db.sequences.count()
   * (library-save-service.ts:147) and refuses the save.
   */
  it("lets a fresh guest save on a device that already holds another session's rows", async () => {
    dbCountMock.mockResolvedValue(3); // prior signed-in session's rows
    getSavedSequenceIdsMock.mockReturnValue([]); // this guest owns none of them

    const service = new LibrarySaveService(null, null, makeRepository(), null);

    // The guest's own library shows 0 sequences, so the cap of 3 cannot be met.
    await expect(
      service.saveSequence(makeSequence(), {
        name: "A",
        visibility: "private",
        tags: [],
        notes: "",
      })
    ).resolves.toMatchObject({ persisted: true });
  });

  it("still enforces the cap once THIS guest actually owns GUEST_SAVE_CAP saves", async () => {
    dbCountMock.mockResolvedValue(3);
    getSavedSequenceIdsMock.mockReturnValue(["a", "b", "c"]); // all three are ours

    const service = new LibrarySaveService(null, null, makeRepository(), null);

    await expect(
      service.saveSequence(makeSequence({ id: "seq-new" }), {
        name: "A",
        visibility: "private",
        tags: [],
        notes: "",
      })
    ).rejects.toMatchObject({ code: "GUEST_CAP" });
  });
});

describe("F2 — upgrade-import must not republish the guest's private work", () => {
  /**
   * Reproduction: a guest saves PRIVATE. The Dexie row carries that choice only
   * under pendingSyncMetadata.visibility — SequenceData has no top-level
   * visibility field (library-save-service.ts:204-225).
   *
   * importDrafts calls repo.saveSequence(draft) with no overrides
   * (anonymous-upgrade.ts:364), so library-repository.ts:514 and
   * library-sequence.ts:169 both fall through to `?? "public"`. The importing
   * session is a FULL account, so the isFullUser() gate no longer suppresses
   * the community mirror and the sequence is published.
   */
  it("carries the draft's saved visibility through to the repository write", async () => {
    const privateDraft = {
      id: "seq-private",
      steps: [{ letter: "A" }, { letter: "B" }, { letter: "C" }, { letter: "D" }],
      thumbnails: [],
      pendingSyncMetadata: { visibility: "private", notes: "mine" },
    } as any;

    await importDrafts([privateDraft]);

    expect(repoSaveSequenceMock).toHaveBeenCalledTimes(1);
    const [, overrides] = repoSaveSequenceMock.mock.calls[0]!;
    expect(overrides).toMatchObject({ visibility: "private" });
  });

  it("never defaults an imported draft to public when no visibility was recorded", async () => {
    const unmarkedDraft = {
      id: "seq-unmarked",
      steps: [{ letter: "A" }, { letter: "B" }, { letter: "C" }, { letter: "D" }],
      thumbnails: [],
    } as any;

    await importDrafts([unmarkedDraft]);

    const [, overrides] = repoSaveSequenceMock.mock.calls[0]!;
    // An import is a preservation action, not a publication decision, so the
    // import must pass an EXPLICIT safe visibility rather than leaving the
    // repository to fall through to its `?? "public"` default.
    expect(overrides?.visibility).toBe("private");
  });
});

describe("F3 — a failed import must not silently destroy the captured drafts", () => {
  /**
   * Reproduction 3b: importDrafts rethrows any error that is not
   * ALREADY_EXISTS / INVALID_DATA (anonymous-upgrade.ts:369), abandoning every
   * remaining draft in the loop and discarding the running `imported` count.
   * One offline write therefore loses the rest of the guest's work.
   */
  it("attempts every draft even when one write fails", async () => {
    repoSaveSequenceMock
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(
        Object.assign(new Error("offline"), { code: "unavailable" })
      )
      .mockResolvedValueOnce({});

    const drafts = [
      { id: "d1", steps: [{ letter: "A" }], thumbnails: [] },
      { id: "d2", steps: [{ letter: "B" }], thumbnails: [] },
      { id: "d3", steps: [{ letter: "C" }], thumbnails: [] },
    ] as any[];

    const imported = await importDrafts(drafts).catch(() => "threw" as const);

    // The third draft had nothing wrong with it.
    expect(repoSaveSequenceMock).toHaveBeenCalledTimes(3);
    // And the two that succeeded must still be reported as imported.
    expect(imported).toBe(2);
  });
});
