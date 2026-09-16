/**
 * The public projection builder — the single writer of a
 * `publicSequences/{id}` document.
 *
 * Each block pins a defect that is live in the 2026-07-25 corpus, or an
 * invariant the hand-built literal at `public-index-syncer.ts:148-198` cannot
 * hold:
 *   - six fields consumers read that the literal never writes
 *   - seven fields the main Browse mapper drops but the public collection view
 *     reads
 *   - `publishedAt: serverTimestamp()` re-stamped on every republish (`:174`)
 *   - engagement counters reset by a full `setDoc`
 *
 * Fixtures follow `sequence-persistence-normalizer.test.ts`: author a
 * steps-based sequence, run it through the real normalizer, and project THAT —
 * so the input to the builder is byte-for-byte what the write path produces.
 */
import { describe, expect, it } from "vitest";

import {
  buildPublicSequenceProjection,
  PROJECTION_DIGEST_EXCLUDED_KEYS,
  PUBLIC_PROJECTION_SCHEMA_VERSION,
  PUBLIC_THUMBNAIL_LIMIT,
  type ExistingPublicOwnedFields,
  type ProjectionSourceSequence,
  type PublicProjectionContext,
} from "../public-sequence-projection";
import {
  normalizeSequenceForPersistence,
  type NormalizedSequenceWrite,
} from "../sequence-persistence-normalizer";
import { createSequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { createMotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import {
  HandSide,
  MotionType,
  Orientation,
  RotationDirection,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import {
  GridLocation,
  GridMode,
} from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import { LOOPComponent } from "@tka/sequence-engine/loop";

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

function makeStep(index: number, letter: string): StepData {
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

const CREATOR_INTENT = {
  propConfig: {
    leftPropType: PropType.STAFF,
    rightPropType: PropType.STAFF,
    catDogMode: false,
  },
  effortTimeline: null,
} as const;

/**
 * A sequence carrying every field the projection is supposed to move, plus the
 * private ones it must leave behind.
 */
function buildSourceSequence(
  word = "ABCD",
  overrides: Partial<ProjectionSourceSequence> = {}
): ProjectionSourceSequence {
  const base = createSequenceData({
    id: "seq-1",
    // A user-authored title. It must never become the word.
    name: "Assemble Sequence",
    displayName: "My Favourite Loop",
    intendedWord: "CAKE",
    word: "",
    steps: word.split("").map((letter, i) => makeStep(i, letter)),
    thumbnails: ["t1.png", "t2.png", "t3.png", "t4.png"],
    gridMode: GridMode.DIAMOND,
    reversalPattern: "book",
    creatorIntent: CREATOR_INTENT,
    animatedSequenceUrl: "https://example.test/anim.webp",
    animationFormat: "webp",
    // Private — must not reach the public document.
    notes: "my private tagline",
    cardPresentation: {
      schemaVersion: 1,
      footer: { mode: "custom", text: "Shared footer" },
    },
    performanceVideoUrl: "https://example.test/private.mp4",
    performanceVideoPath: "users/u1/private.mp4",
    animatedSequencePath: "users/u1/anim.webp",
    metadata: { pathShape: "linear", secretFlag: true },
  });

  return {
    ...base,
    // `createSequenceData` has no passthrough for `birthday`/`createdAt`
    // (`sequence-data.ts:235-330` handles `dateAdded` but neither of these), so
    // they are set here rather than through the factory.
    birthday: new Date("2024-03-01T00:00:00Z"),
    createdAt: new Date("2025-01-01T00:00:00Z"),
    source: "forked",
    forkAttribution: {
      originalSequenceId: "seq-0",
      originalCreatorId: "creator-9",
      originalCreatorName: "Original Creator",
      forkedAt: new Date("2025-02-01T00:00:00Z"),
    },
    forkCount: 7,
    viewCount: 11,
    starCount: 3,
    ...overrides,
  } as ProjectionSourceSequence;
}

function buildContext(
  overrides: Partial<PublicProjectionContext> = {}
): PublicProjectionContext {
  return {
    ownerId: "owner-1",
    ownerDisplayName: "Austen",
    ownerAvatarUrl: "https://example.test/avatar.png",
    tagNames: ["flow", "loop"],
    encoderHash: "encoder-hash-abc",
    loop: {
      isCircular: true,
      loopType: "rotated",
      period: 2,
      components: [LOOPComponent.ROTATED],
      componentDomains: { [LOOPComponent.ROTATED]: "location" },
      loopSpec: undefined,
    },
    difficultyLevel: "intermediate",
    level: 3,
    now: new Date("2026-07-25T12:00:00Z"),
    ...overrides,
  };
}

async function normalize(
  sequence: ProjectionSourceSequence
): Promise<NormalizedSequenceWrite<ProjectionSourceSequence>> {
  return normalizeSequenceForPersistence(sequence);
}

/**
 * Project a freshly normalized fixture in one step.
 *
 * `existing` maps to the prior-state discriminant: supplied fields assert an
 * existing document was read; omission asserts a verified first publication.
 * The builder itself has no undefined-means-first-publication path — a failed
 * read of the current document must abort the caller, never reach the builder.
 */
async function project(
  options: {
    word?: string;
    source?: Partial<ProjectionSourceSequence>;
    context?: Partial<PublicProjectionContext>;
    revision?: number;
    existing?: ExistingPublicOwnedFields;
  } = {}
) {
  const normalized = await normalize(
    buildSourceSequence(options.word ?? "ABCD", options.source)
  );
  return buildPublicSequenceProjection(
    normalized,
    buildContext(options.context),
    options.revision ?? 1,
    options.existing
      ? { kind: "existing", fields: options.existing }
      : { kind: "first-publication" }
  );
}

/** Rebuild an object with its keys in reverse insertion order, recursively. */
function reverseKeyOrder<T>(value: T): T {
  if (Array.isArray(value)) return value.map(reverseKeyOrder) as unknown as T;
  if (value === null || typeof value !== "object" || value instanceof Date) {
    return value;
  }
  const entries = Object.entries(value as Record<string, unknown>).reverse();
  const out: Record<string, unknown> = {};
  for (const [key, child] of entries) out[key] = reverseKeyOrder(child);
  return out as T;
}

/** Every path in `value` whose leaf is literally `undefined`. */
function undefinedPaths(value: unknown, path = "$"): string[] {
  if (value === undefined) return [path];
  if (value === null || typeof value !== "object" || value instanceof Date) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item, i) => undefinedPaths(item, `${path}[${i}]`));
  }
  return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) =>
    undefinedPaths(v, `${path}.${k}`)
  );
}

