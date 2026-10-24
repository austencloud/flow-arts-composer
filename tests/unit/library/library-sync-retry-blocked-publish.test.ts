/**
 * A publish the rules refuse is not retried on every app open.
 *
 * Session triage 2026-10-22 (E3/F2): a tester's public copies point at ids or
 * content claims another owner holds. `PublishPermissionError` is a plain
 * Error, so the old `instanceof FirebaseError` check missed it and the boot
 * pass replayed the publish every open. Now a refusal blocks the row with a
 * timestamp and content hash; it comes back once a day at most, and only when
 * the content changed. Transient failures keep the ordinary retry.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PublishPermissionError } from "#lib/shared/library/services/publish-permission-error.js";
import {
  BLOCKED_PUBLISH_RETRY_INTERVAL_MS,
  PUBLISH_PERMISSION_DENIED,
  shouldRetryBlockedPublish,
} from "#lib/shared/library/services/blocked-publish-policy.js";

const rows: any[] = [];
const saveSequenceWithMetadataMock = vi.fn().mockResolvedValue({});
const toastMock = vi.hoisted(() => ({
  info: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
  success: vi.fn(),
}));

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
vi.mock("#lib/shared/persistence/database/tka-database.js", () => ({
  db: {
    sequences: {
      filter: (predicate: (s: unknown) => boolean) => ({
        toArray: async () => rows.filter(predicate),
      }),
      // Applied to the in-memory rows so the next pass sees the bookkeeping.
      update: vi.fn(async (id: string, patch: Record<string, unknown>) => {
        const index = rows.findIndex((row) => row.id === id);
        if (index !== -1) rows[index] = { ...rows[index], ...patch };
        return 1;
      }),
    },
  },
}));
vi.mock("#lib/shared/library/get-library-repository.js", () => ({
  getLibraryRepository: () => ({
    saveSequenceWithMetadata: (...a: unknown[]) =>
      saveSequenceWithMetadataMock(...a),
  }),
}));
vi.mock("#lib/shared/library/services/saved-sequence-ledger.js", () => ({
  getOwnedSequenceIdSet: () => new Set(rows.map((row) => row.id)),
}));
vi.mock("#lib/shared/auth/state/auth-state.svelte.js", () => ({
  authState: { effectiveUserId: "tester" },
}));
vi.mock("#lib/shared/offline/state/network-status-state.svelte.js", () => ({
  networkStatusState: { onOnline: vi.fn(() => () => {}) },
}));
vi.mock("#lib/shared/toast/state/toast-state.svelte.js", () => ({
  toast: toastMock,
}));
vi.mock(
  "#lib/shared/library/services/sequence-persistence-coordinator.js",
  () => ({ isSequenceDeletionIntended: () => false })
);
// The real hash needs fully hydrated steps; the policy only compares values.
vi.mock("#lib/shared/library/services/sequence-content-hasher.js", () => ({
  computeHash: vi.fn(async (s: { word: string }) => `hash:${s.word}`),
}));

const { retryPendingSyncs } =
  await import("#lib/features/library/services/library-sync-retry.js");

const DAY = BLOCKED_PUBLISH_RETRY_INTERVAL_MS;
const T0 = Date.UTC(2026, 9, 20, 12);

function publicRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "seq-refused",
    name: "HHHH",
    word: "HHHH",
    tags: [] as string[],
    thumbnails: [] as string[],
    steps: [{ letter: "H" }, { letter: "H" }, { letter: "H" }, { letter: "H" }],
    syncStatus: "failed" as const,
    pendingSyncMetadata: { visibility: "public" as const, notes: "" },
    ...overrides,
  };
}

function refused() {
  return new PublishPermissionError(
    Object.assign(new Error("denied"), { code: "permission-denied" }),
    [
      {
        step: "create-hash-claim",
        path: "publicSequenceHashes/{claimId}",
        operation: "set",
      },
    ],
    "transaction-commit"
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
  rows.length = 0;
  saveSequenceWithMetadataMock.mockResolvedValue({});
});
afterEach(() => {
  vi.useRealTimers();
});

describe("retryPendingSyncs: refused publish", () => {
  it("blocks the row with a time and content hash, without a second toast", async () => {
    rows.push(publicRow());
    saveSequenceWithMetadataMock.mockRejectedValue(refused());

    await retryPendingSyncs();

    expect(rows[0].pendingSyncMetadata).toMatchObject({
      visibility: "public",
      blockedReason: PUBLISH_PERMISSION_DENIED,
      blockedAt: T0,
      blockedContentHash: "hash:HHHH",
    });
    expect(toastMock.info).not.toHaveBeenCalled();
  });

  it("does not try again on the next open, or days later with the same content", async () => {
    rows.push(publicRow());
    saveSequenceWithMetadataMock.mockRejectedValue(refused());
    await retryPendingSyncs();

    vi.setSystemTime(T0 + 60_000);
    await retryPendingSyncs();
    vi.setSystemTime(T0 + 2 * DAY);
    await retryPendingSyncs();

    expect(saveSequenceWithMetadataMock).toHaveBeenCalledTimes(1);
  });

  it("tries again once the content changed and the day has passed", async () => {
    rows.push(publicRow());
    saveSequenceWithMetadataMock.mockRejectedValue(refused());
    await retryPendingSyncs();

    rows[0] = { ...rows[0], word: "HHHI" };
    vi.setSystemTime(T0 + DAY - 1);
    await retryPendingSyncs();
    expect(saveSequenceWithMetadataMock).toHaveBeenCalledTimes(1);

    vi.setSystemTime(T0 + DAY);
    saveSequenceWithMetadataMock.mockResolvedValue({});
    await retryPendingSyncs();
    expect(saveSequenceWithMetadataMock).toHaveBeenCalledTimes(2);
  });

  it("keeps retrying a transient failure on every pass", async () => {
    rows.push(publicRow());
    saveSequenceWithMetadataMock.mockRejectedValue(
      Object.assign(new Error("offline"), { code: "unavailable" })
    );

    await retryPendingSyncs();
    await retryPendingSyncs();

    expect(saveSequenceWithMetadataMock).toHaveBeenCalledTimes(2);
    expect(rows[0].pendingSyncMetadata.blockedReason).toBeUndefined();
  });

  it("retries right away after an explicit save rewrites the metadata", async () => {
    rows.push(publicRow());
    saveSequenceWithMetadataMock.mockRejectedValue(refused());
    await retryPendingSyncs();

    // LibrarySaveService writes fresh pendingSyncMetadata, without the block.
    rows[0] = {
      ...rows[0],
      pendingSyncMetadata: { visibility: "public", notes: "" },
    };
    await retryPendingSyncs();

    expect(saveSequenceWithMetadataMock).toHaveBeenCalledTimes(2);
  });
});

describe("shouldRetryBlockedPublish", () => {
  const block = {
    blockedReason: PUBLISH_PERMISSION_DENIED,
    blockedAt: T0,
    blockedContentHash: "a",
  };
  const hash = (value: string | undefined) => async () => value;

  it("lets unblocked rows through", async () => {
    expect(await shouldRetryBlockedPublish(undefined, T0, hash("a"))).toBe(
      true
    );
  });

  it("holds older blocks that carry no time or hash", async () => {
    expect(
      await shouldRetryBlockedPublish(
        { blockedReason: "PUBLIC_DUPLICATE" },
        T0 + 10 * DAY,
        hash("b")
      )
    ).toBe(false);
  });

  it("does not hash inside the window", async () => {
    const lazy = vi.fn(async () => "b");
    expect(await shouldRetryBlockedPublish(block, T0 + DAY - 1, lazy)).toBe(
      false
    );
    expect(lazy).not.toHaveBeenCalled();
  });

  it("holds unchanged or unhashable content after the window", async () => {
    expect(await shouldRetryBlockedPublish(block, T0 + DAY, hash("a"))).toBe(
      false
    );
    expect(
      await shouldRetryBlockedPublish(block, T0 + DAY, hash(undefined))
    ).toBe(false);
  });
});
