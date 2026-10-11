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
import { t } from "#lib/shared/i18n/i18n.svelte.js";
import type { TranslationKey } from "#lib/shared/i18n/i18n-types.js";
import {
  GridLocation,
  GridMode,
} from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import {
  HandSide,
  MotionType,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import { createMotionData } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";

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
} as const satisfies Record<string, TranslationKey>;

export type HandMotionsTopicUnit = keyof typeof HAND_MOTIONS_TOPIC_UNITS;

export function handMotionsTopicText(unit: HandMotionsTopicUnit): string {
  return t(HAND_MOTIONS_TOPIC_UNITS[unit]);
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
  target: MotionMapTarget
): PictographData {
  return {
    id: `motion-map-${target.slot}-${from}`,
    letter: null,
    gridMode: GridMode.DIAMOND,
    motions: {
      [HandSide.LEFT]: createMotionData({
        motionType: target.move === "dash" ? MotionType.DASH : MotionType.PRO,
        startLocation: from,
        endLocation: target.to,
        hand: HandSide.LEFT,
        propType: PropType.HAND,
        gridMode: GridMode.DIAMOND,
      }),
    },
  };
}
