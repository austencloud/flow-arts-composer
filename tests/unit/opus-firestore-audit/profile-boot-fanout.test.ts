/**
 * Profile sign-in fan-out — per-boot scan of the owner's public sequences.
 *
 * Executable evidence for the Firestore cost audit
 * (docs/reports/opus-batch-2026-09-12/firestore-cost.md, finding H0).
 *
 * READ-ONLY AUDIT ARTEFACT. Assertions pin what production does TODAY.
 *
 * The call chain, which runs on EVERY page load for a signed-in creator:
 *
 *   onAuthStateChanged(user)                      auth-state.svelte.ts:548
 *     -> createOrUpdateUserDocument(user)         user-document-manager.ts:77
 *        -> getDoc(users/{uid})                                     1 read
 *        -> if (profileProjectionChanged || hasSavedSequences)      :347
 *           -> refreshPublicSequenceOwnerProfile()  public-sequence-persister.ts:790
 *              -> getDocs(publicSequences where ownerId == uid)     N reads
 *                 ^ no limit(), no cursor, no watermark
 *
 * `hasSavedSequences` is `sequenceCount > 0`. It is true for every creator who
 * has ever published, forever. So the guard does not prevent the scan on a
 * steady-state boot where nothing about the profile changed — it guarantees
 * it. The comment at user-document-manager.ts:341 explains why the repair is
 * unconditional (a prior profile write may have committed while its
 * projection fan-out failed offline), and the *writes* are correctly filtered
 * out when projections already match. The N document READS of the scan are
 * not filtered, and are paid in full on every boot.
 *
 * The tests below measure the no-op boot, which is the overwhelmingly common
 * case: what a creator pays to discover there is nothing to do.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  /** Docs returned by the ownerId-scoped publicSequences scan. */
  scanResult: [] as { id: string; data: () => Record<string, unknown> }[],
  /** Query clauses recorded for the scan, to prove there is no limit(). */
  scanClauses: [] as unknown[],
  scanCount: 0,
  transactions: 0,
  txWrites: 0,
  /** Documents visible inside runTransaction, keyed by full path. */
  txDocs: new Map<string, Record<string, unknown>>(),
}));

vi.mock("firebase/firestore", () => ({
  collection: vi.fn((_db: unknown, path: string) => ({ path })),
  doc: vi.fn((_db: unknown, path: string) => ({ path })),
  documentId: vi.fn(() => "__name__"),
  getDocs: vi.fn(async (q: unknown) => {
    mocks.scanCount++;
    mocks.scanClauses = q as unknown[];
    return {
      docs: mocks.scanResult,
      size: mocks.scanResult.length,
      forEach: (fn: (d: unknown) => void) => mocks.scanResult.forEach(fn),
    };
  }),
  getDoc: vi.fn(async () => ({ exists: () => false, data: () => undefined })),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  writeBatch: vi.fn(),
  serverTimestamp: vi.fn(() => "SERVER_TIME"),
  increment: vi.fn(),
  arrayUnion: vi.fn(),
  arrayRemove: vi.fn(),
  limit: vi.fn((n: number) => ({ kind: "limit", n })),
  orderBy: vi.fn((f: string) => ({ kind: "orderBy", f })),
  query: vi.fn((_ref: unknown, ...clauses: unknown[]) => clauses),
  where: vi.fn((field: unknown, op: string, value: unknown) => ({
    kind: "where",
    field,
    op,
    value,
  })),
  onSnapshot: vi.fn(),
  deleteField: vi.fn(() => ({ kind: "deleteField" })),
  runTransaction: vi.fn(async (_db: unknown, fn: (tx: unknown) => unknown) => {
    mocks.transactions++;
    const tx = {
      // Path-aware so the transaction body's real guards are exercised:
      // publicSequences/{id} must carry ownerId + schema version 2, and the
      // owner's own sequence doc must be visibility "public".
      get: vi.fn(async (ref: { path: string }) => {
        const stored = mocks.txDocs.get(ref.path);
        return {
          exists: () => stored !== undefined,
          data: () => stored,
        };
      }),
      set: vi.fn(() => {
        mocks.txWrites++;
      }),
      update: vi.fn(() => {
        mocks.txWrites++;
      }),
    };
    return fn(tx);
  }),
  Timestamp: { now: () => ({ toDate: () => new Date() }) },
}));

vi.mock("$lib/shared/auth/firebase", () => ({
  getFirestoreInstance: vi.fn(async () => ({})),
}));
vi.mock("$lib/shared/toast/state/toast-state.svelte", () => ({
  toast: { error: vi.fn(), warning: vi.fn(), success: vi.fn(), info: vi.fn() },
  showToast: vi.fn(),
}));

