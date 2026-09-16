/**
 * Canonical fixtures for the persistence round-trip audit.
 *
 * Two sources, deliberately separate:
 *
 *   1. `makeStep` / `buildSequence` — hand-authored beats built through the
 *      real factories (`createMotionData`, `createSequenceData`), so every
 *      motion carries the same required view fields a freshly authored beat
 *      does. Used when a defect needs one minimal, readable example.
 *   2. `realCorpusSequences()` — the checked-in LOOP corpus
 *      (`tests/fixtures/loop-audit/real-loop-fixtures.json`), which stores
 *      motions under the LEGACY `blue`/`red` keys with an inline
 *      `stepNumber: 0` start entry.
 *
 * ## What the corpus is, and is NOT
 *
 * It is GENERATED FIXTURE OUTPUT, not captured Firestore documents.
 * `scripts/generate-loop-audit-fixtures.mjs` drives the production generation
 * path — the canonical `DiamondPictographDataframe.csv` dataset through
 * `SequenceBuilder` (beam search + LOOP seam targeting) into `executeLOOPSpec`,
 * the same pipeline behind MCP `generate_sequence` and the app's circular
 * generation — and commits the result.
 *
 * So it is authoritative for **what the canonical generator emits**: breadth
 * over 45 builder-validated sequences and 432 beats that no test here authored.
 * It is NOT evidence about the stored corpus. It says nothing about how many
 * saved documents exist in any shape, and a field it happens to leave unset
 * (see `handPath`) is a property of the generator, not of user data. No claim
 * below infers prevalence from it.
 *
 * Nothing here asserts. Comparison helpers below are SEMANTIC: they name the
 * motion fields that define a movement and compare those, never whole objects
 * or serialized bytes — normalization legitimately rewrites ids, placement
 * data, and derived flags, and a byte comparison would drown a real loss in
 * that noise.
 */
import rawFixtures from "../../fixtures/loop-audit/real-loop-fixtures.json";

