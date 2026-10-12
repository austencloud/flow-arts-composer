/**
 * Hand Motions' shared teaching content. The lesson, the Guide web page and
 * the print handbook read their words and figure states from here, so one
 * edit reaches all three. The captions are the lesson's approved wording;
 * Austen chose "Remain at the same point" for Static in every new view on
 * 2026-10-11 (the frozen first edition keeps the book's line). Interaction,
 * pacing and progress stay with each view.
 * Spec: docs/superpowers/specs/2026-10-10-hand-motions-rebuild-design.md
 */
import {
  getShortestRotationStepsBetweenLocations,
  rotateLocation,
} from "#lib/shared/create/services/rotation-helpers.js";
import { Letter } from "#lib/shared/foundation/domain/models/letter.js";
import { LetterType } from "#lib/shared/foundation/domain/models/letter-type.js";
import { t } from "#lib/shared/i18n/i18n.svelte.js";
import type { TranslationKey } from "#lib/shared/i18n/i18n-types.js";
import {
  GridLocation,
  GridMode,
} from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import { LETTER_TYPE_COLORS } from "#lib/shared/pictograph/shared/domain/constants/pictograph-constants.js";
import {
  HandSide,
  MotionType,
  RotationDirection,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import { createMotionData } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
import { motionQueryHandler } from "#lib/shared/pictograph/shared/services/motion-query-handler.js";

export const HAND_MOTIONS_TOPIC_UNITS = {
  title: "verified_level1_hand_motions_71",
  intro: "verified_level1_hand_motions_72",
  shiftName: "learn_motion_path_shift_name",
  shiftCaption: "learn_motion_path_shift_caption",
  dashName: "learn_motion_path_dash_name",
  dashCaption: "learn_motion_path_dash_caption",
  staticName: "learn_motion_path_static_name",
  staticCaption: "learn_motion_path_static_caption",
  mapPrompt: "learn_motion_map_prompt",
  pairsPrompt: "learn_motion_pairs_prompt",
  mirrorPair: "learn_motion_pairs_mirror",
  combinationsLead: "learn_motion_combinations_lead",
} as const satisfies Record<string, TranslationKey>;

export type HandMotionsTopicUnit = keyof typeof HAND_MOTIONS_TOPIC_UNITS;

export function handMotionsTopicText(unit: HandMotionsTopicUnit): string {
  return t(HAND_MOTIONS_TOPIC_UNITS[unit]);
}

/**
 * A message as plain text: the Guide's proof copy breaks some lines with
 * `<br>`, which a lesson reads as a space.
 */
export function plainTopicText(key: TranslationKey): string {
  return t(key).replace(/\s*<br\s*\/?>\s*/gi, " ");
}

export type HandMove = "shift" | "dash" | "static";

export const MOTION_MAP_MOVES = [
  { id: "shift", name: "shiftName", caption: "shiftCaption" },
  { id: "dash", name: "dashName", caption: "dashCaption" },
  { id: "static", name: "staticName", caption: "staticCaption" },
] as const satisfies readonly {
  id: HandMove;
  name: HandMotionsTopicUnit;
  caption: HandMotionsTopicUnit;
}[];

/** Where the motion map's blue hand rests, as in the book. */
export const MOTION_MAP_HOME: GridLocation = GridLocation.WEST;

/**
 * Names the move a hand makes between two hand points: the same point is
 * static, a quarter turn is a shift, a half turn is a dash. A 45-degree step
 * is no hand motion and returns null.
 */
export function classifyHandMove(
  from: GridLocation,
  to: GridLocation
): HandMove | null {
  const steps = getShortestRotationStepsBetweenLocations(from, to);
  if (steps === 0) return "static";
  if (steps === 2 || steps === -2) return "shift";
  if (steps === 4 || steps === -4) return "dash";
  return null;
}

export type MotionMapSlot =
  | "shift-clockwise"
  | "shift-counterclockwise"
  | "dash";

export interface MotionMapTarget {
  slot: MotionMapSlot;
  move: Exclude<HandMove, "static">;
  to: GridLocation;
  direction: "clockwise" | "counterclockwise";
}

/** The three moves drawn from a hand point: both shifts, then the dash. */
export function motionMapTargets(
  from: GridLocation
): readonly MotionMapTarget[] {
  const turned = (eighths: number) =>
    rotateLocation(from, eighths) as GridLocation;
  return [
    {
      slot: "shift-clockwise",
      move: "shift",
      to: turned(2),
      direction: "clockwise",
    },
    {
      slot: "shift-counterclockwise",
      move: "shift",
      to: turned(-2),
      direction: "counterclockwise",
    },
    { slot: "dash", move: "dash", to: turned(4), direction: "clockwise" },
  ];
}

/**
 * One blue hand's move as a pictograph, built like the book's motion boxes
 * (HandMotionsPage.svelte `singleHand`): shifts author as PRO and render as
 * the float arc for hand props, dashes as the straight dash arrow.
 */
export function motionMapArrowData(
  from: GridLocation,
  target: MotionMapTarget,
  hand: HandSide = HandSide.LEFT
): PictographData {
  return {
    id: `motion-map-${hand}-${target.slot}-${from}`,
    letter: null,
    gridMode: GridMode.DIAMOND,
    motions: {
      [hand]: handMotion(hand, {
        move: target.move,
        from,
        to: target.to,
      }),
    },
  };
}

/** Which way a quarter turn goes around the grid. */
export function handMoveDirection(
  from: GridLocation,
  to: GridLocation
): "clockwise" | "counterclockwise" {
  const steps = getShortestRotationStepsBetweenLocations(from, to) ?? 0;
  return steps < 0 ? "counterclockwise" : "clockwise";
}

/** One hand's move: from one point to another. */
export interface ComboHand {
  move: HandMove;
  from: GridLocation;
  to: GridLocation;
}

const HAND_MOTION_TYPES: Record<HandMove, MotionType> = {
  shift: MotionType.PRO,
  dash: MotionType.DASH,
  static: MotionType.STATIC,
};

/** A shift is PRO, and a pro prop turns the way its hand travels. */
const SHIFT_ROTATION = {
  clockwise: RotationDirection.CLOCKWISE,
  counterclockwise: RotationDirection.COUNTER_CLOCKWISE,
} as const;

function handMotion(hand: HandSide, { move, from, to }: ComboHand) {
  return createMotionData({
    motionType: HAND_MOTION_TYPES[move],
    rotationDirection:
      move === "shift"
        ? SHIFT_ROTATION[handMoveDirection(from, to)]
        : RotationDirection.NO_ROTATION,
    startLocation: from,
    endLocation: to,
    hand,
    propType: PropType.HAND,
    gridMode: GridMode.DIAMOND,
  });
}

export type HandCombinationId =
  | "dual-shift"
  | "shift"
  | "cross-shift"
  | "dash"
  | "dual-dash"
  | "static";

export interface HandCombination {
  id: HandCombinationId;
  name: TranslationKey;
  description: TranslationKey;
  letterType: LetterType;
  /** The Guide page that teaches it. */
  guideSlug: string;
  /** The book's two-hand example: blue makes the description's first move. */
  demo: { left: ComboHand; right: ComboHand };
  /** The example's letter (handPairLetter), which lays out its arrows. */
  demoLetter: Letter;
}

const { NORTH: N, EAST: E, SOUTH: S, WEST: W } = GridLocation;
const hand = (move: HandMove, from: GridLocation, to: GridLocation) => ({
  move,
  from,
  to,
});

/**
 * Two hands, three moves each: nine pairs, six once mirror pairs count as
 * one. They are the six letter types. The examples are the book's
 * (COMBO_DEMOS in HandMotionsPage.svelte, which /print keeps for itself),
 * except Dash: its static red hand stands at South, clear of the blue dash
 * arrow (Austen, 2026-10-11).
 */
export const HAND_COMBINATIONS: readonly HandCombination[] = [
  {
    id: "dual-shift",
    name: "verified_level1_hand_motions_77",
    description: "verified_level1_hand_motions_78",
    letterType: LetterType.TYPE1,
    guideSlug: "hm-type1",
    demo: { left: hand("shift", W, N), right: hand("shift", E, S) },
    demoLetter: Letter.A,
  },
  {
    id: "shift",
    name: "verified_level1_hand_motions_79",
    description: "verified_level1_hand_motions_80",
    letterType: LetterType.TYPE2,
    guideSlug: "hm-type2",
    demo: { left: hand("shift", W, N), right: hand("static", E, E) },
    demoLetter: Letter.SIGMA,
  },
  {
    id: "cross-shift",
    name: "verified_level1_hand_motions_81",
    description: "verified_level1_hand_motions_82",
    letterType: LetterType.TYPE3,
    guideSlug: "hm-type34",
    demo: { left: hand("shift", W, N), right: hand("dash", E, W) },
    demoLetter: Letter.THETA_DASH,
  },
  {
    id: "dash",
    name: "verified_level1_hand_motions_83",
    description: "learn_motion_dash_description",
    letterType: LetterType.TYPE4,
    guideSlug: "hm-type56",
    demo: { left: hand("dash", W, E), right: hand("static", S, S) },
    demoLetter: Letter.LAMBDA,
  },
  {
    id: "dual-dash",
    name: "verified_level1_hand_motions_85",
    description: "learn_motion_dual_dash_description",
    letterType: LetterType.TYPE5,
    guideSlug: "hm-type56",
    demo: { left: hand("dash", W, E), right: hand("dash", E, W) },
    demoLetter: Letter.PHI_DASH,
  },
  {
    id: "static",
    name: "verified_level1_hand_motions_70",
    description: "verified_level1_hand_motions_87",
    letterType: LetterType.TYPE6,
    guideSlug: "hm-type56",
    demo: { left: hand("static", W, W), right: hand("static", E, E) },
    demoLetter: Letter.ALPHA,
  },
];

const PAIR_COMBINATION: Record<string, HandCombinationId> = {
  "shift+shift": "dual-shift",
  "shift+static": "shift",
  "dash+shift": "cross-shift",
  "dash+static": "dash",
  "dash+dash": "dual-dash",
  "static+static": "static",
};

/** The combination two hands make, whichever hand makes which move. */
export function combinationFor(blue: HandMove, red: HandMove): HandCombination {
  const id = PAIR_COMBINATION[[blue, red].sort().join("+")];
  const combination = HAND_COMBINATIONS.find((c) => c.id === id);
  if (!combination) throw new Error(`No combination for ${blue} + ${red}`);
  return combination;
}

/**
 * A combination name in its letter-type colors, as the book prints it: a
 * hyphenated name takes the first color up to the hyphen, the second after.
 */
export function combinationNameSegments(
  name: string,
  letterType: LetterType
): readonly { text: string; color: string }[] {
  const [first, second] = LETTER_TYPE_COLORS[letterType];
  const hyphen = name.indexOf("-");
  if (hyphen < 0) return [{ text: name, color: first }];
  return [
    { text: name.slice(0, hyphen + 1), color: first },
    { text: name.slice(hyphen + 1), color: second },
  ];
}

/**
 * The letter two hands' moves make, from the pictograph data. Drawn with its
 * letter, a pair lays its arrows out by that letter's own rules: a
 * Cross-Shift's dash goes on the side of its point away from where the
 * shifting hand ends, so it never lies under that hand. Null when the data
 * cannot load; the pair then draws each arrow by its own move alone.
 */
export async function handPairLetter(
  left: ComboHand,
  right: ComboHand
): Promise<Letter | null> {
  try {
    const letter = await motionQueryHandler.findLetterByMotionConfiguration(
      handMotion(HandSide.LEFT, left),
      handMotion(HandSide.RIGHT, right),
      GridMode.DIAMOND
    );
    return (letter as Letter | null) ?? null;
  } catch {
    return null;
  }
}

/**
 * Two hands' moves as one pictograph: blue's move and red's, laid out by
 * their letter (handPairLetter) when one is given.
 */
export function handPairPictographData(
  left: ComboHand,
  right: ComboHand,
  letter: Letter | null = null,
  id = `hand-pair-${left.from}-${left.to}-${right.from}-${right.to}`
): PictographData {
  return {
    id,
    letter,
    gridMode: GridMode.DIAMOND,
    motions: {
      [HandSide.LEFT]: handMotion(HandSide.LEFT, left),
      [HandSide.RIGHT]: handMotion(HandSide.RIGHT, right),
    },
  };
}

/** The combination's two-hand example as a pictograph, laid out by its letter. */
export function combinationPictographData(
  combination: HandCombination
): PictographData {
  return handPairPictographData(
    combination.demo.left,
    combination.demo.right,
    combination.demoLetter,
    `hand-combination-${combination.id}`
  );
}
