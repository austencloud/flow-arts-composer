/**
 * The persistence normalizer — the boundary that decides what a sequence is
 * allowed to become on disk.
 *
 * Each block below pins a defect that is live in the 2026-07-25 corpus:
 *   - auto-titles stored as words (`library-repository.ts:708`)
 *   - `sequenceLength: 0` on composition-only public documents
 *     (`public-index-syncer.ts:158`)
 *   - partially-derived words reaching Firestore
 *
 * Fixtures are built the way the corpus actually stores sequences: author a
 * steps-based sequence, run it through `ensureComposition`, then DROP `steps` —
 * that is byte-for-byte the composition-only shape a Firestore document holds.
 */
import { describe, expect, it } from "vitest";

import {
  normalizeSequenceForPersistence,
  trySequenceNormalization,
  SequenceNormalizationError,
} from "../sequence-persistence-normalizer";
import { ensureComposition } from "$lib/shared/foundation/services/sequence-hydrator";
import {
  createSequenceData,
  type SequenceData,
} from "$lib/shared/foundation/domain/models/sequence-data";
import { createMotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import {
  computeHash,
  CONTENT_HASH_VERSION,
  HASH_VERSION_V3,
} from "../sequence-content-hasher";
import { IncompleteWordError } from "$lib/shared/foundation/services/word-deriver";
import {
  HandSide,
  MotionType,
  Orientation,
  RotationDirection,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { GridLocation } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";

// Fixtures

/** A four-position cycle so every beat has genuinely distinct motion content. */
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
  const leftFrom = CYCLE[index % 4] as GridLocation;
  const leftTo = CYCLE[(index + 1) % 4] as GridLocation;
  const rightFrom = CYCLE[(index + 2) % 4] as GridLocation;
  const rightTo = CYCLE[(index + 3) % 4] as GridLocation;

  return {
    id: `step-${index + 1}`,
    stepNumber: index + 1,
    duration: 1,
    leftReversal: false,
    rightReversal: false,
    isBlank: false,
    // `letter: null` models a beat whose lookup never resolved. The cast lets a
    // fixture spell arbitrary glyph strings without importing the Letter union.
    letter: letter as StepData["letter"],
    startPlacement: null,
    endPlacement: null,
    motions: {
      left: motionAt(leftFrom, leftTo, HandSide.LEFT),
      right: motionAt(rightFrom, rightTo, HandSide.RIGHT),
    },
  };
}

/**
 * The legacy start-placement entry: `stepNumber === 0`, letterless by design.
 * Static at the first content beat's start locations (blue NORTH, red SOUTH
 * under the CYCLE fixture), which is how legacy raw-`steps` blobs stored it.
 * The normalizer strips it before anything counts, composes, or hashes.
 */
function makeStartEntry(): StepData {
  return {
    id: "start-0",
    stepNumber: 0,
    duration: 1,
    leftReversal: false,
    rightReversal: false,
    isBlank: false,
    letter: null as StepData["letter"],
    startPlacement: null,
    endPlacement: null,
    motions: {
      left: motionAt(GridLocation.NORTH, GridLocation.NORTH, HandSide.LEFT),
      right: motionAt(GridLocation.SOUTH, GridLocation.SOUTH, HandSide.RIGHT),
    },
  };
}

/** A steps-based sequence spelling `word`, one beat per character. */
function buildStepsSequence(
  word: string,
  overrides: Partial<SequenceData> = {}
): SequenceData {
  return createSequenceData({
    id: "seq-1",
    name: "",
    word: "",
    steps: word.split("").map((letter, i) => makeStep(i, letter)),
    ...overrides,
  });
}

/**
 * The shape Firestore actually stores: compositional fields present, `steps`
 * absent. Produced the same way the real write path produces it, so the fixture
 * cannot drift from the corpus.
 */
function buildCompositionOnlySequence(
  word: string,
  overrides: Partial<SequenceData> = {}
): SequenceData {
  const composed = ensureComposition(buildStepsSequence(word, overrides));
  return { ...composed, steps: [] };
}

/**
 * Drop every `id` the composition factories mint fresh on each call, so a
 * deep-equal can speak to content rather than to `crypto.randomUUID()`.
 * See the dedicated id-regeneration test at the bottom of this file.
 */
function withoutGeneratedIds(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutGeneratedIds);
  if (value === null || typeof value !== "object" || value instanceof Date)
    return value;
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (key === "id") continue;
    out[key] = withoutGeneratedIds(child);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Composition-only source
// ---------------------------------------------------------------------------

describe("normalizeSequenceForPersistence — composition-only source", () => {
  it("hydrates to the exact word, canonical length, composition, and active hash", async () => {
    const source = buildCompositionOnlySequence("ABCD");
    expect(source.steps).toHaveLength(0);

    const result = await normalizeSequenceForPersistence(source);

    expect(result.exactWord).toBe("ABCD");
    expect(result.ownerData.word).toBe("ABCD");

    expect(result.sequenceLength).toBe(4);
    expect(result.ownerData.sequenceLength).toBe(4);

    // Composition round-trips: four hydrated beats, four pairings, both solo
    // prop paths, and all four cross-tier hashes.
    expect(result.hydrated.steps).toHaveLength(4);
    expect(result.ownerData.stepPairings).toHaveLength(4);
    expect(result.ownerData.leftSoloProp).toBeTruthy();
    expect(result.ownerData.rightSoloProp).toBeTruthy();
    expect(result.ownerData.leftPathHash).toBeTruthy();
    expect(result.ownerData.rightPathHash).toBeTruthy();
    expect(result.ownerData.leftSoloHash).toBeTruthy();
    expect(result.ownerData.rightSoloHash).toBeTruthy();
    // The start cell survives — it is not derivable from the compositional
    // fields, so losing it is what emptied start cells in the 2026-06 corpus.
    expect(result.ownerData.startPlacement).toBeTruthy();

    expect(result.contentHashVersion).toBe(CONTENT_HASH_VERSION);
    expect(result.contentHashVersion).toBe(HASH_VERSION_V3);
    expect(result.contentHash).toMatch(/^[0-9a-f]{64}$/);
    // The hash describes the data actually being stored, not the pre-hydration
    // input: recomputing over the returned hydrated sequence reproduces it.
    expect(result.contentHash).toBe(await computeHash(result.hydrated));
    expect(result.ownerData.contentHash).toBe(result.contentHash);
    expect(result.ownerData.contentHashVersion).toBe(HASH_VERSION_V3);
  });

  it("gives a composition-only document the same identity as its steps-based twin", async () => {
    // Identity must be invariant under the persist/hydrate round trip, or a
    // load-then-save silently forks the sequence.
    const stepsBased = buildStepsSequence("ABCD");
    const compositionOnly = buildCompositionOnlySequence("ABCD");

    const fromSteps = await normalizeSequenceForPersistence(stepsBased);
    const fromComposition =
      await normalizeSequenceForPersistence(compositionOnly);

    expect(fromComposition.contentHash).toBe(fromSteps.contentHash);
    expect(fromComposition.exactWord).toBe(fromSteps.exactWord);
    expect(fromComposition.sequenceLength).toBe(fromSteps.sequenceLength);
  });

  it("never persists steps — they are derived on read", async () => {
    const result = await normalizeSequenceForPersistence(
      buildCompositionOnlySequence("ABCD")
    );
    expect("steps" in result.ownerData).toBe(false);
  });

  it("persists explicit card presentation with the private owner record", async () => {
    const result = await normalizeSequenceForPersistence(
      buildCompositionOnlySequence("ABCD", {
        notes: "private rehearsal note",
        cardPresentation: {
          schemaVersion: 1,
          footer: { mode: "custom", text: "Shared from First Fire" },
        },
      })
    );

    expect(result.ownerData.cardPresentation).toEqual({
      schemaVersion: 1,
      footer: { mode: "custom", text: "Shared from First Fire" },
    });
    expect(result.ownerData.notes).toBe("private rehearsal note");
  });

  it("drops legacy aliases and Dexie-local sync bookkeeping from the payload", async () => {
    const source = {
      ...buildCompositionOnlySequence("ABCD"),
      syncStatus: "pending" as const,
      pendingSyncMetadata: {
        visibility: "public" as const,
        notes: "local only",
      },
    };

    const result = await normalizeSequenceForPersistence(source);

    expect("syncStatus" in result.ownerData).toBe(false);
    expect("pendingSyncMetadata" in result.ownerData).toBe(false);
    expect("startingPlacement" in result.ownerData).toBe(false);
    expect("startingPlacementGroup" in result.ownerData).toBe(false);
  });

  it("leaves no undefined values anywhere in the payload", async () => {
    const result = await normalizeSequenceForPersistence(
      buildCompositionOnlySequence("ABCD")
    );

    const undefinedPaths: string[] = [];
    const walk = (value: unknown, path: string) => {
      if (value === undefined) {
        undefinedPaths.push(path);
        return;
      }
      if (value === null || typeof value !== "object" || value instanceof Date)
        return;
      if (Array.isArray(value)) {
        value.forEach((item, i) => walk(item, `${path}[${i}]`));
        return;
      }
      for (const [key, child] of Object.entries(
        value as Record<string, unknown>
      )) {
        walk(child, `${path}.${key}`);
      }
    };
    walk(result.ownerData, "ownerData");

    expect(undefinedPaths).toEqual([]);
  });

  it("converts Admin SDK timestamps to Dates before the deep-clean pass", async () => {
    const birthday = new Date("2026-07-08T12:13:03.787Z");
    class AdminTimestampFixture {
      readonly _seconds = Math.floor(birthday.getTime() / 1000);
      readonly _nanoseconds = (birthday.getTime() % 1000) * 1_000_000;

      toDate(): Date {
        return new Date(birthday);
      }
    }
    const adminTimestamp = new AdminTimestampFixture();
    const source = {
      ...buildCompositionOnlySequence("ABCD"),
      // Migration tooling reads this class from firebase-admin. Treating it as
      // a plain object turns it into {_seconds, _nanoseconds}, which Firestore
      // then stores as a map and the Favorites reader rejects.
      birthday: adminTimestamp as unknown as Date,
      metadata: {
        migratedAt: adminTimestamp,
      },
    } as SequenceData;

    const result = await normalizeSequenceForPersistence(source);

    expect(result.ownerData.birthday).toEqual(birthday);
    expect(result.ownerData.birthday).toBeInstanceOf(Date);
    expect(result.ownerData.metadata?.["migratedAt"]).toEqual(birthday);
    expect(result.ownerData.metadata?.["migratedAt"]).toBeInstanceOf(Date);
  });
});

// ---------------------------------------------------------------------------
// The word is derived, never borrowed
// ---------------------------------------------------------------------------

describe("normalizeSequenceForPersistence — word derivation", () => {
  it("throws IncompleteWordError when a single beat resolved no token", async () => {
    const steps = "ABCD"
      .split("")
      .map((l, i) => makeStep(i, i === 2 ? null : l));
    const source = createSequenceData({ id: "seq-1", steps });

    await expect(
      normalizeSequenceForPersistence(source)
    ).rejects.toBeInstanceOf(IncompleteWordError);

    // "writes nothing" at this layer means: no payload is produced at all, so
    // there is nothing a caller could accidentally persist.
    const outcome = await trySequenceNormalization(source);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error("expected refusal");
    expect(outcome.code).toBe("INCOMPLETE_WORD");
    expect(
      (outcome.error as IncompleteWordError).status.missingStepIndexes
    ).toEqual([2]);
    expect((outcome.error as IncompleteWordError).status.tokenCount).toBe(3);
    expect((outcome.error as IncompleteWordError).status.stepCount).toBe(4);
    expect(outcome).not.toHaveProperty("value");
  });

  it("refuses a partial derivation instead of storing the shorter word", async () => {
    // The historical "GI" defect: ten of twelve beats unresolved produced a
    // plausible two-token word that sailed into Firestore.
    const steps = "IIECCKIIECCK"
      .split("")
      .map((l, i) => makeStep(i, i === 0 ? "G" : i === 1 ? "I" : null));

    const outcome = await trySequenceNormalization(
      createSequenceData({ id: "seq-1", steps })
    );

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error("expected refusal");
    expect(outcome.code).toBe("INCOMPLETE_WORD");
    expect((outcome.error as IncompleteWordError).status.word).toBe("GI");
  });

  it("never lets a name or auto-title become the word", async () => {
    // `library-repository.ts:708` does `word: sequence.word || metadata.name`,
    // which is how "Assemble Sequence" became a stored WORD. Strict derivation
    // has no path to `name` at all, so the auto-title is overwritten.
    const source = buildCompositionOnlySequence("ABCD", {
      name: "Assemble Sequence",
      word: "Assemble Sequence",
    });

    const result = await normalizeSequenceForPersistence(source);

    expect(result.exactWord).toBe("ABCD");
    expect(result.ownerData.word).toBe("ABCD");
    expect(result.ownerData.word).not.toBe("Assemble Sequence");
    // `name` is presentation metadata and is left exactly as the user set it.
    expect(result.ownerData.name).toBe("Assemble Sequence");
  });

  it("refuses rather than adopting a stored word when derivation cannot run", async () => {
    // No steps, no pairings, but a stored word that looks convincing. The
    // permissive display deriver would happily hand this back.
    const source = createSequenceData({
      id: "seq-1",
      steps: [],
      name: "Untitled Sequence",
      word: "LOOKSREAL",
      intendedWord: "NOPE",
      displayName: "Also Nope",
    });

    const outcome = await trySequenceNormalization(source);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error("expected refusal");
    expect(outcome.code).toBe("EMPTY_SEQUENCE");
  });

  it("keeps a custom displayName as display metadata alongside the exact word", async () => {
    const source = buildCompositionOnlySequence("ABCD", {
      displayName: "Sunset Drill",
      name: "auto-generated name",
      intendedWord: "ABD",
    });

    const result = await normalizeSequenceForPersistence(source);

    expect(result.ownerData.displayName).toBe("Sunset Drill");
    expect(result.ownerData.name).toBe("auto-generated name");
    // intendedWord is the user's pre-bridge intent and is presentation data too.
    expect(result.ownerData.intendedWord).toBe("ABD");
    expect(result.ownerData.word).toBe("ABCD");
  });

  it("preserves multi-character glyph tokens and their order", async () => {
    const steps = ["Σ-", "W-", "Φ", "α"].map((l, i) => makeStep(i, l));
    const result = await normalizeSequenceForPersistence(
      createSequenceData({ id: "seq-1", steps })
    );
    expect(result.exactWord).toBe("Σ-W-Φα");
  });
});

// ---------------------------------------------------------------------------
// Canonical length
// ---------------------------------------------------------------------------

describe("normalizeSequenceForPersistence — canonical sequence length", () => {
  it("counts from the persisted source of truth, not steps?.length ?? 0", async () => {
    // The exact shape behind the three live public documents with length 0:
    // `public-index-syncer.ts:158` reads `sequence.steps?.length ?? 0` on an
    // unhydrated composition-only sequence, whose `steps` array is empty.
    const source = buildCompositionOnlySequence("ABCDEFGH");
    expect(source.steps?.length ?? 0).toBe(0);

    const result = await normalizeSequenceForPersistence(source);

    expect(result.sequenceLength).toBe(8);
    expect(result.ownerData.sequenceLength).toBe(8);
    expect(result.ownerData.stepPairings).toHaveLength(8);
  });

  it("overwrites a stale stored sequenceLength", async () => {
    // Construct starts at zero and grows; a creation-time length goes stale.
    const source = buildCompositionOnlySequence("ABCD", { sequenceLength: 0 });
    const result = await normalizeSequenceForPersistence(source);
    expect(result.ownerData.sequenceLength).toBe(4);
  });

  it("keeps the legacy metadata.length key in step with the canonical count", async () => {
    const source = buildCompositionOnlySequence("ABCD", {
      metadata: { length: 99 },
    });
    const result = await normalizeSequenceForPersistence(source);
    expect((result.ownerData.metadata as { length?: number }).length).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// LOOP seeds
// ---------------------------------------------------------------------------

describe("normalizeSequenceForPersistence — LOOP sequences", () => {
  it("persists the complete expanded word, not the simplified display form", async () => {
    // A halved LOOP repeats its word by construction. Display simplifies
    // "ABAB" to "AB"; storage must keep every beat's token or playback, step
    // math, and the identity hash all disagree with the document.
    const source = buildCompositionOnlySequence("ABAB", {
      isCircular: true,
      loopType: "rotated" as SequenceData["loopType"],
      period: 2,
    });

    const result = await normalizeSequenceForPersistence(source);

    expect(result.exactWord).toBe("ABAB");
    expect(result.ownerData.word).toBe("ABAB");
    expect(result.exactWord).not.toBe("AB");
    expect(result.sequenceLength).toBe(4);
    // LOOP metadata is carried through untouched — it is not the normalizer's
    // to recompute.
    expect(result.ownerData.isCircular).toBe(true);
    expect(result.ownerData.loopType).toBe("rotated");
    expect(result.ownerData.period).toBe(2);
  });

  it("keeps a longer expansion intact rather than collapsing repeats", async () => {
    const result = await normalizeSequenceForPersistence(
      buildCompositionOnlySequence("ABCDABCD", { isCircular: true, period: 2 })
    );
    expect(result.exactWord).toBe("ABCDABCD");
    expect(result.sequenceLength).toBe(8);
  });
});

// ---------------------------------------------------------------------------
// Legacy inline start entries
// ---------------------------------------------------------------------------

describe("normalizeSequenceForPersistence — legacy stepNumber-0 start entries", () => {
  it("strips the start entry so word, length, and pairings agree on content beats", async () => {
    // The legacy raw-`steps` shape: a letterless stepNumber-0 entry followed by
    // the content beats. Without the strip, `extractStepPairings` maps it 1:1
    // into a letterless leading pairing: `sequenceLength` says 4 while the word
    // says 3, and the next pairings-only republish throws IncompleteWordError
    // on pairing 0 — a locked document.
    const source = createSequenceData({
      id: "seq-1",
      steps: [
        makeStartEntry(),
        ..."ABC".split("").map((l, i) => makeStep(i, l)),
      ],
    });

    const result = await normalizeSequenceForPersistence(source);

    expect(result.exactWord).toBe("ABC");
    expect(result.sequenceLength).toBe(3);
    expect(result.ownerData.sequenceLength).toBe(3);
    expect(result.ownerData.stepPairings).toHaveLength(3);
    expect(result.hydrated.steps).toHaveLength(3);
    expect(result.hydrated.steps.every((step) => step.stepNumber !== 0)).toBe(
      true
    );
    // Every persisted pairing owes a token — no letterless leading pairing.
    expect(
      result.ownerData.stepPairings?.every((pairing) => pairing.letter !== null)
    ).toBe(true);
    // The start cell is not lost: composition derives `startPlacement` from the
    // first content beat, whose start locations the entry duplicated.
    expect(result.ownerData.startPlacement).toBeTruthy();
  });

  it("gives a legacy-shape document the same identity as its modern twin", async () => {
    // The hasher maps `sequence.steps` verbatim, so before the strip a legacy
    // document and its modern twin hashed differently despite identical
    // content. The strip normalizes both onto the content-beats-only basis;
    // stragglers self-heal through the version-aware lazy rehash, exactly as
    // the V1→V2 flip did.
    const legacy = createSequenceData({
      id: "seq-1",
      steps: [
        makeStartEntry(),
        ..."ABC".split("").map((l, i) => makeStep(i, l)),
      ],
    });
    const modern = createSequenceData({
      id: "seq-1",
      steps: "ABC".split("").map((l, i) => makeStep(i, l)),
    });

    const fromLegacy = await normalizeSequenceForPersistence(legacy);
    const fromModern = await normalizeSequenceForPersistence(modern);

    expect(fromLegacy.contentHash).toBe(fromModern.contentHash);
    expect(fromLegacy.exactWord).toBe(fromModern.exactWord);
    expect(fromLegacy.sequenceLength).toBe(fromModern.sequenceLength);
  });

  it("rejects a document holding only a start entry — a start position is not a sequence", async () => {
    const outcome = await trySequenceNormalization(
      createSequenceData({ id: "seq-1", steps: [makeStartEntry()] })
    );

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error("expected refusal");
    expect(outcome.code).toBe("EMPTY_SEQUENCE");
  });
});

// ---------------------------------------------------------------------------
// Blank steps
// ---------------------------------------------------------------------------

describe("normalizeSequenceForPersistence — blank (isBlank) steps", () => {
  it("refuses a blank-containing sequence with a typed BLANK_STEPS_UNSUPPORTED", async () => {
    // The persistence layer cannot round-trip the flag yet: stepPairings does
    // not carry it and step-deriver rebuilds every step with isBlank: false.
    // Storing this sequence would persist word "AC", then rehydrate the blank
    // as an unresolved beat — the NEXT save throws IncompleteWordError and the
    // V2 identity hash moves. Refusing loudly beats corrupting silently.
    const steps: StepData[] = [
      makeStep(0, "A"),
      {
        ...makeStep(1, "B"),
        isBlank: true,
        letter: null as StepData["letter"],
      },
      makeStep(2, "C"),
    ];
    const source = createSequenceData({ id: "seq-1", steps });

    await expect(
      normalizeSequenceForPersistence(source)
    ).rejects.toBeInstanceOf(SequenceNormalizationError);

    const outcome = await trySequenceNormalization(source);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error("expected refusal");
    expect(outcome.code).toBe("BLANK_STEPS_UNSUPPORTED");
    expect(outcome.error.message).toContain("isBlank");
  });

  it("reports an unresolved beat as INCOMPLETE_WORD even when blanks are also present", async () => {
    // A missing letter is the more fundamental refusal — the sequence is
    // broken, not merely unpersistable in its current encoding.
    const steps: StepData[] = [
      makeStep(0, "A"),
      {
        ...makeStep(1, "B"),
        isBlank: true,
        letter: null as StepData["letter"],
      },
      makeStep(2, null),
    ];

    const outcome = await trySequenceNormalization(
      createSequenceData({ id: "seq-1", steps })
    );

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error("expected refusal");
    expect(outcome.code).toBe("INCOMPLETE_WORD");
  });
});

// ---------------------------------------------------------------------------
// Refusals
// ---------------------------------------------------------------------------

describe("normalizeSequenceForPersistence — refusals", () => {
  it("rejects a sequence with no beats and no pairings", async () => {
    const empty = createSequenceData({ id: "seq-1", steps: [] });

    await expect(normalizeSequenceForPersistence(empty)).rejects.toBeInstanceOf(
      SequenceNormalizationError
    );

    const outcome = await trySequenceNormalization(empty);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error("expected refusal");
    expect(outcome.code).toBe("EMPTY_SEQUENCE");
    expect((outcome.error as SequenceNormalizationError).stepCount).toBe(0);
    expect(
      (outcome.error as SequenceNormalizationError).persistedStepCount
    ).toBe(0);
  });

  it("rejects an explicitly empty pairing list with no steps", async () => {
    const outcome = await trySequenceNormalization(
      createSequenceData({ id: "seq-1", steps: [], stepPairings: [] })
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error("expected refusal");
    expect(outcome.code).toBe("EMPTY_SEQUENCE");
  });

  it("accepts steps-only data whose stale pairing list is empty", async () => {
    // `getPersistedStepCount` prefers a present-but-empty `stepPairings` array,
    // so this input reads as "empty" by that measure alone while holding four
    // real beats. Step 3 rebuilds the pairings; refusing here would block a
    // legitimate save.
    const source = createSequenceData({
      id: "seq-1",
      steps: "ABCD".split("").map((l, i) => makeStep(i, l)),
      stepPairings: [],
    });

    const result = await normalizeSequenceForPersistence(source);

    expect(result.exactWord).toBe("ABCD");
    expect(result.sequenceLength).toBe(4);
    expect(result.ownerData.stepPairings).toHaveLength(4);
  });

  it("rejects pairings that cannot hydrate into steps", async () => {
    // Pairings present, prop paths missing: hydration produces nothing, so
    // there is no motion data to validate, count, or hash. Hashing zero steps
    // would mint a plausible identity for an empty movement.
    const composed = ensureComposition(buildStepsSequence("ABCD"));
    const source = {
      ...composed,
      steps: [],
      leftSoloProp: undefined,
      rightSoloProp: undefined,
    } as SequenceData;

    const outcome = await trySequenceNormalization(source);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error("expected refusal");
    expect(outcome.code).toBe("UNHYDRATABLE_SEQUENCE");
    expect(
      (outcome.error as SequenceNormalizationError).persistedStepCount
    ).toBe(4);
    expect((outcome.error as SequenceNormalizationError).stepCount).toBe(0);
  });

  it("rethrows an unexpected failure instead of reporting it as a skip", async () => {
    // A pairing count that disagrees with the prop paths makes `deriveSteps`
    // throw. That is not one of the two classified refusals, so the result
    // wrapper must not launder it into a tidy "this record was skipped".
    const composed = ensureComposition(buildStepsSequence("ABCD"));
    const source = {
      ...composed,
      steps: [],
      stepPairings: composed.stepPairings?.slice(0, 2),
    } as SequenceData;

    await expect(trySequenceNormalization(source)).rejects.toThrow(
      /step array length mismatch/
    );
  });
});

// ---------------------------------------------------------------------------
// Idempotence
// ---------------------------------------------------------------------------

describe("normalizeSequenceForPersistence — idempotence", () => {
  it("normalizing an already-normalized sequence changes nothing", async () => {
    const first = await normalizeSequenceForPersistence(
      buildCompositionOnlySequence("ABCD")
    );
    const second = await normalizeSequenceForPersistence(first.hydrated);

    expect(second.exactWord).toBe(first.exactWord);
    expect(second.sequenceLength).toBe(first.sequenceLength);
    expect(second.contentHash).toBe(first.contentHash);
    expect(second.contentHashVersion).toBe(first.contentHashVersion);
    // Every cross-tier hash is content-derived and must not move either.
    expect(second.ownerData.leftSoloHash).toBe(first.ownerData.leftSoloHash);
    expect(second.ownerData.rightSoloHash).toBe(first.ownerData.rightSoloHash);
    expect(second.ownerData.leftPathHash).toBe(first.ownerData.leftPathHash);
    expect(second.ownerData.rightPathHash).toBe(first.ownerData.rightPathHash);
    // The document id is stable; only the nested factory-minted ids are not.
    expect(second.ownerData.id).toBe(first.ownerData.id);
    expect(withoutGeneratedIds(second.ownerData)).toEqual(
      withoutGeneratedIds(first.ownerData)
    );
  });

  it("stays stable across a third pass", async () => {
    const first = await normalizeSequenceForPersistence(
      buildCompositionOnlySequence("ABCDEFGH")
    );
    const second = await normalizeSequenceForPersistence(first.hydrated);
    const third = await normalizeSequenceForPersistence(second.hydrated);

    expect(third.contentHash).toBe(first.contentHash);
    expect(withoutGeneratedIds(third.ownerData)).toEqual(
      withoutGeneratedIds(first.ownerData)
    );
  });

  it("regenerates solo-prop and hand-path ids on every pass — they are not identity", async () => {
    // `solo-prop-factory.ts:39` and the hand-path factory both mint a fresh
    // `crypto.randomUUID()` per call, so `ensureComposition` cannot be
    // byte-idempotent. Content identity lives entirely in the hashes, which are
    // stable (asserted above). Pinned here because anything that diffs two
    // normalizations field-by-field — a change detector, or the projection
    // digest the public mirror is about to gain — must exclude these ids or it
    // will report a change on every single save.
    const first = await normalizeSequenceForPersistence(
      buildCompositionOnlySequence("ABCD")
    );
    const second = await normalizeSequenceForPersistence(first.hydrated);

    expect(second.ownerData.leftSoloProp?.id).not.toBe(
      first.ownerData.leftSoloProp?.id
    );
    expect(second.ownerData.leftSoloProp?.contentHash).toBe(
      first.ownerData.leftSoloProp?.contentHash
    );
  });

  it("re-normalizing from the payload alone reproduces the same identity", async () => {
    // The round trip a migration actually performs: read the stored document
    // (no `steps`), normalize, compare.
    const first = await normalizeSequenceForPersistence(
      buildCompositionOnlySequence("ABCD")
    );
    const storedShape = {
      ...first.ownerData,
      steps: [],
    } as unknown as SequenceData;

    const second = await normalizeSequenceForPersistence(storedShape);

    expect(second.contentHash).toBe(first.contentHash);
    expect(second.exactWord).toBe(first.exactWord);
    expect(second.sequenceLength).toBe(first.sequenceLength);
  });
});
