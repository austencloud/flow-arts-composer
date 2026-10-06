/**
 * A joined sequence keeps its join into the public document and back out of
 * it: the projection writes the sequence's join only when it has one, the wire
 * schema reads it (and treats a malformed one as absent), and the Browse
 * loader hands it to the viewer, both from the public index and from the
 * owner's full document. A sequence without a join gains no key anywhere along
 * the way.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDoc: vi.fn(),
  getDocs: vi.fn(),
}));

vi.mock("firebase/firestore", () => ({
  collection: vi.fn((_db: unknown, path: string) => ({ path })),
  doc: vi.fn((_db: unknown, path: string) => ({ path })),
  getDoc: mocks.getDoc,
  getDocs: mocks.getDocs,
  orderBy: vi.fn((field: string, direction: string) => ({ field, direction })),
  limit: vi.fn((count: number) => ({ count })),
  startAfter: vi.fn((cursor: unknown) => ({ cursor })),
  query: vi.fn((reference: unknown) => reference),
}));

vi.mock("$lib/shared/auth/firebase", () => ({
  getFirestoreInstance: vi.fn(async () => ({})),
}));

vi.mock("$lib/shared/offline/state/network-status-state.svelte", () => ({
  networkStatusState: { isOnline: true },
}));

import { isGridJoin, sequenceGridJoinKey } from "@tka/render-core";
import { GridLocation } from "@tka/tka-types";
import { PublicSequencesLoader } from "$lib/shared/browse/services/public-sequences-loader";
import {
  parsePublicSequenceWireDocument,
  toPublicSequenceProjection,
} from "$lib/shared/foundation/domain/models/public-sequence-wire-schema";
import {
  buildPublicSequenceProjection,
  computeStoredProjectionDigest,
  type ProjectionSourceSequence,
  type PublicSequenceProjectionWrite,
} from "$lib/shared/library/services/public-sequence-projection";
import { normalizeSequenceForPersistence } from "$lib/shared/library/services/sequence-persistence-normalizer";
import {
  buildJoinFixture,
  joinsOf,
  JOIN_EAST_ONE,
  JOIN_NORTHEAST_TWO,
  JOIN_SOUTH_TWO,
  type JoinFixtureOptions,
} from "./grid-join-fixtures";

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const NOW = new Date("2026-10-05T12:00:00Z");

const JOINED: JoinFixtureOptions = {
  sequenceJoin: JOIN_EAST_ONE,
  startJoin: JOIN_NORTHEAST_TWO,
  stepJoins: [JOIN_SOUTH_TWO, undefined, null],
  lettered: true,
};

async function project(
  options: JoinFixtureOptions
): Promise<PublicSequenceProjectionWrite> {
  const source = buildJoinFixture({
    ...options,
    lettered: true,
  }) as ProjectionSourceSequence;
  const normalized = await normalizeSequenceForPersistence(source);
  return buildPublicSequenceProjection(
    normalized,
    {
      ownerId: "owner-1",
      ownerDisplayName: "Austen",
      tagNames: [],
      encoderHash: "encoder-hash",
      loop: { isCircular: false, loopType: null },
      now: NOW,
    },
    1,
    { kind: "first-publication" }
  );
}

/** What Firestore hands back: plain JSON, no `undefined`, dates as data. */
function stored(
  document: PublicSequenceProjectionWrite
): Record<string, unknown> {
  return JSON.parse(JSON.stringify(document)) as Record<string, unknown>;
}

describe("public projection", () => {
  it("writes the sequence's join, each step's join and the start cell's join", async () => {
    const document = await project(JOINED);

    expect(document.conjoined).toEqual(JOIN_EAST_ONE);
    expect(document.startPlacement?.conjoined).toEqual(JOIN_NORTHEAST_TWO);
    expect(document.stepPairings?.map((pairing) => pairing.conjoined)).toEqual([
      JOIN_SOUTH_TWO,
      undefined,
      null,
    ]);
  });

  it("writes no join key for a sequence on one grid", async () => {
    const document = await project({});

    expect("conjoined" in document).toBe(false);
    expect("conjoined" in (document.startPlacement ?? {})).toBe(false);
    expect(
      document.stepPairings?.some((pairing) => "conjoined" in pairing)
    ).toBe(false);
  });

  it("stamps a different digest for the joined sequence", async () => {
    const plain = await project({});
    const joined = await project({ sequenceJoin: JOIN_EAST_ONE });
    const other = await project({
      sequenceJoin: { toward: "w", steps: 1 },
    });

    expect(joined.publicProjectionDigest).not.toBe(
      plain.publicProjectionDigest
    );
    expect(other.publicProjectionDigest).not.toBe(
      joined.publicProjectionDigest
    );
  });

  it("keeps the stamped digest recomputable from the stored document", async () => {
    const document = await project(JOINED);

    expect(await computeStoredProjectionDigest(stored(document))).toBe(
      document.publicProjectionDigest
    );
  });
});

