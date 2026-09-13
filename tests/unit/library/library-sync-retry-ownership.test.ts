/**
 * The background sync retry is a RETRY, not a transfer.
 *
 * `retryPendingSyncs` writes through `repo.saveSequenceWithMetadata`, which
 * resolves its uid from `authState.effectiveUserId` at write time and stamps
 * that uid as the sequence's ownerId. Dexie is flat, not uid-scoped, and never
 * cleared on sign-out, so an unfiltered sweep hands whatever rows this browser
 * holds to whoever is signed in now — account A saves offline, signs out, B
 * signs in, and the next boot or reconnect writes A's sequence into B's library
 * under B's name. It runs unprompted at app boot and on every reconnect.
 *
 * Regression cover for F5 of
 * docs/superpowers/reviews/2026-09-12-guest-save-continuity-audit.md.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Four steps, not one: MIN_COMMUNITY_STEPS is 4, and `meetsCommunityMinimum`
 * downgrades anything shorter to private inside the repository. A 1-step
 * fixture could not reach the community gallery whatever this pass handed over,
 * which would make the visibility assertions below vacuous.
 */
function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "seq-a",
    name: "A sequence",
    displayName: undefined,
    tags: [] as string[],
    thumbnails: [] as string[],
    steps: [{ letter: "A" }, { letter: "B" }, { letter: "C" }, { letter: "D" }],
    syncStatus: "failed" as const,
    pendingSyncMetadata: { visibility: "private" as const, notes: "" },
    ...overrides,
  };
}

const rows: any[] = [];
const saveSequenceWithMetadataMock = vi.fn().mockResolvedValue({});
/** uid -> ids that uid recorded as its own on this device. */
const ledger = new Map<string, string[]>();
const authStateMock = {
  isAuthenticated: true,
  isAnonymous: false,
  user: { uid: "account-B" },
  effectiveUserId: "account-B" as string | null,
};

// The failure path does `error instanceof FirebaseError`, and the suite-wide
// firebase/app mock does not export it. Only the class identity matters here.
vi.mock("firebase/app", () => ({
  FirebaseError: class FirebaseError extends Error {
    constructor(
      public code: string,
      message: string
    ) {
      super(message);
    }
  },
}));
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
  getSavedSequenceIds: (uid: string | null) => ledger.get(uid ?? "") ?? [],
  getOwnedSequenceIdSet: (uid: string | null) =>
    new Set(ledger.get(uid ?? "") ?? []),
  recordSavedSequenceId: vi.fn(),
  removeSavedSequenceIds: vi.fn(),
}));
vi.mock("$lib/shared/auth/state/auth-state.svelte", () => ({
  authState: authStateMock,
}));
vi.mock("$lib/shared/offline/state/network-status-state.svelte", () => ({
  networkStatusState: { onOnline: vi.fn(() => () => {}) },
}));
vi.mock("$lib/shared/toast/state/toast-state.svelte", () => ({
  toast: { info: vi.fn(), warning: vi.fn(), error: vi.fn(), success: vi.fn() },
}));
vi.mock(
  "$lib/shared/library/services/sequence-persistence-coordinator",
  () => ({ isSequenceDeletionIntended: () => false })
);

const { retryPendingSyncs } =
  await import("$lib/features/library/services/library-sync-retry");

beforeEach(() => {
  vi.clearAllMocks();
  rows.length = 0;
  ledger.clear();
  saveSequenceWithMetadataMock.mockResolvedValue({});
  authStateMock.effectiveUserId = "account-B";
  authStateMock.isAnonymous = false;
});

