/**
 * Zan's Diamond, the Guide's shared record: the one hand path every version
 * traces, the original two-hand word, and the 24 variations the stagger and
 * reversal generator derives from it. The /guide/zans-diamond page reads from
 * here; the words and letters come from a checked-in table so the public page
 * never fetches the letter dataframe or Firestore to draw.
 *
 * The variation table (zans-diamond-variations.json) was produced by
 * buildStaggerAndReversalVariations against the real diamond dataframe, and
 * zans-diamond-topic.test.ts re-derives it to keep the two from drifting.
 * The live collection was written by scripts/zans-diamond-variations.ts.
 * Spec: docs/superpowers/specs/2026-10-14-zans-diamond-variations-design.md
 */
import type { TranslationKey } from "#lib/shared/i18n/i18n-types.js";
import { createMotionData } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
import {
  HandSide,
  MotionType,
  type Orientation,
  type RotationDirection,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import {
  GridMode,
  type GridLocation,
  type GridPlacement,
} from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import { getGridPlacementFromLocations } from "#lib/shared/pictograph/grid/services/grid-placement-deriver.js";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import { createStepData } from "#lib/shared/foundation/domain/factories/create-step-data.js";
import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";
import type { Letter } from "#lib/shared/foundation/domain/models/letter.js";
import type { SoloPropStepData } from "#lib/shared/foundation/domain/models/solo-prop-step-data.js";
import {
  arrangeSoloPropSteps,
  type HandArrangement,
} from "#lib/shared/foundation/services/solo-prop-pair-variations.js";
import variationTable from "./zans-diamond-variations.json";

/**
 * Who the pattern is credited to: Zan Moore, whose YouTube channel carries his
 * own "Poi Tutorial: Zan's Diamond" (youtube.com/watch?v=QhWo4cLj184). The
 * credit links to the channel so the chip keeps working if a video moves.
 */
export const ZANS_DIAMOND_CREDIT: { name: string; href: string | null } = {
  name: "Zan Moore",
  href: "https://www.youtube.com/@Zan00",
};

/**
 * Zan's own Zan's Diamond tutorial on his channel (title and year checked
 * against YouTube 2026-10-15). The title stays as he wrote it.
 */
export const ZANS_DIAMOND_TUTORIAL = {
  id: "QhWo4cLj184",
  title: "Poi Tutorial: Zan's Diamond",
  year: "2011",
} as const;

/** The author-verified record the variations were derived from. */
export const ZANS_DIAMOND_SOURCE_SEQUENCE_ID = "seq_1791923102683_sysj46042";

/** Austen's public "Zan's Diamond" collection: the original plus every variation. */
export const ZANS_DIAMOND_COLLECTION_PATH =
  "/browse/explore/collections/PBp3GSBO6igCKPwJyLZNmVEmamI3/dab5fdca-b279-4a50-bd7a-67f291fce071";

type Raw = readonly [
  from: string,
  to: string,
  motion: "pro" | "anti" | "dash",
  spin: "cw" | "ccw",
  turns: number,
];

function soloStep([from, to, motion, spin, turns]: Raw): SoloPropStepData {
  return {
    duration: 1,
    startLocation: from as GridLocation,
    endLocation: to as GridLocation,
    startOrientation: "out" as Orientation,
    endOrientation: "out" as Orientation,
    motionType: motion as MotionType,
    rotationDirection: spin as RotationDirection,
    turns,
  };
}

/**
 * Each hand's eight steps of the original. Both hands walk the same points,
 * S E W N S W E N S, in step; the left prop spins counterclockwise and the
 * right clockwise, so the arcs come out pro on one hand and anti on the other.
 */
export const ZANS_DIAMOND_LEFT_STEPS: readonly SoloPropStepData[] = (
  [
    ["s", "e", "pro", "ccw", 0],
    ["e", "w", "dash", "ccw", 1],
    ["w", "n", "anti", "ccw", 1],
    ["n", "s", "dash", "ccw", 1],
    ["s", "w", "anti", "ccw", 1],
    ["w", "e", "dash", "ccw", 1],
    ["e", "n", "pro", "ccw", 0],
    ["n", "s", "dash", "ccw", 1],
  ] as const
).map(soloStep);

export const ZANS_DIAMOND_RIGHT_STEPS: readonly SoloPropStepData[] = (
  [
    ["s", "e", "anti", "cw", 1],
    ["e", "w", "dash", "cw", 1],
    ["w", "n", "pro", "cw", 0],
    ["n", "s", "dash", "cw", 1],
    ["s", "w", "pro", "cw", 0],
    ["w", "e", "dash", "cw", 1],
    ["e", "n", "anti", "cw", 1],
    ["n", "s", "dash", "cw", 1],
  ] as const
).map(soloStep);

export type ZansDiamondMove = {
  from: GridLocation;
  to: GridLocation;
  /** A shift goes to the next point around the diamond; a dash crosses it. */
  kind: "shift" | "dash";
};

/** The hand path itself: four shifts around the edge, four dashes across. */
export const ZANS_DIAMOND_PATH: readonly ZansDiamondMove[] =
  ZANS_DIAMOND_LEFT_STEPS.map((step) => ({
    from: step.startLocation,
    to: step.endLocation,
    kind: step.motionType === MotionType.DASH ? "dash" : "shift",
  }));

export type ZansDiamondFamilyId =
  | "original"
  | "stagger"
  | "right-reversed"
  | "left-reversed";

export interface ZansDiamondVariation {
  /** The generator's id: original, right+k, right-rev+k, left-rev+k. */
  id: string;
  family: ZansDiamondFamilyId;
  /** Beats the changed hand starts ahead on its path (0 for the original). */
  offset: number;
  word: string;
  startPlacement: GridPlacement;
  letters: readonly string[];
  left: HandArrangement;
  right: HandArrangement;
}

const FORWARD: HandArrangement = { reversed: false, offset: 0 };

function parseVariation(row: {
  id: string;
  word: string;
  startPlacement: string;
  letters: string[];
}): ZansDiamondVariation {
  const match = /^(right|left)(-rev)?\+(\d+)$/.exec(row.id);
  const base = {
    id: row.id,
    word: row.word,
    startPlacement: row.startPlacement as GridPlacement,
    letters: row.letters,
  };
  if (!match) {
    return {
      ...base,
      family: "original",
      offset: 0,
      left: FORWARD,
      right: FORWARD,
    };
  }
  const hand = match[1] as "right" | "left";
  const reversed = match[2] !== undefined;
  const offset = Number(match[3]);
  const changed: HandArrangement = { reversed, offset };
  const family: ZansDiamondFamilyId = !reversed
    ? "stagger"
    : hand === "right"
      ? "right-reversed"
      : "left-reversed";
  return {
    ...base,
    family,
    offset,
    left: hand === "left" ? changed : FORWARD,
    right: hand === "right" ? changed : FORWARD,
  };
}

/** The original first, then the 23 variations in the generator's order. */
export const ZANS_DIAMOND_VARIATIONS: readonly ZansDiamondVariation[] =
  variationTable.map(parseVariation);

export interface ZansDiamondFamily {
  id: ZansDiamondFamilyId;
  title: TranslationKey;
  body: TranslationKey;
  variations: readonly ZansDiamondVariation[];
}

/** The three ways one hand is changed, each with its playable members. */
export const ZANS_DIAMOND_FAMILIES: readonly ZansDiamondFamily[] = (
  [
    ["stagger", "guide_zans_stagger_title", "guide_zans_stagger_body"],
    [
      "right-reversed",
      "guide_zans_right_reversed_title",
      "guide_zans_right_reversed_body",
    ],
    [
      "left-reversed",
      "guide_zans_left_reversed_title",
      "guide_zans_left_reversed_body",
    ],
  ] as const
).map(([id, title, body]) => ({
  id,
  title,
  body,
  variations: ZANS_DIAMOND_VARIATIONS.filter((v) => v.family === id),
}));

export const ZANS_DIAMOND_ORIGINAL: ZansDiamondVariation =
  ZANS_DIAMOND_VARIATIONS.find((v) => v.family === "original")!;

/**
 * The caption beside a variation's word. Its family heading already says
 * which hand changed and how, so the caption only gives how far ahead the
 * changed hand starts.
 */
export function zansDiamondVariationLabel(
  variation: ZansDiamondVariation,
  t: (key: TranslationKey, params?: Record<string, string | number>) => string
): string {
  if (variation.family === "original") return t("guide_zans_label_original");
  if (variation.offset === 0) return t("guide_zans_label_together");
  if (variation.offset === 1) return t("guide_zans_label_one_ahead");
  return t("guide_zans_label_ahead", { n: variation.offset });
}

function handMotion(
  hand: HandSide,
  step: SoloPropStepData,
  propType: PropType
) {
  return createMotionData({
    motionType: step.motionType,
    rotationDirection: step.rotationDirection,
    startLocation: step.startLocation,
    endLocation: step.endLocation,
    turns: step.turns,
    startOrientation: step.startOrientation,
    endOrientation: step.endOrientation,
    hand,
    propType,
    gridMode: GridMode.DIAMOND,
  });
}

function stillHand(
  hand: HandSide,
  at: GridLocation,
  orientation: Orientation,
  propType: PropType
) {
  return createMotionData({
    motionType: MotionType.STATIC,
    startLocation: at,
    endLocation: at,
    startOrientation: orientation,
    endOrientation: orientation,
    hand,
    propType,
    gridMode: GridMode.DIAMOND,
  });
}

/**
 * A variation as a Guide strip: the start pose (stepNumber 0) and its eight
 * beats, ready for stripToSequence and the inline player. Both hands' steps
 * come from the same path through the generator's own arrangement, so the
 * page cannot play something the table does not spell.
 *
 * The Guide page draws the hands themselves, so it keeps the HAND default. The
 * home hero passes STAFF: HAND motions get a straight hand path from
 * stripToSequence and render as hand pictographs, which is not what a prop
 * show should look like.
 */
export function zansDiamondStrip(
  variation: ZansDiamondVariation,
  propType: PropType = PropType.HAND
): StepData[] {
  const left = arrangeSoloPropSteps(ZANS_DIAMOND_LEFT_STEPS, variation.left);
  const right = arrangeSoloPropSteps(ZANS_DIAMOND_RIGHT_STEPS, variation.right);
  const first = { left: left[0]!, right: right[0]! };
  const startPlacement = getGridPlacementFromLocations(
    first.left.startLocation,
    first.right.startLocation
  );
  const start = createStepData({
    id: `zans-${variation.id}-start`,
    stepNumber: 0,
    letter: null,
    startPlacement,
    endPlacement: startPlacement,
    gridMode: GridMode.DIAMOND,
    motions: {
      left: stillHand(
        HandSide.LEFT,
        first.left.startLocation,
        first.left.startOrientation,
        propType
      ),
      right: stillHand(
        HandSide.RIGHT,
        first.right.startLocation,
        first.right.startOrientation,
        propType
      ),
    },
  });
  const beats = left.map((leftStep, i) => {
    const rightStep = right[i]!;
    return createStepData({
      id: `zans-${variation.id}-${i + 1}`,
      stepNumber: i + 1,
      letter: (variation.letters[i] ?? null) as Letter | null,
      startPlacement: getGridPlacementFromLocations(
        leftStep.startLocation,
        rightStep.startLocation
      ),
      endPlacement: getGridPlacementFromLocations(
        leftStep.endLocation,
        rightStep.endLocation
      ),
      gridMode: GridMode.DIAMOND,
      motions: {
        left: handMotion(HandSide.LEFT, leftStep, propType),
        right: handMotion(HandSide.RIGHT, rightStep, propType),
      },
    });
  });
  return [start, ...beats];
}