import {
  createSequenceData,
  type SequenceData,
} from "$lib/shared/foundation/domain/models/sequence-data";
import { createMotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import { createStepData } from "$lib/shared/foundation/domain/factories/create-step-data";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import {
  HandSide,
  MotionType,
  Orientation,
  RotationDirection,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { GridLocation } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";

/** A four-position cycle, so consecutive beats carry distinct motion content. */
const CYCLE: readonly GridLocation[] = [
  GridLocation.NORTH,
  GridLocation.EAST,
  GridLocation.SOUTH,
  GridLocation.WEST,
];

export function motionAt(
  from: GridLocation,
  to: GridLocation,
  hand: HandSide,
  extra: Record<string, unknown> = {}
) {
  return createMotionData({
    motionType: from === to ? MotionType.STATIC : MotionType.PRO,
    rotationDirection:
      from === to ? RotationDirection.NO_ROTATION : RotationDirection.CLOCKWISE,
    startLocation: from,
    endLocation: to,
    startOrientation: Orientation.IN,
    endOrientation: Orientation.IN,
    turns: 0,
    propType: PropType.STAFF,
    hand,
    ...extra,
  } as never);
}

/** One content beat (`stepNumber >= 1`), both hands really there. */
export function makeStep(
  index: number,
  letter: string | null,
  extraLeft: Record<string, unknown> = {},
  extraRight: Record<string, unknown> = {}
): StepData {
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
    letter: letter as StepData["letter"],
    startPlacement: null,
    endPlacement: null,
    motions: {
      left: motionAt(leftFrom, leftTo, HandSide.LEFT, extraLeft),
      right: motionAt(rightFrom, rightTo, HandSide.RIGHT, extraRight),
    },
  };
}

/**
 * The legacy inline start entry: `stepNumber: 0`, letterless, both props held
 * static at their opening locations. Modern writes keep this in its own
 * `startPlacement` field; pre-compositional documents kept it inside `steps`.
 */
export function makeLegacyStartEntry(): StepData {
  return {
    id: "step-0",
    stepNumber: 0,
    duration: 1,
    leftReversal: false,
    rightReversal: false,
    isBlank: false,
    letter: null,
    startPlacement: null,
    endPlacement: null,
    motions: {
      left: motionAt(GridLocation.NORTH, GridLocation.NORTH, HandSide.LEFT),
      right: motionAt(GridLocation.SOUTH, GridLocation.SOUTH, HandSide.RIGHT),
    },
  };
}

export function buildSequence(
  steps: StepData[],
  over: Partial<SequenceData> = {}
): SequenceData {
  return createSequenceData({
    id: "audit-seq",
    name: "Audit sequence",
    word: "AB",
    steps,
    ...over,
  });
}

// Real corpus

type RawStep = Record<string, unknown>;
interface RawSeq {
  readonly loopType: string;
  readonly seedWord: string;
  readonly steps: RawStep[];
}

export interface CorpusSequence {
  readonly label: string;
  /** Content beats only, with the inline start entry lifted to `startPlacement`. */
  readonly sequence: SequenceData;
  /** The same document with the start entry still inside `steps`. */
  readonly legacyShape: SequenceData;
}

function toStep(raw: RawStep): StepData {
  const motions = (raw as { motions?: Record<string, Record<string, unknown>> })
    .motions;
  return createStepData({
    ...(raw as object),
    motions: Object.fromEntries(
      Object.entries(motions ?? {}).map(([key, value]) => [
        key === "blue" ? "left" : key === "red" ? "right" : key,
        createMotionData({
          ...value,
          hand: key === "blue" ? HandSide.LEFT : HandSide.RIGHT,
        } as never),
      ])
    ),
  } as never);
}

/**
 * Every sequence in the checked-in LOOP corpus, in both shapes.
 *
 * The corpus is the authoritative side of the differential tests that use it:
 * it is generated output from the production sequence pipeline, not data this
 * audit authored, so where a round trip disagrees with it the round trip is the
 * suspect.
 */
export function realCorpusSequences(): CorpusSequence[] {
  const groups = rawFixtures as unknown as Record<string, RawSeq[]>;
  const out: CorpusSequence[] = [];
  for (const raw of Object.values(groups).flat()) {
    const all = raw.steps.map(toStep);
    const content = all.filter((step) => step.stepNumber !== 0);
    if (content.length === 0) continue;
    const startEntry = all.find((step) => step.stepNumber === 0);
    const label = `${raw.loopType}/${raw.seedWord}`;
    const common = {
      id: `corpus-${label}`,
      name: raw.seedWord,
      word: raw.seedWord,
    };
    out.push({
      label,
      sequence: createSequenceData({
        ...common,
        steps: content,
        ...(startEntry && {
          startPlacement: {
            id: startEntry.id,
            isStartPlacement: true,
            motions: startEntry.motions,
            gridMode: startEntry.gridMode,
            gridPlacement: startEntry.startPlacement,
          } as never,
        }),
      }),
      legacyShape: createSequenceData({ ...common, steps: all }),
    });
  }
  return out;
}

// Semantic comparison

/**
 * The fields that define a movement.
 *
 * This set is a SUPERSET of the V3 identity-hash basis
 * (`sequence-content-hasher.ts:extractMotion`): every field the hash reads is
 * here, so no hash-affecting divergence can hide behind a short list.
 * `handPath` is in the basis and belongs here for exactly that reason — it was
 * missing from an earlier revision of this file, which made a
 * "plane is the only field that diverges" claim look true when it was not.
 *
 * Everything omitted is either a viewer preference (`propType`), render state
 * (`isVisible`, `arrowLocation`, placement data), or re-derived on every load
 * (`gridMode`, reversal flags) — the same exclusions
 * `sequence-content-hasher.ts` documents for V2/V3. `prefloatMotionType` is
 * NOT in the hash basis but is kept here: it is authored domain data the
 * decomposer deliberately preserves.
 */
export const MOTION_IDENTITY_FIELDS = [
  "motionType",
  "rotationDirection",
  "startLocation",
  "endLocation",
  "startOrientation",
  "endOrientation",
  "turns",
  "handPath",
  "prefloatMotionType",
  "skewSteps",
  "skewDir",
  "plane",
] as const;

/** The subset of the above that the ACTIVE (V3) identity hash actually reads. */
export const V3_HASH_MOTION_FIELDS = [
  "motionType",
  "rotationDirection",
  "startLocation",
  "endLocation",
  "startOrientation",
  "endOrientation",
  "turns",
  "handPath",
  "skewSteps",
  "skewDir",
  "plane",
] as const;

/**
 * Semantic diff between two sequences, one line per differing field.
 * `null` and `undefined` are treated as the same absence, so an optional field
 * that survives as `null` is not reported as a loss.
 */
export function diffMotionIdentity(
  before: SequenceData,
  after: SequenceData
): string[] {
  const out: string[] = [];
  if (before.steps.length !== after.steps.length) {
    return [`step count ${before.steps.length} -> ${after.steps.length}`];
  }
  for (let i = 0; i < before.steps.length; i++) {
    for (const hand of [HandSide.LEFT, HandSide.RIGHT] as const) {
      const a = before.steps[i]!.motions[hand] as unknown as Record<
        string,
        unknown
      >;
      const b = after.steps[i]!.motions[hand] as unknown as Record<
        string,
        unknown
      >;
      for (const field of MOTION_IDENTITY_FIELDS) {
        const va = a[field] ?? null;
        const vb = b[field] ?? null;
        if (va !== vb) {
          out.push(
            `beat ${i + 1} ${hand}.${field}: ${String(va)} -> ${String(vb)}`
          );
        }
      }
    }
  }
  return out;
}

/**
 * The owner-document write as `library-repository.saveSequence` performs it:
 * refresh the compositional fields, then drop `steps` (they are re-derived on
 * read). Returns the shape that reaches Firestore.
 */
export function asStoredDocument(composed: SequenceData): SequenceData {
  return { ...composed, steps: [] as StepData[] } as SequenceData;
}
