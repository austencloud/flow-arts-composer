/**
 * AUDIT ARTIFACT — FAILING BY DESIGN. NOT A MERGE-READY CHANGE.
 *
 * Finding F5 of `docs/superpowers/reviews/2026-09-12-guest-save-continuity-audit.md`:
 * `retryPendingSyncs` replays EVERY pending/failed Dexie row into whichever
 * account happens to be signed in when it runs.
 *
 * Separate file from guest-save-continuity-audit.test.ts because that one mocks
 * `library-sync-retry`; this one is the module under test.
 *
 * Do not "fix" these tests. Fix the source they describe, or delete this file
 * along with the audit report.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

/** One row saved by account A on this device, whose cloud sync never landed. */
const ACCOUNT_A_ROW = {
  id: "seq-owned-by-a",
  name: "A's private sequence",
  displayName: undefined,
  tags: [] as string[],
  thumbnails: [] as string[],
  steps: [{ letter: "A" }],
  syncStatus: "failed" as const,
  pendingSyncMetadata: { visibility: "private" as const, notes: "A's notes" },
};

const rows: any[] = [];
const saveSequenceWithMetadataMock = vi.fn().mockResolvedValue({});
const getSavedSequenceIdsMock = vi.fn().mockReturnValue([] as string[]);

vi.mock("$lib/shared/persistence/database/tka-database", () => ({
  db: {
    sequences: {
      filter: (predicate: (s: unknown) => boolean) => ({
        toArray: async () => rows.filter(predicate),
      }),
      update: vi.fn().mockResolvedValue(1),
    },
  },
}));
vi.mock("$lib/shared/library/get-library-repository", () => ({
  getLibraryRepository: () => ({
    saveSequenceWithMetadata: (...a: unknown[]) =>
      saveSequenceWithMetadataMock(...a),
  }),
}));
vi.mock("$lib/shared/library/services/saved-sequence-ledger", () => ({
  getSavedSequenceIds: (...a: unknown[]) => getSavedSequenceIdsMock(...a),
  recordSavedSequenceId: vi.fn(),
  removeSavedSequenceIds: vi.fn(),
}));
vi.mock("$lib/shared/auth/state/auth-state.svelte", () => ({
  authState: {
    isAuthenticated: true,
    isAnonymous: false,
    user: { uid: "account-B" },
    effectiveUserId: "account-B",
  },
}));
vi.mock("$lib/shared/offline/state/network-status-state.svelte", () => ({
  networkStatusState: { onOnline: vi.fn(() => () => {}) },
}));
vi.mock("$lib/shared/toast/state/toast-state.svelte", () => ({
  toast: { info: vi.fn(), warning: vi.fn(), error: vi.fn(), success: vi.fn() },
}));
vi.mock("$lib/shared/library/services/sequence-persistence-coordinator", () => ({
  isSequenceDeletionIntended: () => false,
}));

const { retryPendingSyncs } = await import(
  "$lib/features/library/services/library-sync-retry"
);

beforeEach(() => {
  vi.clearAllMocks();
  rows.length = 0;
  saveSequenceWithMetadataMock.mockResolvedValue({});
  // The device's ledger records the row as account A's. Account B (the signed-in
  // user, per the authState mock above) owns nothing on this device.
  getSavedSequenceIdsMock.mockImplementation((uid: string) =>
    uid === "account-A" ? [ACCOUNT_A_ROW.id] : []
  );
});

describe("F5 — a background sync retry must not replay another account's rows", () => {
  /**
   * Reproduction. Account A saves on this device while offline, so the row
   * lands in Dexie with syncStatus "failed". A signs out; B signs in on the
   * same device. Dexie is flat, not uid-scoped, and never cleared on sign-out.
   *
   * `retryPendingSyncs` (library-sync-retry.ts:122-131) filters ONLY on
   * syncStatus and blockedReason — no uid, no ledger — then calls the CURRENT
   * account's repository (library-repository.ts:397 `getWritableUserId()` →
   * `authState.effectiveUserId`). `createLibrarySequence` stamps
   * `ownerId` from that uid (library-sequence.ts:157-167).
   *
   * So A's sequence is written into B's library, attributed to B.
   *
   * This runs unprompted: once at app boot (routes/+layout.svelte:699-702,
   * ungated by auth) and again on every reconnect
   * (library-sync-retry.ts:203-205).
   */
  it("does not write account A's unsynced row while account B is signed in", async () => {
    rows.push(ACCOUNT_A_ROW);

    await retryPendingSyncs();

    expect(saveSequenceWithMetadataMock).not.toHaveBeenCalled();
  });

  /**
   * The same sweep also decides visibility with `?? "public"`
   * (library-sync-retry.ts:141). A row whose recorded visibility is private is
   * safe, but one that never recorded any metadata is replayed as PUBLIC — into
   * the wrong account, and from there to the community gallery.
   */
  it("does not publish a metadata-less foreign row as public", async () => {
    rows.push({ ...ACCOUNT_A_ROW, pendingSyncMetadata: undefined });

    await retryPendingSyncs();

    const call = saveSequenceWithMetadataMock.mock.calls[0];
    expect(call?.[1]?.visibility).not.toBe("public");
  });

  /**
   * Guard: the fix must not disable the retry outright. A row the CURRENT
   * account owns still has to sync. This passes today and must keep passing.
   */
  it("still replays a row the signed-in account actually owns", async () => {
    getSavedSequenceIdsMock.mockImplementation((uid: string) =>
      uid === "account-B" ? ["seq-owned-by-b"] : []
    );
    rows.push({ ...ACCOUNT_A_ROW, id: "seq-owned-by-b", name: "B's own" });

    await retryPendingSyncs();

    expect(saveSequenceWithMetadataMock).toHaveBeenCalledTimes(1);
  });
});
