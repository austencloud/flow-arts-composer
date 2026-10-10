/**
 * The arena opens a sequence from its owner's document. A joined sequence
 * keeps its one join through that read, and a sequence on one grid gains no
 * key.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDoc: vi.fn(),
}));

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(),
  doc: vi.fn((_db: unknown, path: string) => ({ path })),
  getDoc: mocks.getDoc,
  getDocs: vi.fn(),
  writeBatch: vi.fn(),
  Timestamp: { now: vi.fn(), fromDate: vi.fn() },
}));
vi.mock("#lib/shared/auth/firebase.js", () => ({
  getFirestoreInstance: vi.fn(async () => ({})),
}));
vi.mock("#lib/shared/firestore/index.js", async () => {
  const { z } = await import("zod");
  return {
    firestoreGet: vi.fn(),
    firestoreList: vi.fn(),
    firestoreSet: vi.fn(),
    firestoreDate: z.any(),
  };
});

import { loadFullSequenceData } from "#lib/features/arena/services/arena-repository.js";
import { sequenceGridJoinKey } from "@tka/render-core";
import { ensureComposition } from "#lib/shared/foundation/services/sequence-hydrator.js";
import {
  buildJoinFixture,
  joinOf,
  JOIN_EAST_ONE,
  type JoinFixtureOptions,
} from "./grid-join-fixtures";

const SOURCE_PATH = "users/owner-1/sequences/fixture-sequence";

const JOINED: JoinFixtureOptions = { sequenceJoin: JOIN_EAST_ONE };

/** What Firestore holds for a saved sequence: plain JSON with no `undefined`. */
function ownerDocument(options: JoinFixtureOptions) {
  const saved = ensureComposition(
    buildJoinFixture({ ...options, lettered: true })
  );
  return JSON.parse(JSON.stringify(saved)) as Record<string, unknown>;
}

async function openFromOwnerDocument(options: JoinFixtureOptions) {
  mocks.getDoc.mockResolvedValue({
    exists: () => true,
    id: "fixture-sequence",
    data: () => ownerDocument(options),
  });
  const sequence = await loadFullSequenceData(SOURCE_PATH);
  if (!sequence) throw new Error("the arena returned no sequence");
  return sequence;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("arena full sequence", () => {
  it("reads the document its source reference names", async () => {
    await openFromOwnerDocument(JOINED);

    expect(mocks.getDoc).toHaveBeenCalledWith({ path: SOURCE_PATH });
  });

  it("keeps the sequence's join, and no cell gains one", async () => {
    const sequence = await openFromOwnerDocument(JOINED);

    expect(joinOf(sequence)).toEqual(JOIN_EAST_ONE);
    expect(sequenceGridJoinKey(sequence)).toBe(
      sequenceGridJoinKey(buildJoinFixture({ ...JOINED, lettered: true }))
    );
    expect("conjoined" in (sequence.startPlacement ?? {})).toBe(false);
    expect(sequence.steps.some((step) => "conjoined" in step)).toBe(false);
  });

  it("adds no join to a sequence that had none", async () => {
    const sequence = await openFromOwnerDocument({});

    expect(joinOf(sequence)).toBeUndefined();
    expect("conjoined" in sequence).toBe(false);
    expect("conjoined" in (sequence.startPlacement ?? {})).toBe(false);
    expect(sequence.steps.some((step) => "conjoined" in step)).toBe(false);
  });
});