describe("public wire schema", () => {
  it("reads the join back out of a stored document", async () => {
    const parsed = parsePublicSequenceWireDocument(
      stored(await project(JOINED)),
      "fixture-sequence"
    );
    if (!parsed.ok) throw new Error(parsed.issues.join("; "));
    const projection = toPublicSequenceProjection(parsed.document);

    expect(projection.conjoined).toEqual(JOIN_EAST_ONE);
    expect(projection.startPlacement?.conjoined).toEqual(JOIN_NORTHEAST_TWO);
    expect(
      projection.stepPairings?.map((pairing) => pairing.conjoined)
    ).toEqual([JOIN_SOUTH_TWO, undefined, null]);
  });

  it("adds no join key to a document that had none", async () => {
    const parsed = parsePublicSequenceWireDocument(
      stored(await project({})),
      "fixture-sequence"
    );
    if (!parsed.ok) throw new Error(parsed.issues.join("; "));
    const projection = toPublicSequenceProjection(parsed.document);

    expect("conjoined" in projection).toBe(false);
    expect(
      projection.stepPairings?.some((pairing) => "conjoined" in pairing)
    ).toBe(false);
  });

  it("reads a malformed join as absent instead of rejecting the document", async () => {
    const document = stored(await project({}));
    const parsed = parsePublicSequenceWireDocument(
      {
        ...document,
        conjoined: { toward: "c", steps: 7 },
        stepPairings: (document.stepPairings as Record<string, unknown>[]).map(
          (pairing) => ({ ...pairing, conjoined: "e1" })
        ),
      },
      "fixture-sequence"
    );

    if (!parsed.ok) throw new Error(parsed.issues.join("; "));
    const projection = toPublicSequenceProjection(parsed.document);
    expect("conjoined" in projection).toBe(false);
    expect(
      projection.stepPairings?.every(
        (pairing) => pairing.conjoined === undefined
      )
    ).toBe(true);
  });

  describe("accepts exactly what the renderers accept", () => {
    const directions = [...Object.values(GridLocation), "up", "", 1, null];
    const distances = [0, 1, 2, 3, "1", null, undefined];
    const candidates: unknown[] = [
      ...directions.flatMap((toward) =>
        distances.map((steps) => ({ toward, steps }))
      ),
      { toward: "e", steps: 1, extra: true },
      { steps: 1 },
      { toward: "e" },
      "e1",
      7,
      [],
    ];

    it.each(
      candidates.map((candidate) => [JSON.stringify(candidate), candidate])
    )("%s", (_label, candidate) => {
      const parsed = parsePublicSequenceWireDocument({
        id: "seq",
        sourceRef: "users/owner/sequences/seq",
        ownerId: "owner",
        conjoined: candidate,
      });
      if (!parsed.ok) throw new Error(parsed.issues.join("; "));

      expect(parsed.document.conjoined !== undefined).toBe(
        isGridJoin(candidate)
      );
    });
  });
});

/** A catalog page that holds one public index document. */
function serveCatalog(document: Record<string, unknown>): void {
  mocks.getDocs.mockResolvedValue({
    docs: [{ id: "fixture-sequence" }],
    size: 1,
    forEach: (visit: (doc: { id: string; data: () => unknown }) => void) =>
      visit({ id: "fixture-sequence", data: () => document }),
  });
}

