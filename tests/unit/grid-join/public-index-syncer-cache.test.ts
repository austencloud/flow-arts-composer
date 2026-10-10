/**
 * Publishing a joined sequence hands its one join on twice: into the document
 * written to the public mirror, and into the entry the Browse gallery caches
 * so the new sequence shows its join before the next catalog read. A sequence
 * on one grid gains no key in either place, and no cell carries a join.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  showUserError: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
}));

// The persister runs everything through runTransaction. The facade maps the
// transaction surface onto the same spies, so every write reads the same
// whether it is direct or transactional.
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
  serverTimestamp: vi.fn(() => ({ __serverTimestamp: true })),
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
vi.mock("#lib/shared/auth/firebase.js", () => ({
  getFirestoreInstance: vi.fn(async () => ({})),
}));
vi.mock("#lib/shared/application/get-error-handler.js", () => ({
  getErrorHandler: vi.fn(() => ({ showUserError: mocks.showUserError })),
}));
vi.mock(
  "#lib/shared/sequence-viewer/get-public-sequence-hash-matcher.js",
  () => ({
    getPublicSequenceHashMatcher: vi.fn(() => ({
      computeEncoderHash: vi.fn(async () => "encoder-hash-test"),
    })),
  })
);

import { PublicIndexSyncer } from "#lib/features/library/services/public-index-syncer.js";
import type { LibrarySequence } from "#lib/shared/library/domain/models/library-sequence.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { Letter } from "#lib/shared/foundation/domain/models/letter.js";
import {
  buildJoinFixture,
  joinOf,
  JOIN_EAST_ONE,
  type JoinFixtureOptions,
} from "./grid-join-fixtures";

const JOINED: JoinFixtureOptions = { sequenceJoin: JOIN_EAST_ONE };

/**
 * The fixture flow plus a fourth step: the public
 * gallery refuses anything shorter than four steps.
 */
function communityFlow(options: JoinFixtureOptions): LibrarySequence {
  const flow = buildJoinFixture({ ...options, lettered: true });
  const third = flow.steps[2]!;
  return {
    ...flow,
    steps: [
      ...flow.steps,
      { ...third, id: "fixture-step-4", stepNumber: 4, letter: Letter.D },
    ],
    // Short-circuits loop detection so no loop-labels read runs.
    loopType: "rotated",
    isCircular: true,
    forkCount: 0,
    viewCount: 0,
    starCount: 0,
  } as unknown as LibrarySequence;
}

/** A first publication: no public document, no claim, an existing owner. */
function primeFirstPublication(): void {
  mocks.getDoc.mockImplementation(async (ref: { path: string }) => {
    if (ref.path.startsWith("users/") && !ref.path.includes("/sequences/")) {
      return {
        exists: () => true,
        data: () => ({ displayName: "Austen" }),
      };
    }
    if (ref.path.includes("/sequences/")) {
      return { exists: () => true, data: () => ({}) };
    }
    return { exists: () => false, data: () => ({}) };
  });
  mocks.getDocs.mockImplementation(async (target: { path?: string }) =>
    target?.path?.includes("/tags")
      ? { forEach: () => {} }
      : { empty: true, docs: [] }
  );
}

/** What the syncer wrote to publicSequences/…, as the Firestore seam sees it. */
function publicWrite(): Record<string, unknown> {
  const call = mocks.setDoc.mock.calls.find(([ref]) =>
    (ref as { path: string }).path.startsWith("publicSequences/")
  );
  if (!call) throw new Error("nothing was written to publicSequences");
  return call[1] as Record<string, unknown>;
}

/** Publish `sequence` and return what the Browse cache was handed. */
async function publish(sequence: LibrarySequence) {
  const addToCache = vi.fn();
  await new PublicIndexSyncer(undefined, undefined, {
    addToCache,
  } as never).syncToPublicIndex(sequence, "owner-1");

  expect(addToCache).toHaveBeenCalledTimes(1);
  return {
    written: publicWrite(),
    cached: addToCache.mock.calls[0]![0] as SequenceData,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  primeFirstPublication();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("publishing a joined sequence", () => {
  it("writes the sequence's join to the public document, and none on any cell", async () => {
    const { written } = await publish(communityFlow(JOINED));

    expect(written["conjoined"]).toEqual(JOIN_EAST_ONE);
    expect("conjoined" in (written["startPlacement"] as object)).toBe(false);
    expect(
      (written["stepPairings"] as object[]).some(
        (pairing) => "conjoined" in pairing
      )
    ).toBe(false);
  });

  it("hands the Browse cache the same join", async () => {
    const { cached } = await publish(communityFlow(JOINED));

    expect(joinOf(cached)).toEqual(JOIN_EAST_ONE);
    expect(cached.steps.some((step) => "conjoined" in step)).toBe(false);
  });
});

describe("publishing a sequence on one grid", () => {
  it("writes no join key to the public document", async () => {
    const { written } = await publish(communityFlow({}));

    expect("conjoined" in written).toBe(false);
    expect("conjoined" in (written["startPlacement"] as object)).toBe(false);
    expect(
      (written["stepPairings"] as object[]).some(
        (pairing) => "conjoined" in pairing
      )
    ).toBe(false);
  });

  it("hands the Browse cache no join key", async () => {
    const { cached } = await publish(communityFlow({}));

    expect("conjoined" in cached).toBe(false);
    expect("startPlacement" in cached).toBe(false);
    expect(cached.steps.some((step) => "conjoined" in step)).toBe(false);
  });
});