import { refreshPublicSequenceOwnerProfile } from "$lib/shared/library/services/public-sequence-persister";
import { PUBLIC_PROJECTION_SCHEMA_VERSION } from "$lib/shared/foundation/domain/models/public-sequence-wire-schema";

const OWNER = "creator-uid";
const PROFILE = { displayName: "Ada Lovelace", avatarUrl: "https://x/a.png" };

/** A publicSequences mirror doc whose projection already matches PROFILE. */
function upToDateMirror(id: string) {
  return {
    id,
    data: () => ({
      ownerId: OWNER,
      ownerDisplayName: PROFILE.displayName,
      ownerAvatarUrl: PROFILE.avatarUrl,
    }),
  };
}

/** A mirror doc still carrying the previous display name. */
function staleMirror(id: string) {
  return {
    id,
    data: () => ({
      ownerId: OWNER,
      ownerDisplayName: "Old Name",
      ownerAvatarUrl: PROFILE.avatarUrl,
    }),
  };
}

beforeEach(() => {
  mocks.scanResult = [];
  mocks.scanClauses = [];
  mocks.scanCount = 0;
  mocks.transactions = 0;
  mocks.txWrites = 0;
  mocks.txDocs.clear();
});

describe("H0 — the steady-state boot of an established creator", () => {
  it("reads every one of the creator's public sequences to write nothing", async () => {
    // A creator with 300 published sequences, all projections already current.
    mocks.scanResult = Array.from({ length: 300 }, (_, i) =>
      upToDateMirror(`seq-${i}`)
    );

    const result = await refreshPublicSequenceOwnerProfile(
      {} as never,
      OWNER,
      PROFILE
    );

    // DEFECT PINNED (H0): 300 billed document reads, 0 writes, 0 change.
    // Paid on every page load, by every creator, for the life of the account.
    expect(result).toEqual({
      scanned: 300,
      updated: 0,
      unchanged: 300,
      skipped: 0,
    });
    expect(mocks.transactions).toBe(0);
    expect(mocks.txWrites).toBe(0);
    expect(mocks.scanCount).toBe(1);
  });

  it("issues the scan with no limit() and no cursor", async () => {
    mocks.scanResult = [upToDateMirror("seq-0")];

    await refreshPublicSequenceOwnerProfile({} as never, OWNER, PROFILE);

    // The only clause is the ownerId equality filter. A growing collection with
    // a selective where() but no bound is exactly what
    // .claude/rules/firestore-cost-discipline.md calls out: the filter makes
    // the scan proportional to ONE user's library rather than the whole
    // collection, but nothing caps it.
    expect(mocks.scanClauses).toEqual([
      { kind: "where", field: "ownerId", op: "==", value: OWNER },
    ]);
    expect(
      mocks.scanClauses.some((c) => (c as { kind?: string }).kind === "limit")
    ).toBe(false);
  });

  it("scales linearly with the creator's library, unbounded", async () => {
    for (const size of [10, 100, 1000]) {
      mocks.scanResult = Array.from({ length: size }, (_, i) =>
        upToDateMirror(`seq-${i}`)
      );
      mocks.scanCount = 0;

      const result = await refreshPublicSequenceOwnerProfile(
        {} as never,
        OWNER,
        PROFILE
      );

      expect(result.scanned).toBe(size);
      expect(result.updated).toBe(0);
    }
  });
});

describe("the work the scan exists to do is correctly filtered", () => {
  it("only opens a transaction for mirrors whose projection actually differs", async () => {
    // 300 sequences, 3 of them stale. This is the genuine repair case and the
    // filtering here is right — which is why the fix for H0 is a skip-the-scan
    // watermark, not a change to this loop.
    mocks.scanResult = [
      ...Array.from({ length: 297 }, (_, i) => upToDateMirror(`seq-${i}`)),
      staleMirror("seq-a"),
      staleMirror("seq-b"),
      staleMirror("seq-c"),
    ];
    for (const id of ["seq-a", "seq-b", "seq-c"]) {
      mocks.txDocs.set(`publicSequences/${id}`, {
        ownerId: OWNER,
        ownerDisplayName: "Old Name",
        ownerAvatarUrl: PROFILE.avatarUrl,
        publicProjectionSchemaVersion: PUBLIC_PROJECTION_SCHEMA_VERSION,
      });
      mocks.txDocs.set(`users/${OWNER}/sequences/${id}`, {
        visibility: "public",
      });
    }

    const result = await refreshPublicSequenceOwnerProfile(
      {} as never,
      OWNER,
      PROFILE
    );

    expect(result.scanned).toBe(300);
    expect(result.updated).toBe(3);
    expect(result.unchanged).toBe(297);
    // One transaction per stale mirror: 2 reads + 2 writes each. Bounded by
    // what actually changed, as intended.
    expect(mocks.transactions).toBe(3);
  });
});
