/**
 * Staff Placements' shared teaching content: Austen's verbatim proof copy
 * (verified_level1_staff_placements_*) and the 12 staff pictographs, Alpha,
 * Beta and Gamma in each of four thumb orientations. The Guide web page and
 * the written-guide sheet read from here. The opening paragraph is split into
 * its sentences so the page can set the first as its lede; the words are
 * unchanged.
 * Spec: docs/superpowers/specs/2026-10-10-guide-rethink-design.md
 */
import { t } from "#lib/shared/i18n/i18n.svelte.js";
import type { TranslationKey } from "#lib/shared/i18n/i18n-types.js";
import { createMotionData } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
import {
  MotionType,
  HandSide,
  Orientation,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import {
  GridMode,
  GridLocation,
} from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import { getGridPlacementFromLocations } from "#lib/shared/pictograph/grid/services/grid-placement-deriver.js";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import { Letter } from "#lib/shared/foundation/domain/models/letter.js";
import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";
import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
import type { PlacementKind } from "./placements-topic";

export const STAFF_PLACEMENTS_TOPIC_UNITS = {
  title: "verified_level1_staff_placements_285",
  markThumb: "guide_topic_staff_mark_thumb",
  trackRotations: "guide_topic_staff_track_rotations",
  negativeSpace: "guide_topic_staff_negative_space",
  centerEnd: "verified_level1_staff_placements_287",
  practice: "verified_level1_staff_placements_288",
  thumbs: "verified_level1_print_thumbs",
  thumbIn: "guide_topic_staff_thumb_in",
  thumbOut: "guide_topic_staff_thumb_out",
  unmarked: "verified_level1_staff_placements_290",
  thumbsInFirst: "verified_level1_staff_placements_291",
} as const satisfies Record<string, TranslationKey>;

export type StaffPlacementsTopicUnit = keyof typeof STAFF_PLACEMENTS_TOPIC_UNITS;

/** The proof copy breaks lines for the printed sheet; the web text wraps. */
export function staffPlacementsTopicText(
  unit: StaffPlacementsTopicUnit
): string {
  return t(STAFF_PLACEMENTS_TOPIC_UNITS[unit])
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/\s{2,}/g, " ");
}

/** One thumb-orientation column: blue (left) hand, then red (right) hand. */
export type ThumbColumn = { blue: Orientation; red: Orientation };

/** The proof sheet's column order: in, out, out/in, in/out. */
export const THUMB_COLUMNS: readonly ThumbColumn[] = [
  { blue: Orientation.IN, red: Orientation.IN },
  { blue: Orientation.OUT, red: Orientation.OUT },
  { blue: Orientation.OUT, red: Orientation.IN },
  { blue: Orientation.IN, red: Orientation.OUT },
];

const { EAST, SOUTH, WEST } = GridLocation;

type StaffRow = { letter: Letter; left: GridLocation; right: GridLocation };

/** An end always sits at the center point: each staff spans hand point to center. */
const STAFF_ROWS: Readonly<Record<PlacementKind, StaffRow>> = {
  alpha: { letter: Letter.ALPHA, left: WEST, right: EAST },
  beta: { letter: Letter.BETA, left: SOUTH, right: SOUTH },
  gamma: { letter: Letter.GAMMA, left: SOUTH, right: EAST },
};

const staticMotion = (hand: HandSide, loc: GridLocation, ori: Orientation) =>
  createMotionData({
    motionType: MotionType.STATIC,
    startLocation: loc,
    endLocation: loc,
    startOrientation: ori,
    endOrientation: ori,
    hand,
    propType: PropType.STAFF,
    gridMode: GridMode.DIAMOND,
  });

const staffCell = (row: StaffRow, col: number): StepData => {
  const thumbs = THUMB_COLUMNS[col]!;
  const placement = getGridPlacementFromLocations(row.left, row.right);
  return {
    id: `sp-${row.letter}-${col}`,
    letter: row.letter,
    gridMode: GridMode.DIAMOND,
    startPlacement: placement,
    endPlacement: placement,
    motions: {
      left: staticMotion(HandSide.LEFT, row.left, thumbs.blue),
      right: staticMotion(HandSide.RIGHT, row.right, thumbs.red),
    },
    stepNumber: null,
    duration: 1,
    leftReversal: false,
    rightReversal: false,
    isBlank: false,
  } as unknown as StepData;
};

/** Each placement's four staff pictographs, in THUMB_COLUMNS order. */
export const STAFF_CELLS_BY_KIND: Readonly<
  Record<PlacementKind, readonly PictographData[]>
> = {
  alpha: THUMB_COLUMNS.map((_, col) =>
    staffCell(STAFF_ROWS.alpha, col)
  ) as unknown as PictographData[],
  beta: THUMB_COLUMNS.map((_, col) =>
    staffCell(STAFF_ROWS.beta, col)
  ) as unknown as PictographData[],
  gamma: THUMB_COLUMNS.map((_, col) =>
    staffCell(STAFF_ROWS.gamma, col)
  ) as unknown as PictographData[],
};