describe("retryPendingSyncs — account isolation", () => {
  it("does not replay account A's unsynced row while account B is signed in", async () => {
    rows.push(makeRow({ id: "owned-by-a" }));
    ledger.set("account-A", ["owned-by-a"]);
    ledger.set("account-B", []);

    await retryPendingSyncs();

    expect(saveSequenceWithMetadataMock).not.toHaveBeenCalled();
  });

  it("skips a pre-ledger legacy row rather than adopting it into the current account", async () => {
    rows.push(makeRow({ id: "legacy-no-ledger-entry" }));
    // Nobody claims it — not A, not B.

    await retryPendingSyncs();

    expect(saveSequenceWithMetadataMock).not.toHaveBeenCalled();
  });

  it("replays a row the signed-in account owns", async () => {
    rows.push(makeRow({ id: "owned-by-b" }));
    ledger.set("account-B", ["owned-by-b"]);

    await retryPendingSyncs();

    expect(saveSequenceWithMetadataMock).toHaveBeenCalledTimes(1);
    expect(saveSequenceWithMetadataMock.mock.calls[0]?.[0]).toMatchObject({
      id: "owned-by-b",
    });
  });

  it("replays only the owned rows when the device holds a mix", async () => {
    rows.push(
      makeRow({ id: "owned-by-a" }),
      makeRow({ id: "owned-by-b" }),
      makeRow({ id: "legacy" })
    );
    ledger.set("account-A", ["owned-by-a"]);
    ledger.set("account-B", ["owned-by-b"]);

    await retryPendingSyncs();

    expect(saveSequenceWithMetadataMock).toHaveBeenCalledTimes(1);
    expect(saveSequenceWithMetadataMock.mock.calls[0]?.[0]).toMatchObject({
      id: "owned-by-b",
    });
  });

  it("writes nothing at all when no one is signed in", async () => {
    authStateMock.effectiveUserId = null;
    rows.push(makeRow({ id: "owned-by-a" }));
    ledger.set("account-A", ["owned-by-a"]);

    await retryPendingSyncs();

    expect(saveSequenceWithMetadataMock).not.toHaveBeenCalled();
  });

  it("aborts mid-pass if the account changes between writes", async () => {
    rows.push(makeRow({ id: "b-1" }), makeRow({ id: "b-2" }));
    ledger.set("account-B", ["b-1", "b-2"]);
    // The first write lands; the user switches accounts while it is in flight.
    saveSequenceWithMetadataMock.mockImplementationOnce(async () => {
      authStateMock.effectiveUserId = "account-C";
      return {};
    });

    await retryPendingSyncs();

    // b-2 was selected for B and must not be written as C.
    expect(saveSequenceWithMetadataMock).toHaveBeenCalledTimes(1);
  });

  it("carries the row's recorded visibility rather than re-deciding it", async () => {
    rows.push(
      makeRow({
        id: "owned-by-b",
        pendingSyncMetadata: { visibility: "public", notes: "n" },
      })
    );
    ledger.set("account-B", ["owned-by-b"]);

    await retryPendingSyncs();

    expect(saveSequenceWithMetadataMock.mock.calls[0]?.[1]).toMatchObject({
      visibility: "public",
      notes: "n",
    });
  });

  /**
   * Behavioural replacement for the source-text requirement that
   * tests/unit/public-collection-live-choreo-contract.test.ts used to place on
   * this file. That regex asserted the literal absence of `?? "private"`, which
   * is not the same claim as "a user's public save stays public" — and it is
   * the second claim that is the actual product contract.
   *
   * Compatibility: a save made through LibrarySaveService ALWAYS stamps
   * pendingSyncMetadata, so every row a real user created since that field
   * existed carries its recorded visibility and is replayed unchanged, public
   * included. Only a row that recorded nothing behaves differently, and for
   * those there is no user intent to preserve — publishing them would be
   * manufacturing one.
   */
  it("replays a recorded PUBLIC intent as public", async () => {
    rows.push(
      makeRow({
        id: "owned-by-b",
        pendingSyncMetadata: { visibility: "public", notes: "" },
      })
    );
    ledger.set("account-B", ["owned-by-b"]);

    await retryPendingSyncs();

    expect(saveSequenceWithMetadataMock.mock.calls[0]?.[1]?.visibility).toBe(
      "public"
    );
  });

  it("replays a recorded PRIVATE intent as private", async () => {
    rows.push(
      makeRow({
        id: "owned-by-b",
        pendingSyncMetadata: { visibility: "private", notes: "" },
      })
    );
    ledger.set("account-B", ["owned-by-b"]);

    await retryPendingSyncs();

    expect(saveSequenceWithMetadataMock.mock.calls[0]?.[1]?.visibility).toBe(
      "private"
    );
  });

  it("does not publish a row that recorded no visibility intent at all", async () => {
    rows.push(makeRow({ id: "owned-by-b", pendingSyncMetadata: undefined }));
    ledger.set("account-B", ["owned-by-b"]);

    await retryPendingSyncs();

    // Pre-pendingSyncMetadata legacy: nobody ever chose. An unattended
    // background pass must not be what decides to publish it.
    expect(saveSequenceWithMetadataMock.mock.calls[0]?.[1]?.visibility).toBe(
      "private"
    );
  });

  it("fences every write to the account the row was selected for", async () => {
    rows.push(makeRow({ id: "owned-by-b" }));
    ledger.set("account-B", ["owned-by-b"]);

    await retryPendingSyncs();

    // The repository re-checks this AFTER resolving the uid it will stamp, so
    // a switch inside its own await cannot land the row on another account.
    expect(saveSequenceWithMetadataMock.mock.calls[0]?.[1]).toMatchObject({
      expectedOwnerId: "account-B",
    });
  });

  it("keeps fencing to the ORIGINAL account when the switch happens mid-pass", async () => {
    rows.push(makeRow({ id: "b-1" }), makeRow({ id: "b-2" }));
    ledger.set("account-B", ["b-1", "b-2"]);
    // A write that resolves only after the account has already changed.
    saveSequenceWithMetadataMock.mockImplementationOnce(async () => {
      authStateMock.effectiveUserId = "account-C";
      return {};
    });

    await retryPendingSyncs();

    // The one write that did happen was fenced to B, never re-targeted to C.
    expect(saveSequenceWithMetadataMock.mock.calls[0]?.[1]).toMatchObject({
      expectedOwnerId: "account-B",
    });
    expect(
      saveSequenceWithMetadataMock.mock.calls.some(
        (c: any[]) => c[1]?.expectedOwnerId === "account-C"
      )
    ).toBe(false);
  });

  it("survives the repository refusing a write whose owner went stale", async () => {
    rows.push(makeRow({ id: "b-1" }));
    ledger.set("account-B", ["b-1"]);
    saveSequenceWithMetadataMock.mockRejectedValueOnce(
      Object.assign(new Error("owner changed"), { code: "UNAUTHORIZED" })
    );

    // The refusal is handled like any other failed sync: recorded, not thrown.
    await expect(retryPendingSyncs()).resolves.toBeUndefined();
  });
});
