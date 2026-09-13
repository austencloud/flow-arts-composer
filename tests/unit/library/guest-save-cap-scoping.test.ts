/**
 * The guest save cap counts the guest's OWN saves, not every row this browser
 * happens to hold.
 *
 * Dexie's sequences table is flat, not uid-scoped, and is never cleared on
 * sign-out, so `db.sequences.count()` includes every prior session's rows. A
 * user who signed in, saved three sequences and signed out used to come back as
 * a guest to a library that reads EMPTY (the browse engine filters by the
 * per-uid ledger) and a cap that reads FULL — every save refused, citing a limit
 * on sequences they could not see. The read side and the cap side must count the
 * same set.
 *
 * Regression cover for F1 of
 * docs/superpowers/reviews/2026-09-12-guest-save-continuity-audit.md.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const dbPutMock = vi.fn().mockResolvedValue(undefined);
const dbGetMock = vi.fn().mockResolvedValue(undefined);
const dbCountMock = vi.fn().mockResolvedValue(0);
const dbUpdateMock = vi.fn().mockResolvedValue(1);
const getSavedSequenceIdsMock = vi.fn().mockReturnValue([] as string[]);
const recordSavedSequenceIdMock = vi.fn();

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
// The real ledger is exercised by tests/unit/library/saved-sequence-ledger.test.ts.
// Here it is the seam that says which rows belong to the signed-in guest.
vi.mock("$lib/shared/library/services/saved-sequence-ledger", () => ({
  recordSavedSequenceId: (...a: unknown[]) => recordSavedSequenceIdMock(...a),
  getSavedSequenceIds: (...a: unknown[]) => getSavedSequenceIdsMock(...a),
  getOwnedSequenceIdSet: (...a: unknown[]) =>
    new Set(getSavedSequenceIdsMock(...a) as string[]),
  removeSavedSequenceIds: vi.fn(),
}));
vi.mock("$lib/shared/auth/state/auth-state.svelte", () => ({
  authState: {
    isAuthenticated: true,
    isAnonymous: true,
    user: { uid: "guest-current" },
    effectiveUserId: "guest-current",
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

const { LibrarySaveService } =
  await import("$lib/features/library/services/library-save-service");
const { authState } = await import("$lib/shared/auth/state/auth-state.svelte");
const { GUEST_SAVE_CAP } =
  await import("$lib/shared/auth/domain/guest-access-config");

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
function capFullOfSomeoneElsesRows() {
  // Three rows sit in Dexie from a previous signed-in session on this device...
  dbCountMock.mockResolvedValue(GUEST_SAVE_CAP);
  // ...but none of them are recorded against the current guest.
  getSavedSequenceIdsMock.mockReturnValue([]);
}

beforeEach(() => {
  vi.clearAllMocks();
  dbPutMock.mockResolvedValue(undefined);
  dbGetMock.mockResolvedValue(undefined);
  dbCountMock.mockResolvedValue(0);
  getSavedSequenceIdsMock.mockReturnValue([]);
  (authState as any).isAuthenticated = true;
  (authState as any).isAnonymous = true;
});

describe("guest save cap — scoped to the guest's own ledger", () => {
  it("lets a guest save on a device holding a previous session's rows", async () => {
    capFullOfSomeoneElsesRows();
    const service = new LibrarySaveService(null, null, makeRepository(), null);

    await expect(
      service.saveSequence(makeSequence(), makeOptions())
    ).resolves.toMatchObject({ persisted: true, isGuest: true });
    expect(dbPutMock).toHaveBeenCalledTimes(1);
  });

  it("does not consult the unscoped device-wide row count at all", async () => {
    capFullOfSomeoneElsesRows();
    const service = new LibrarySaveService(null, null, makeRepository(), null);

    await service.saveSequence(makeSequence(), makeOptions());

    // The whole defect was counting rows this guest does not own. Reading that
    // number again for any reason re-opens the door.
    expect(dbCountMock).not.toHaveBeenCalled();
  });

  it("still refuses a new save once the guest owns GUEST_SAVE_CAP sequences", async () => {
    getSavedSequenceIdsMock.mockReturnValue(
      Array.from({ length: GUEST_SAVE_CAP }, (_, i) => `mine-${i}`)
    );
    const service = new LibrarySaveService(null, null, makeRepository(), null);

    await expect(
      service.saveSequence(makeSequence({ id: "brand-new" }), makeOptions())
    ).rejects.toMatchObject({ code: "GUEST_CAP" });
    expect(dbPutMock).not.toHaveBeenCalled();
  });

  it("treats re-saving the guest's own sequence as an update, never a new save", async () => {
    const mine = Array.from({ length: GUEST_SAVE_CAP }, (_, i) => `mine-${i}`);
    getSavedSequenceIdsMock.mockReturnValue(mine);
    dbGetMock.mockResolvedValue({ id: mine[0] });
    const service = new LibrarySaveService(null, null, makeRepository(), null);

    // At the cap, but this id is already one of the guest's own.
    await expect(
      service.saveSequence(makeSequence({ id: mine[0] }), makeOptions())
    ).resolves.toMatchObject({ persisted: true });
  });

  it("never caps a full account, whatever the ledger says", async () => {
    (authState as any).isAnonymous = false;
    getSavedSequenceIdsMock.mockReturnValue(["a", "b", "c", "d", "e"]);
    const service = new LibrarySaveService(null, null, makeRepository(), null);

    await expect(
      service.saveSequence(makeSequence(), makeOptions())
    ).resolves.toMatchObject({ persisted: true, isGuest: false });
  });
});