// ---------------------------------------------------------------------------
// Field coverage — the whole point of the builder
// ---------------------------------------------------------------------------

describe("buildPublicSequenceProjection — field coverage", () => {
  it("writes the six fields consumers read that the syncer literal never writes", async () => {
    const projection = await project();

    // browse-filter.ts:459 / loop-labeler/services/sequence-loader.ts:44
    expect(projection.gridMode).toBe(GridMode.DIAMOND);
    // browse-filter.ts:196
    expect(projection.intendedWord).toBe("CAKE");
    // browse-filter.ts:654
    expect(projection.reversalPattern).toBe("book");
    // public-sequences-loader.ts:321 -> loop-display-resolver.ts:301
    expect(projection.componentDomains).toEqual({
      [LOOPComponent.ROTATED]: "location",
    });
    // feed-loader.ts:105,107,141,148
    expect(projection.animatedSequenceUrl).toBe(
      "https://example.test/anim.webp"
    );
    expect(projection.animationFormat).toBe("webp");
  });

  it("writes the seven fields the Browse mapper drops but the collection view reads", async () => {
    const projection = await project();

    // collection-firestore-mapper.ts:180-218 via LibrarySequenceDocSchema
    expect(projection.forkCount).toBe(7);
    expect(projection.viewCount).toBe(11);
    expect(projection.starCount).toBe(3);
    expect(projection.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(projection.contentHashVersion).toBe(3);
    expect(projection.creatorIntent).toEqual(CREATOR_INTENT);
    // Not derivable from the compositional fields; dropping it empties the
    // start cell (the bug the 2026-06 backfill repaired).
    expect(projection.startPlacement).toBeTruthy();
  });

  it("writes every compositional field Browse hydrates from", async () => {
    const projection = await project();

    // public-sequences-loader.ts:336-342,355
    expect(projection.leftSoloProp).toBeTruthy();
    expect(projection.rightSoloProp).toBeTruthy();
    expect(projection.stepPairings).toHaveLength(4);
    expect(projection.leftPathHash).toBeTruthy();
    expect(projection.rightPathHash).toBeTruthy();
    expect(projection.leftSoloHash).toBeTruthy();
    expect(projection.rightSoloHash).toBeTruthy();
  });

  it("writes identity, presentation, LOOP, tag, and fork fields", async () => {
    const projection = await project();

    expect(projection.id).toBe("seq-1");
    expect(projection.sourceRef).toBe("users/owner-1/sequences/seq-1");
    expect(projection.ownerId).toBe("owner-1");
    expect(projection.ownerDisplayName).toBe("Austen");
    expect(projection.ownerAvatarUrl).toBe("https://example.test/avatar.png");

    expect(projection.name).toBe("Assemble Sequence");
    expect(projection.displayName).toBe("My Favourite Loop");

    expect(projection.difficultyLevel).toBe("intermediate");
    expect(projection.level).toBe(3);

    expect(projection.isCircular).toBe(true);
    expect(projection.loopType).toBe("rotated");
    expect(projection.period).toBe(2);
    expect(projection.components).toEqual([LOOPComponent.ROTATED]);

    expect(projection.tags).toEqual(["flow", "loop"]);
    expect(projection.encoderHash).toBe("encoder-hash-abc");

    expect(projection.isForked).toBe(true);
    expect(projection.originalCreatorId).toBe("creator-9");
    expect(projection.originalCreatorName).toBe("Original Creator");

    expect(projection.birthday).toEqual(new Date("2024-03-01T00:00:00Z"));
    expect(projection.publicProjectionSchemaVersion).toBe(
      PUBLIC_PROJECTION_SCHEMA_VERSION
    );
  });

  it("takes the word from strict derivation, never from the name", async () => {
    // `library-repository.ts:708` does `word: sequence.word || metadata.name`,
    // which is how auto-titles like "Assemble Sequence" became stored words.
    const projection = await project();

    expect(projection.word).toBe("ABCD");
    expect(projection.name).toBe("Assemble Sequence");
    expect(projection.word).not.toBe(projection.name);
  });

  it("takes the length from the canonical count, never steps?.length ?? 0", async () => {
    // `public-index-syncer.ts:158` reads `sequence.steps?.length ?? 0`, which is
    // 0 for the composition-only documents Firestore actually stores.
    const normalized = await normalize(buildSourceSequence("ABCDEFGH"));
    const compositionOnly = {
      ...normalized,
      ownerData: { ...normalized.ownerData, steps: undefined },
    } as NormalizedSequenceWrite<ProjectionSourceSequence>;

    const projection = await buildPublicSequenceProjection(
      compositionOnly,
      buildContext(),
      1,
      { kind: "first-publication" }
    );

    expect(projection.sequenceLength).toBe(8);
  });

  it("falls back to createdAt when the sequence has no birthday", async () => {
    // Browse prefers `birthday` over `publishedAt` so the gallery shows a real
    // creation date rather than a bulk-publish date
    // (`public-sequences-loader.ts:328-329`).
    const withBirthday = await project();
    expect(withBirthday.birthday).toEqual(new Date("2024-03-01T00:00:00Z"));

    const withoutBirthday = await project({ source: { birthday: undefined } });
    expect(withoutBirthday.birthday).toEqual(new Date("2025-01-01T00:00:00Z"));

    const withNeither = (await project({
      source: { birthday: undefined, createdAt: undefined },
    })) as unknown as Record<string, unknown>;
    expect("birthday" in withNeither).toBe(false);
  });

  it("caps thumbnails at the public preview limit", async () => {
    const projection = await project();
    expect(PUBLIC_THUMBNAIL_LIMIT).toBe(3);
    expect(projection.thumbnails).toEqual(["t1.png", "t2.png", "t3.png"]);
  });

  it("leaves private fields, derived fields, and the metadata bag behind", async () => {
    const projection = (await project()) as unknown as Record<string, unknown>;

    for (const key of [
      "notes",
      "cardPresentation",
      "performanceVideoUrl",
      "performanceVideoPath",
      "animatedSequencePath",
      "metadata",
      "steps",
      "startingPlacement",
      "startingPlacementGroup",
      "syncStatus",
      "pendingSyncMetadata",
      "visibility",
      "isDeleted",
      "_version",
      "collectionIds",
      "tagIds",
      "sequenceTags",
      "isFavorite",
    ]) {
      expect(key in projection).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Digest
// ---------------------------------------------------------------------------

describe("buildPublicSequenceProjection — digest", () => {
  it("is deterministic for the same inputs", async () => {
    const a = await project();
    const b = await project();

    expect(a.publicProjectionDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(a.publicProjectionDigest).toBe(b.publicProjectionDigest);
  });

  it("does not depend on key insertion order anywhere in the inputs", async () => {
    const straight = await project();

    // Reverse the key order of the source sequence AND the context. Both flow
    // into the projected object in a different order, so a digest that depended
    // on insertion order would move.
    const shuffledSource = reverseKeyOrder(buildSourceSequence("ABCD"));
    const shuffledContext = reverseKeyOrder(buildContext());
    const shuffled = await buildPublicSequenceProjection(
      await normalize(shuffledSource),
      shuffledContext,
      1,
      { kind: "first-publication" }
    );

    expect(shuffled.publicProjectionDigest).toBe(
      straight.publicProjectionDigest
    );
  });

  it("survives a second normalization pass of the same sequence", async () => {
    // `ensureComposition` mints a fresh `crypto.randomUUID()` for each solo prop
    // and hand path on every call (`solo-prop-factory.ts:39`). If those objects
    // were inside the digest, every republish of unchanged content would produce
    // a new digest and "a notes-only edit must not bump the revision" would be
    // unsatisfiable.
    const first = await normalize(buildSourceSequence("ABCD"));
    const second = await normalize(buildSourceSequence("ABCD"));

    expect(second.ownerData.leftSoloProp?.id).not.toBe(
      first.ownerData.leftSoloProp?.id
    );

    const a = await buildPublicSequenceProjection(first, buildContext(), 1, {
      kind: "first-publication",
    });
    const b = await buildPublicSequenceProjection(second, buildContext(), 1, {
      kind: "first-publication",
    });

    expect(b.publicProjectionDigest).toBe(a.publicProjectionDigest);
  });

  it("changes when sequence content changes", async () => {
    const four = await project({ word: "ABCD" });
    const five = await project({ word: "ABCDA" });

    expect(five.word).not.toBe(four.word);
    expect(five.contentHash).not.toBe(four.contentHash);
    expect(five.publicProjectionDigest).not.toBe(four.publicProjectionDigest);
  });

  it("changes when projected presentation or profile data changes", async () => {
    const base = await project();

    const renamed = await project({ source: { name: "Renamed" } });
    const retagged = await project({ context: { tagNames: ["flow"] } });
    const reprofiled = await project({
      context: { ownerDisplayName: "Somebody Else" },
    });
    const regridded = await project({ source: { gridMode: GridMode.BOX } });

    for (const other of [renamed, retagged, reprofiled, regridded]) {
      expect(other.publicProjectionDigest).not.toBe(
        base.publicProjectionDigest
      );
    }
  });

  it("does NOT change when only an engagement counter changes", async () => {
    const quiet = await project({
      existing: { forkCount: 0, viewCount: 0, starCount: 0 },
    });
    const popular = await project({
      existing: { forkCount: 480, viewCount: 12_000, starCount: 97 },
    });

    expect(popular.viewCount).toBe(12_000);
    expect(popular.publicProjectionDigest).toBe(quiet.publicProjectionDigest);
  });

  it("does NOT change when only a timestamp changes", async () => {
    const early = await project({
      context: { now: new Date("2026-01-01T00:00:00Z") },
    });
    const late = await project({
      context: { now: new Date("2026-12-31T00:00:00Z") },
      existing: { publishedAt: new Date("2020-01-01T00:00:00Z") },
    });

    expect(late.publicProjectionDigest).toBe(early.publicProjectionDigest);
  });

  it("excludes exactly the documented buckets, and nothing else", async () => {
    // A field added to the projection is digested automatically; the only way
    // out is an explicit entry here. This pins the escape hatch shut.
    expect([...PROJECTION_DIGEST_EXCLUDED_KEYS]).toEqual([
      "forkCount",
      "viewCount",
      "starCount",
      "publicPerformanceCount",
      "latestPublicPerformanceAt",
      "publishedAt",
      "updatedAt",
      "birthday",
      "publicProjectionRevision",
      "publicProjectionDigest",
      "leftSoloProp",
      "rightSoloProp",
      "stepPairings",
    ]);
  });
});

// ---------------------------------------------------------------------------
// Ownership split
// ---------------------------------------------------------------------------

describe("buildPublicSequenceProjection — ownership split", () => {
  it("sets publishedAt on a first publication", async () => {
    const now = new Date("2026-07-25T12:00:00Z");
    const projection = await project({ context: { now } });

    expect(projection.publishedAt).toBe(now);
  });

  it("does NOT move publishedAt on a resync", async () => {
    // `public-index-syncer.ts:174` sets `publishedAt: serverTimestamp()`
    // unconditionally and writes with a full setDoc, so every republish has
    // already destroyed the original publication time corpus-wide.
    const firstPublication = new Date("2024-05-05T00:00:00Z");
    const resync = await project({
      context: { now: new Date("2026-07-25T12:00:00Z") },
      existing: { publishedAt: firstPublication },
    });

    expect(resync.publishedAt).toBe(firstPublication);
    expect(resync.publishedAt).not.toEqual(new Date("2026-07-25T12:00:00Z"));
  });

  it("preserves engagement counters across a refresh", async () => {
    const resync = await project({
      existing: { forkCount: 12, viewCount: 340, starCount: 56 },
    });

    expect(resync.forkCount).toBe(12);
    expect(resync.viewCount).toBe(340);
    expect(resync.starCount).toBe(56);
  });

  it("preserves a zeroed counter rather than falling back to the owner count", async () => {
    // `?? 0` on the wrong side of the fallback would silently resurrect the
    // owner document's stale count every time a public counter reached zero.
    const resync = await project({
      existing: { forkCount: 0, viewCount: 0, starCount: 0 },
    });

    expect(resync.forkCount).toBe(0);
    expect(resync.viewCount).toBe(0);
    expect(resync.starCount).toBe(0);
  });

  it("seeds counters from the owner document only on a first publication", async () => {
    const first = await project();
    expect(first.forkCount).toBe(7);
    expect(first.viewCount).toBe(11);
    expect(first.starCount).toBe(3);
  });

  it("treats an existing document with no counters as legacy, not as first publication", async () => {
    // An `existing` read that returned a legacy document carrying none of the
    // counters seeds from the owner counts — the same fallback a first
    // publication uses — but through an EXPLICIT `{ kind: "existing" }`. The
    // builder has no optional-parameter path where a failed read silently
    // becomes a first publication and re-stamps publishedAt; the discriminant
    // makes the caller assert which world it is in.
    const resync = await project({ existing: {} });

    expect(resync.forkCount).toBe(7);
    expect(resync.viewCount).toBe(11);
    expect(resync.starCount).toBe(3);
    // No stored publishedAt on the legacy document → stamped now, once.
    expect(resync.publishedAt).toEqual(new Date("2026-07-25T12:00:00Z"));
  });

  it("defaults counters to zero when neither side has one", async () => {
    const projection = await project({
      source: {
        forkCount: undefined,
        viewCount: undefined,
        starCount: undefined,
      },
    });

    expect(projection.forkCount).toBe(0);
    expect(projection.viewCount).toBe(0);
    expect(projection.starCount).toBe(0);
    expect(projection.publicPerformanceCount).toBe(0);
  });

  it("preserves server-owned public performance metadata on republish", async () => {
    const latestPublicPerformanceAt = new Date("2026-08-19T12:00:00Z");
    const projection = await project({
      existing: {
        publicPerformanceCount: 4,
        latestPublicPerformanceAt,
      },
    });

    expect(projection.publicPerformanceCount).toBe(4);
    expect(projection.latestPublicPerformanceAt).toBe(
      latestPublicPerformanceAt
    );
  });

  it("rebuilds source-owned and profile-owned fields on every refresh", async () => {
    // Stale public data is repaired unconditionally: `existing` has no say over
    // anything outside the engagement and publication buckets.
    const refreshed = await project({
      source: { name: "Repaired Name" },
      context: { ownerDisplayName: "Renamed Owner", tagNames: ["fresh"] },
      existing: {
        publishedAt: new Date("2024-01-01T00:00:00Z"),
        forkCount: 99,
      },
    });

    expect(refreshed.name).toBe("Repaired Name");
    expect(refreshed.ownerDisplayName).toBe("Renamed Owner");
    expect(refreshed.tags).toEqual(["fresh"]);
    expect(refreshed.forkCount).toBe(99);
  });
});

// ---------------------------------------------------------------------------
// Writer-owned stamps
// ---------------------------------------------------------------------------

describe("buildPublicSequenceProjection — revision and updatedAt", () => {
  it("stamps the given revision and timestamp on a first publication", async () => {
    const now = new Date("2026-07-25T12:00:00Z");
    const projection = await project({ revision: 4, context: { now } });

    expect(projection.publicProjectionRevision).toBe(4);
    expect(projection.updatedAt).toBe(now);
  });

  it("holds revision and updatedAt still when the content digest is unchanged", async () => {
    // The spec's "a notes-only update must not force a public projection
    // revision", enforced by the builder rather than trusted to each caller.
    const first = await project({ revision: 4 });

    const resync = await project({
      revision: 5,
      context: { now: new Date("2026-08-01T00:00:00Z") },
      existing: {
        publishedAt: new Date("2024-01-01T00:00:00Z"),
        updatedAt: new Date("2026-07-25T12:00:00Z"),
        publicProjectionRevision: 4,
        publicProjectionDigest: first.publicProjectionDigest,
      },
    });

    expect(resync.publicProjectionRevision).toBe(4);
    expect(resync.updatedAt).toEqual(new Date("2026-07-25T12:00:00Z"));
  });

  it("advances revision and updatedAt when the content digest moves", async () => {
    const first = await project({ word: "ABCD", revision: 4 });

    const edited = await project({
      word: "ABCDA",
      revision: 5,
      context: { now: new Date("2026-08-01T00:00:00Z") },
      existing: {
        publishedAt: new Date("2024-01-01T00:00:00Z"),
        updatedAt: new Date("2026-07-25T12:00:00Z"),
        publicProjectionRevision: 4,
        publicProjectionDigest: first.publicProjectionDigest,
      },
    });

    expect(edited.publicProjectionRevision).toBe(5);
    expect(edited.updatedAt).toEqual(new Date("2026-08-01T00:00:00Z"));
  });

  it("produces an identical document when nothing changed", async () => {
    // Idempotence: a republish of unchanged content is a no-op the persister
    // can skip outright.
    const first = await project({ revision: 4 });
    const existing: ExistingPublicOwnedFields = {
      publishedAt: first.publishedAt,
      updatedAt: first.updatedAt,
      forkCount: first.forkCount,
      viewCount: first.viewCount,
      starCount: first.starCount,
      publicProjectionRevision: first.publicProjectionRevision,
      publicProjectionDigest: first.publicProjectionDigest,
    };

    const again = await project({
      revision: 5,
      context: { now: new Date("2026-09-09T00:00:00Z") },
      existing,
    });

    // Solo-prop ids are regenerated by every normalization, so compare content.
    expect({
      ...again,
      leftSoloProp: null,
      rightSoloProp: null,
      stepPairings: null,
    }).toEqual({
      ...first,
      leftSoloProp: null,
      rightSoloProp: null,
      stepPairings: null,
    });
  });
});

// ---------------------------------------------------------------------------
// Firestore write safety
// ---------------------------------------------------------------------------

describe("buildPublicSequenceProjection — write safety", () => {
  it("never emits an undefined value at any depth", async () => {
    // Firestore rejects `undefined` in setDoc, and `canonicalJSON` serializes an
    // explicit `undefined` as `null` rather than omitting the key — so an
    // `undefined` here would also break digest comparison after a round trip.
    const projection = await project();
    expect(undefinedPaths(projection)).toEqual([]);
  });

  it("omits absent optional fields instead of assigning undefined", async () => {
    const projection = (await project({
      source: {
        displayName: undefined,
        intendedWord: undefined,
        gridMode: undefined,
        reversalPattern: undefined,
        creatorIntent: null,
        animatedSequenceUrl: undefined,
        animationFormat: undefined,
      },
      context: {
        ownerAvatarUrl: undefined,
        difficultyLevel: undefined,
        level: undefined,
        loop: {
          isCircular: false,
          loopType: null,
        },
      },
    })) as unknown as Record<string, unknown>;

    for (const key of [
      "displayName",
      "intendedWord",
      "gridMode",
      "reversalPattern",
      "creatorIntent",
      "animatedSequenceUrl",
      "animationFormat",
      "ownerAvatarUrl",
      "difficultyLevel",
      "level",
      "period",
      "components",
      "componentDomains",
      "loopSpec",
    ]) {
      expect(key in projection).toBe(false);
    }

    expect(undefinedPaths(projection)).toEqual([]);
    // The required half still lands.
    expect(projection["loopType"]).toBeNull();
    expect(projection["isCircular"]).toBe(false);
  });

  it("drops fork attribution when the sequence was not forked", async () => {
    const projection = (await project({
      source: { source: "created", forkAttribution: undefined },
    })) as unknown as Record<string, unknown>;

    expect(projection["isForked"]).toBe(false);
    expect("originalCreatorId" in projection).toBe(false);
    expect("originalCreatorName" in projection).toBe(false);
  });
});
