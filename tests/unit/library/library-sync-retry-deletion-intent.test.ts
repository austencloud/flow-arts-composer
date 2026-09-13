import { beforeEach, describe, expect, it, vi } from "vitest";

const toArrayMock = vi.fn();
const updateMock = vi.fn().mockResolvedValue(1);
const saveSequenceWithMetadataMock = vi.fn().mockResolvedValue({});
const isDeletionIntendedMock = vi.fn();

vi.mock("$lib/shared/persistence/database/tka-database", () => ({
  db: {
    sequences: {
      filter: vi.fn(() => ({
        toArray: (...args: unknown[]) => toArrayMock(...args),
      })),
      update: (...args: unknown[]) => updateMock(...args),
    },
  },
}));
vi.mock("$lib/shared/library/get-library-repository", () => ({
  getLibraryRepository: () => ({
    saveSequenceWithMetadata: (...args: unknown[]) =>
      saveSequenceWithMetadataMock(...args),
  }),
}));
vi.mock("$lib/shared/offline/state/network-status-state.svelte", () => ({
  // onOffline is reached through this module's import graph; omitting it threw
  // at collection time and this whole file silently ran ZERO tests.
  networkStatusState: {
    onOnline: vi.fn(() => vi.fn()),
    onOffline: vi.fn(() => vi.fn()),
  },
}));
// The retry pass is scoped to rows the signed-in account owns, so these
// fixtures have to be owned by someone for the pass to consider them at all.
vi.mock("$lib/shared/auth/state/auth-state.svelte", () => ({
  authState: {
    isAuthenticated: true,
    isAnonymous: false,
    user: { uid: "owner-uid" },
    effectiveUserId: "owner-uid",
  },
}));
vi.mock("$lib/shared/library/services/saved-sequence-ledger", () => ({
  getSavedSequenceIds: () => ["deleting-sequence", "live-sequence"],
  getOwnedSequenceIdSet: () => new Set(["deleting-sequence", "live-sequence"]),
  recordSavedSequenceId: vi.fn(),
  removeSavedSequenceIds: vi.fn(),
}));
vi.mock("$lib/shared/toast/state/toast-state.svelte", () => ({
  toast: { info: vi.fn() },
}));
vi.mock(
  "$lib/shared/library/services/sequence-persistence-coordinator",
  () => ({
    isSequenceDeletionIntended: (...args: unknown[]) =>
      isDeletionIntendedMock(...args),
  })
);

const { retryPendingSyncs } =
  await import("$lib/features/library/services/library-sync-retry");

function makePendingSequence(id: string) {
  return {
    id,
    name: id,
    displayName: id,
    syncStatus: "failed",
    tags: [],
    thumbnails: [],
    pendingSyncMetadata: {
      visibility: "private",
      notes: "",
    },
  };
}

describe("LibrarySyncRetry deletion intent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateMock.mockResolvedValue(1);
    saveSequenceWithMetadataMock.mockResolvedValue({});
  });

  it("does not resurrect a pending local row while permanent deletion is intended", async () => {
    toArrayMock.mockResolvedValue([
      makePendingSequence("deleting-sequence"),
      makePendingSequence("live-sequence"),
    ]);
    isDeletionIntendedMock.mockImplementation(
      (sequenceId: string) => sequenceId === "deleting-sequence"
    );

    await retryPendingSyncs();

    expect(saveSequenceWithMetadataMock).toHaveBeenCalledOnce();
    expect(saveSequenceWithMetadataMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "live-sequence" }),
      expect.objectContaining({ visibility: "private" })
    );
    expect(updateMock).toHaveBeenCalledWith("live-sequence", {
      syncStatus: "synced",
    });
    expect(updateMock).not.toHaveBeenCalledWith(
      "deleting-sequence",
      expect.anything()
    );
  });
});
