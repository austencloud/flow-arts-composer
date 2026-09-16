/**
 * PublicIndexSyncer × projection builder — the Phase 1.5 rewiring.
 *
 * `syncToPublicIndex` no longer assembles the public document by hand; it
 * normalizes, reads the prior public document, and writes what
 * `buildPublicSequenceProjection` returns. These tests pin the wiring at the
 * seam Firestore sees:
 *
 *   - a first publication stamps `publishedAt` once and seeds counters
 *   - a resync PRESERVES `publishedAt` and the engagement counters — the
 *     corpus-wide defect (`publishedAt: serverTimestamp()` on every setDoc)
 *     must be unreproducible through this path
 *   - a failed read of the prior document ABORTS the publish; it is never
 *     treated as a first publication
 *   - normalizer refusals (incomplete word) throw BEFORE any Firestore access
 *   - a failed tag read fails the publish (spec section 5)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const SERVER_TS = { __serverTimestamp: true } as const;

const mocks = vi.hoisted(() => ({
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
}));

// The persister runs everything through runTransaction. The facade maps the
// transaction surface onto the same spies, so assertions read identically for
// direct and transactional writes — and a tx.get failure propagates exactly
// like a getDoc failure, which is what the abort tests rely on.
vi.mock("firebase/firestore", () => ({
  collection: vi.fn((_db: unknown, path: string) => ({ path })),
  doc: vi.fn((_db: unknown, ...segments: string[]) => ({
    path: segments.join("/"),
  })),
  getDoc: mocks.getDoc,
  getDocs: mocks.getDocs,
  setDoc: mocks.setDoc,
  updateDoc: mocks.updateDoc,
  deleteDoc: mocks.deleteDoc,
  serverTimestamp: vi.fn(() => SERVER_TS),
  deleteField: vi.fn(() => ({ __deleteField: true })),
  runTransaction: vi.fn(
    async (
      _db: unknown,
      fn: (tx: unknown) => Promise<unknown>
    ): Promise<unknown> =>
      fn({
        get: (ref: unknown) => mocks.getDoc(ref),
        set: (ref: unknown, data: unknown) => void mocks.setDoc(ref, data),
        update: (ref: unknown, data: unknown) =>
          void mocks.updateDoc(ref, data),
        delete: (ref: unknown) => void mocks.deleteDoc(ref),
      })
  ),
  query: vi.fn((target: { path?: string }) => ({ __query: true, target })),
  where: vi.fn(),
  limit: vi.fn(),
}));
vi.mock("$lib/shared/auth/firebase", () => ({
  getFirestoreInstance: vi.fn(async () => ({})),
}));
vi.mock("$lib/shared/application/get-error-handler", () => ({
  getErrorHandler: vi.fn(() => ({ showUserError: vi.fn() })),
}));
vi.mock("$lib/shared/sequence-viewer/get-public-sequence-hash-matcher", () => ({
  getPublicSequenceHashMatcher: vi.fn(() => ({
    computeEncoderHash: vi.fn(async () => "encoder-hash-test"),
  })),
}));

import { PublicIndexSyncer } from "../public-index-syncer";
import { IncompleteWordError } from "$lib/shared/foundation/services/word-deriver";
import { createSequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { createMotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import type { LibrarySequence } from "$lib/shared/library/domain/models/library-sequence";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import {
  HandSide,
  MotionType,
  Orientation,
  RotationDirection,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { GridLocation } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";

// Fixtures

const CYCLE: readonly GridLocation[] = [
  GridLocation.NORTH,
  GridLocation.EAST,
  GridLocation.SOUTH,
  GridLocation.WEST,
];

function motionAt(from: GridLocation, to: GridLocation, color: HandSide) {
  return createMotionData({
    motionType: MotionType.PRO,
    rotationDirection: RotationDirection.CLOCKWISE,
    startLocation: from,
    endLocation: to,
    startOrientation: Orientation.IN,
    endOrientation: Orientation.IN,
    turns: 0,
    propType: PropType.STAFF,
    hand: color,
  });
}

function makeStep(index: number, letter: string | null): StepData {
  return {
    id: `step-${index + 1}`,
    stepNumber: index + 1,
    duration: 1,
    leftReversal: false,
    rightReversal: false,
    isBlank: false,
    letter: letter as StepData["letter"],
    startPlacement: null,
    endPlacement: null,
    motions: {
      left: motionAt(
        CYCLE[index % 4] as GridLocation,
        CYCLE[(index + 1) % 4] as GridLocation,
        HandSide.LEFT
      ),
      right: motionAt(
        CYCLE[(index + 2) % 4] as GridLocation,
        CYCLE[(index + 3) % 4] as GridLocation,
        HandSide.RIGHT
      ),
    },
  };
}

function makeSequence(word = "ABCD", overrides: Partial<LibrarySequence> = {}) {
  return {
    ...createSequenceData({
      id: "seq-1",
      name: "Assemble Sequence",
      word: "Assemble Sequence",
      steps: word.split("").map((letter, i) => makeStep(i, letter)),
      // Short-circuits detectLoopInfo at layer 1 so no loop-labels read runs.
      loopType: "rotated" as never,
      isCircular: true,
    }),
    forkCount: 7,
    viewCount: 11,
    starCount: 3,
    ...overrides,
  } as unknown as LibrarySequence;
}

/** Route getDoc (and the transaction facade's tx.get) by document path. */
function primeGetDoc(options: {
  publicDoc?: { exists: boolean; data?: Record<string, unknown> } | "fail";
  claim?: Record<string, unknown>;
}) {
  mocks.getDoc.mockImplementation(async (ref: { path: string }) => {
    if (ref.path.startsWith("publicSequences/")) {
      if (options.publicDoc === "fail") {
        throw new Error("prior-read unavailable");
      }
      const publicDoc = options.publicDoc ?? { exists: false };
      return {
        exists: () => publicDoc.exists,
        data: () => publicDoc.data ?? {},
      };
    }
    if (ref.path.startsWith("publicSequenceHashes/")) {
      return {
        exists: () => options.claim !== undefined,
        data: () => options.claim ?? {},
      };
    }
    if (ref.path.includes("/sequences/")) {
      // The owner document, read by the transaction for projection stamps.
      return { exists: () => true, data: () => ({}) };
    }
    if (ref.path.startsWith("users/")) {
      return {
        exists: () => true,
        data: () => ({
          displayName: "Austen",
          photoURL: "https://a.test/p.png",
        }),
      };
    }
    // loop-labels and anything else: absent.
    return { exists: () => false, data: () => ({}) };
  });
}