describe("Browse loader", () => {
  async function loadPublished(options: JoinFixtureOptions) {
    serveCatalog(stored(await project(options)));
    const [sequence] = await new PublicSequencesLoader().refreshFromFirestore();
    if (!sequence) throw new Error("loader returned no sequence");
    return sequence;
  }

  it("hands the viewer the sequence's, the start cell's and each step's join", async () => {
    const sequence = await loadPublished(JOINED);

    expect(joinsOf(sequence)).toEqual({
      sequence: JOIN_EAST_ONE,
      start: JOIN_NORTHEAST_TWO,
      steps: [JOIN_SOUTH_TWO, undefined, null],
    });
    expect(sequenceGridJoinKey(sequence)).toBe(
      sequenceGridJoinKey(buildJoinFixture(JOINED))
    );
  });

  it("keeps a start cell that stays on one grid while the rest are joined", async () => {
    const options: JoinFixtureOptions = {
      sequenceJoin: JOIN_EAST_ONE,
      startJoin: null,
      lettered: true,
    };
    const sequence = await loadPublished(options);

    expect(joinsOf(sequence).start).toBeNull();
    expect(sequenceGridJoinKey(sequence)).toBe(
      sequenceGridJoinKey(buildJoinFixture(options))
    );
  });

  it("adds no join to a sequence that had none", async () => {
    const sequence = await loadPublished({});

    expect(joinsOf(sequence)).toEqual({
      sequence: undefined,
      start: undefined,
      steps: [undefined, undefined, undefined],
    });
    expect("conjoined" in sequence).toBe(false);
    expect(sequence.steps.some((step) => "conjoined" in step)).toBe(false);
    expect(sequenceGridJoinKey(sequence)).toBe("");
  });
});

describe("Browse loader full sequence", () => {
  const SOURCE_PATH = "users/owner-1/sequences/fixture-sequence";

  /**
   * Warm the catalog from `indexed`, then open the sequence from the owner's
   * document `source` the way the viewer does.
   */
  async function openFromSource(
    indexed: JoinFixtureOptions,
    source: Record<string, unknown>
  ) {
    serveCatalog(stored(await project(indexed)));
    mocks.getDoc.mockResolvedValue({
      exists: () => true,
      id: "fixture-sequence",
      data: () => source,
      metadata: { fromCache: false },
    });
    const loader = new PublicSequencesLoader();
    await loader.refreshFromFirestore();
    const sequence = await loader.loadFullSequenceData(
      "ABC",
      "fixture-sequence"
    );
    if (!sequence) throw new Error("loader returned no sequence");
    return sequence;
  }

  it("reads the owner's document, not the warmed index entry", async () => {
    await openFromSource({}, stored(await project(JOINED)));

    expect(mocks.getDoc).toHaveBeenCalledWith({ path: SOURCE_PATH });
  });

  it("hands the viewer the joins the owner's document stores", async () => {
    // The warmed index entry predates the join, so only the source document
    // can supply it.
    const sequence = await openFromSource({}, stored(await project(JOINED)));

    expect(joinsOf(sequence)).toEqual({
      sequence: JOIN_EAST_ONE,
      start: JOIN_NORTHEAST_TWO,
      steps: [JOIN_SOUTH_TWO, undefined, null],
    });
    expect(sequenceGridJoinKey(sequence)).toBe(
      sequenceGridJoinKey(buildJoinFixture(JOINED))
    );
  });

  it("keeps a start cell that stays on one grid while the rest are joined", async () => {
    const options: JoinFixtureOptions = {
      sequenceJoin: JOIN_EAST_ONE,
      startJoin: null,
      lettered: true,
    };
    const sequence = await openFromSource({}, stored(await project(options)));

    expect(joinsOf(sequence).start).toBeNull();
    expect(sequenceGridJoinKey(sequence)).toBe(
      sequenceGridJoinKey(buildJoinFixture(options))
    );
  });

  it("hands the viewer the joins of a document that stores its steps as they are", async () => {
    vi.spyOn(console, "debug").mockImplementation(() => {});
    const saved = JSON.parse(
      JSON.stringify(buildJoinFixture({ ...JOINED, lettered: true }))
    ) as Record<string, unknown>;
    const sequence = await openFromSource({}, saved);

    expect(joinsOf(sequence)).toEqual({
      sequence: JOIN_EAST_ONE,
      start: JOIN_NORTHEAST_TWO,
      steps: [JOIN_SOUTH_TWO, undefined, null],
    });
  });

  it("adds no join to a document that had none", async () => {
    const sequence = await openFromSource({}, stored(await project({})));

    expect(joinsOf(sequence)).toEqual({
      sequence: undefined,
      start: undefined,
      steps: [undefined, undefined, undefined],
    });
    expect("conjoined" in sequence).toBe(false);
    expect("conjoined" in (sequence.startPlacement ?? {})).toBe(false);
    expect(sequence.steps.some((step) => "conjoined" in step)).toBe(false);
    expect(sequenceGridJoinKey(sequence)).toBe("");
  });
});