/** Route getDocs: tag collections resolve empty; the dedup query finds nothing. */
function primeGetDocs() {
  mocks.getDocs.mockImplementation(async (target: { path?: string }) => {
    if (target?.path?.includes("/tags")) {
      return { forEach: () => {} };
    }
    return { empty: true, docs: [] };
  });
}

/** The one write to publicSequences/… (artifact writes go elsewhere). */
function publicWrite(): Record<string, unknown> {
  const call = mocks.setDoc.mock.calls.find(([ref]) =>
    (ref as { path: string }).path.startsWith("publicSequences/")
  );
  expect(call).toBeDefined();
  return call![1] as Record<string, unknown>;
}

/** The hash-claim write, if any. */
function claimWrite(): { path: string; data: Record<string, unknown> } | null {
  const call = mocks.setDoc.mock.calls.find(([ref]) =>
    (ref as { path: string }).path.startsWith("publicSequenceHashes/")
  );
  return call
    ? {
        path: (call[0] as { path: string }).path,
        data: call[1] as Record<string, unknown>,
      }
    : null;
}

function revisionWrite(): {
  path: string;
  data: Record<string, unknown>;
} | null {
  const call = mocks.setDoc.mock.calls.find(([ref]) =>
    (ref as { path: string }).path.startsWith("sequenceRevisions/")
  );
  return call
    ? {
        path: (call[0] as { path: string }).path,
        data: call[1] as Record<string, unknown>,
      }
    : null;
}

beforeEach(() => {
  vi.clearAllMocks();
  primeGetDocs();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("syncToPublicIndex — first publication", () => {
  it("writes the projection: derived word, canonical length, stamps, seeds", async () => {
    primeGetDoc({ publicDoc: { exists: false } });

    await new PublicIndexSyncer().syncToPublicIndex(makeSequence(), "owner-1");

    const written = publicWrite();
    // The derived word — never the "Assemble Sequence" auto-title the input
    // carries in BOTH its name and word fields.
    expect(written["word"]).toBe("ABCD");
    expect(written["name"]).toBe("Assemble Sequence");
    // Canonical count, not steps?.length ?? 0.
    expect(written["sequenceLength"]).toBe(4);
    // First publication: stamped now, counters seeded from the owner doc.
    expect(written["publishedAt"]).toBe(SERVER_TS);
    expect(written["forkCount"]).toBe(7);
    expect(written["viewCount"]).toBe(11);
    expect(written["starCount"]).toBe(3);
    expect(written["publicProjectionRevision"]).toBe(1);
    expect(written["publicProjectionSchemaVersion"]).toBe(2);
    expect(typeof written["publicProjectionDigest"]).toBe("string");
    expect(written["encoderHash"]).toBe("encoder-hash-test");
    expect(written["ownerDisplayName"]).toBe("Austen");
    // Self-containment payload present.
    expect(written["leftSoloProp"]).toBeTruthy();
    expect(written["rightSoloProp"]).toBeTruthy();
    expect(written["stepPairings"]).toHaveLength(4);
    expect(written["startPlacement"]).toBeTruthy();
    const retained = revisionWrite();
    expect(retained).not.toBeNull();
    expect(retained!.path).toMatch(/^sequenceRevisions\/v1_[a-f0-9]{64}$/);
    expect(retained!.data["sequenceId"]).toBe("seq-1");
    expect(retained!.data["contentHash"]).toBe(written["contentHash"]);
  });

  it("claims the content hash and stamps the owner document in the same transaction", async () => {
    primeGetDoc({ publicDoc: { exists: false } });

    await new PublicIndexSyncer().syncToPublicIndex(makeSequence(), "owner-1");

    const written = publicWrite();
    const claim = claimWrite();
    expect(claim).not.toBeNull();
    expect(claim!.path).toBe(
      `publicSequenceHashes/${written["contentHashVersion"]}_${written["contentHash"]}`
    );
    expect(claim!.data["sequenceId"]).toBe("seq-1");
    expect(claim!.data["ownerId"]).toBe("owner-1");

    // Owner projection stamps move with the mirror, so the two cannot disagree.
    const ownerStamp = mocks.updateDoc.mock.calls.find(([ref]) =>
      (ref as { path: string }).path.includes("/sequences/seq-1")
    );
    expect(ownerStamp).toBeDefined();
    const stamped = ownerStamp![1] as Record<string, unknown>;
    expect(stamped["publicProjectionDigest"]).toBe(
      written["publicProjectionDigest"]
    );
    expect(stamped["publicProjectionRevision"]).toBe(1);
    expect(stamped["word"]).toBe("ABCD");
  });

  it("rejects with a typed PublicDuplicateError when another sequence owns the claim", async () => {
    primeGetDoc({
      publicDoc: { exists: false },
      claim: { sequenceId: "someone-elses-seq", ownerId: "owner-9" },
    });

    await expect(
      new PublicIndexSyncer().syncToPublicIndex(makeSequence(), "owner-1")
    ).rejects.toMatchObject({ code: "PUBLIC_DUPLICATE" });

    // The transaction commits nothing on a duplicate.
    expect(mocks.setDoc).not.toHaveBeenCalled();
    expect(mocks.updateDoc).not.toHaveBeenCalled();
  });

  it("republishing the SAME sequence over its own claim is not a duplicate", async () => {
    // First-writer-wins must not lock out the winner itself.
    primeGetDoc({
      publicDoc: { exists: false },
      claim: { sequenceId: "seq-1", ownerId: "owner-1" },
    });

    await new PublicIndexSyncer().syncToPublicIndex(makeSequence(), "owner-1");

    expect(publicWrite()["word"]).toBe("ABCD");
    // The existing claim is kept, not rewritten.
    expect(claimWrite()).toBeNull();
  });
});

describe("syncToPublicIndex — resync over an existing document", () => {
  it("preserves publishedAt and the engagement counters", async () => {
    const originalPublishedAt = { seconds: 1_700_000_000, nanoseconds: 0 };
    primeGetDoc({
      publicDoc: {
        exists: true,
        data: {
          publishedAt: originalPublishedAt,
          forkCount: 42,
          viewCount: 9000,
          starCount: 17,
          publicProjectionRevision: 3,
          publicProjectionDigest: "stale-digest-from-a-previous-write",
        },
      },
    });

    await new PublicIndexSyncer().syncToPublicIndex(makeSequence(), "owner-1");

    const written = publicWrite();
    // The defect this wiring ends: publishedAt survives the republish.
    expect(written["publishedAt"]).toBe(originalPublishedAt);
    expect(written["publishedAt"]).not.toBe(SERVER_TS);
    // Public-owned counters win over the owner document's stale counts.
    expect(written["forkCount"]).toBe(42);
    expect(written["viewCount"]).toBe(9000);
    expect(written["starCount"]).toBe(17);
    // Content differs from the stale digest, so the revision advances.
    expect(written["publicProjectionRevision"]).toBe(4);
  });

  it("aborts the publish when the prior-document read fails", async () => {
    primeGetDoc({ publicDoc: "fail" });

    await expect(
      new PublicIndexSyncer().syncToPublicIndex(makeSequence(), "owner-1")
    ).rejects.toThrow("prior-read unavailable");

    // Nothing written: a failed read is never treated as a first publication.
    expect(mocks.setDoc).not.toHaveBeenCalled();
  });
});

describe("syncToPublicIndex — refusals fire before Firestore", () => {
  it("rejects an incomplete word without any read or write", async () => {
    const sequence = makeSequence("ABCD", {
      steps: "ABCD".split("").map((l, i) => makeStep(i, i === 2 ? null : l)),
    } as Partial<LibrarySequence>);

    await expect(
      new PublicIndexSyncer().syncToPublicIndex(sequence, "owner-1")
    ).rejects.toBeInstanceOf(IncompleteWordError);

    expect(mocks.getDoc).not.toHaveBeenCalled();
    expect(mocks.setDoc).not.toHaveBeenCalled();
  });

  it("fails the publish when the tag read fails, before the document write", async () => {
    primeGetDoc({ publicDoc: { exists: false } });
    mocks.getDocs.mockImplementation(async (target: { path?: string }) => {
      if (target?.path?.includes("/tags")) throw new Error("offline");
      return { empty: true, docs: [] };
    });
    const sequence = makeSequence("ABCD", {
      tagIds: ["t-fire"],
    } as Partial<LibrarySequence>);

    await expect(
      new PublicIndexSyncer().syncToPublicIndex(sequence, "owner-1")
    ).rejects.toThrow(/tag read failed/);

    expect(mocks.setDoc).not.toHaveBeenCalled();
  });
});
