/**
 * The travel a pictograph's props take when a sequence edit changes the
 * drawing in place: rotate, mirror, flip, swap hands, invert, or an
 * unannounced change such as an undo or a turns edit.
 *
 * Each prop gets a presentation-only motion from where the old drawing put it
 * to where the new one does, and PictographContainer plays that motion through
 * calculatePictographMotionPositions, the same seam the step editor's rotate
 * arrows use. Progress 0 and 1 are therefore the old and new static drawings
 * exactly; only the path between them comes from here:
 *
 * - rotate: a pro arc around the grid center, in the rotation's direction;
 * - reflect (mirror, flip): a straight dash across the mirror axis;
 * - swap: each prop arcs to the spot its partner held;
 * - a prop whose location does not change spins in place.
 *
 * Arrows do not travel. The timeline below fades the old ones out before the
 * props leave and brings the new ones in once the props land.
 */

import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";
import {
  GridLocation,
  GridMode,
} from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import {
  HandSide,
  MotionType,
  RotationDirection,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import {
  createMotionData,
  isVisibleMotion,
  type MotionData,
} from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
import { DURATION } from "#lib/shared/transitions/transitions.js";

export type PictographEdit =
  | {
      readonly kind: "rotate";
      readonly direction: "clockwise" | "counterclockwise";
      /** 45° increments. */
      readonly steps: number;
    }
  /** "vertical" is Mirror (E ↔ W), "horizontal" is Flip (N ↔ S). */
  | { readonly kind: "reflect"; readonly axis: "vertical" | "horizontal" }
  | { readonly kind: "swap" }
  /** Orientation-only changes (Invert): props spin where they stand. */
  | { readonly kind: "spin" }
  /** An unannounced in-place change: undo, a turns edit, a reused cell. */
  | { readonly kind: "travel" };

const HANDS = [HandSide.LEFT, HandSide.RIGHT] as const;

/** Compass order, clockwise from north; one index is 45°. */
const COMPASS: readonly GridLocation[] = [
  GridLocation.NORTH,
  GridLocation.NORTHEAST,
  GridLocation.EAST,
  GridLocation.SOUTHEAST,
  GridLocation.SOUTH,
  GridLocation.SOUTHWEST,
  GridLocation.WEST,
  GridLocation.NORTHWEST,
];

/**
 * What decides where a drawing's props stand. Two drawings with the same key
 * put their props in the same places, so a change that keeps it (a letter
 * derived after the move, a selection ring, a duration) is not a travel.
 */
export function pictographGeometryKey(
  pictograph: Pick<PictographData, "motions" | "gridMode"> | null | undefined
): string {
  if (!pictograph) return "";
  const hand = (side: HandSide): string => {
    const motion = pictograph.motions?.[side];
    if (!isVisibleMotion(motion)) return "-";
    return `${motion.endLocation}:${motion.endOrientation}`;
  };
  return `${hand(HandSide.LEFT)}|${hand(HandSide.RIGHT)}|${pictograph.gridMode ?? ""}`;
}

/** Clockwise 45° steps from one location to another, 0..7; null off-compass. */
function compassSteps(from: GridLocation, to: GridLocation): number | null {
  const a = COMPASS.indexOf(from);
  const b = COMPASS.indexOf(to);
  if (a < 0 || b < 0) return null;
  return (b - a + COMPASS.length) % COMPASS.length;
}

type TravelPath = "spin" | "arc" | "dash";

function pathFor(
  edit: PictographEdit,
  from: GridLocation,
  to: GridLocation
): TravelPath {
  if (from === to) return "spin";
  switch (edit.kind) {
    case "rotate":
    case "swap":
      return "arc";
    case "reflect":
      return "dash";
    case "spin":
    case "travel":
      // Straight across when the prop crosses to the opposite side, where an
      // arc would have to pick a side; otherwise the short way round.
      return compassSteps(from, to) === 4 ? "dash" : "arc";
  }
}

function travelMotion(
  hand: HandSide,
  before: MotionData,
  after: MotionData,
  path: TravelPath,
  edit: PictographEdit,
  gridMode: GridMode
): MotionData {
  const from = before.endLocation;
  const to = after.endLocation;
  const rotationDirection =
    path !== "arc"
      ? RotationDirection.NO_ROTATION
      : edit.kind === "rotate"
        ? edit.direction === "clockwise"
          ? RotationDirection.CLOCKWISE
          : RotationDirection.COUNTER_CLOCKWISE
        : (compassSteps(from, to) ?? 0) <= 4
          ? RotationDirection.CLOCKWISE
          : RotationDirection.COUNTER_CLOCKWISE;
  return createMotionData({
    motionType:
      path === "arc"
        ? MotionType.PRO
        : path === "dash"
          ? MotionType.DASH
          : MotionType.STATIC,
    rotationDirection,
    startLocation: from,
    endLocation: to,
    turns: 0,
    startOrientation: before.endOrientation,
    endOrientation: after.endOrientation,
    isVisible: true,
    propType: after.propType,
    arrowLocation: to,
    hand,
    gridMode,
    // The travel IS the pathway: force the circle (or the straight line)
    // regardless of the global animation path-shape setting.
    pathShape: path === "dash" ? "linear" : "arc",
  });
}

/**
 * The presentation-only step that carries each prop from the old drawing to
 * the new one, or null when no prop changes place or heading. A hand drawn on
 * only one side of the edit does not travel; it simply shows or hides.
 */
export function buildEditTravelStep(
  before: PictographData,
  after: PictographData,
  edit: PictographEdit
): StepData | null {
  const gridMode = after.gridMode ?? GridMode.DIAMOND;
  const motions: PictographData["motions"] = {};
  let moves = false;

  for (const hand of HANDS) {
    const from = before.motions?.[hand];
    const to = after.motions?.[hand];
    if (!isVisibleMotion(from) || !isVisibleMotion(to)) continue;
    if (
      from.endLocation !== to.endLocation ||
      from.endOrientation !== to.endOrientation
    ) {
      moves = true;
    }
    motions[hand] = travelMotion(
      hand,
      from,
      to,
      pathFor(edit, from.endLocation, to.endLocation),
      edit,
      gridMode
    );
  }

  if (!moves) return null;

  const base = "stepNumber" in after ? (after as StepData) : null;
  return {
    ...after,
    motions,
    // The container only computes motion overrides for StepData, so the step
    // fields are always present; -1 keeps a start tile's label off.
    stepNumber: base?.stepNumber ?? -1,
    duration: base?.duration ?? 1,
    leftReversal: false,
    rightReversal: false,
    isBlank: base?.isBlank ?? false,
  } as StepData;
}

/**
 * The grid's turn for a whole-sequence rotate that toggles diamond and box:
 * from the old mode's resting angle, 45° per step in the rotation's
 * direction. Null when the grid does not turn.
 */
export function editGridTurn(
  before: Pick<PictographData, "gridMode">,
  after: Pick<PictographData, "gridMode">,
  edit: PictographEdit
): { from: number; to: number } | null {
  if (edit.kind !== "rotate") return null;
  const resting = (mode: GridMode | undefined): number | null =>
    mode === GridMode.BOX ? 45 : mode === GridMode.DIAMOND ? 0 : null;
  const from = resting(before.gridMode);
  const to = resting(after.gridMode);
  if (from === null || to === null || from === to) return null;
  const sign = edit.direction === "clockwise" ? 1 : -1;
  return { from, to: from + sign * 45 * edit.steps };
}

export interface EditTimeline {
  /** Old arrows fade out while the props hold their old places. */
  readonly arrowsOutMs: number;
  /** The props travel. */
  readonly travelMs: number;
  /** New arrows fade in after the props land. */
  readonly arrowsInMs: number;
}

export const EDIT_TIMELINE: EditTimeline = {
  arrowsOutMs: DURATION.fast,
  travelMs: DURATION.dramatic,
  arrowsInMs: DURATION.fast,
};

export function editTimelineTotal(timeline: EditTimeline): number {
  return timeline.arrowsOutMs + timeline.travelMs + timeline.arrowsInMs;
}

export interface EditFrame {
  /** True while the old drawing is still the one shown (its arrows fading). */
  readonly holdingOld: boolean;
  /** Opacity of the old drawing's arrows while it is held. */
  readonly oldArrowOpacity: number;
  /** Eased travel progress, 0 at the old places and 1 at the new. */
  readonly progress: number;
  /** Opacity of the new drawing's arrows: 0 until the props land. */
  readonly newArrowOpacity: number;
}

function cubicInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 0.5 * Math.pow(2 * t - 2, 3) + 1;
}

function clamp01(value: number): number {
  return value <= 0 ? 0 : value >= 1 ? 1 : value;
}

/** The shared frame `elapsedMs` into an edit (0 while the clock waits to start). */
export function sampleEditTimeline(
  elapsedMs: number,
  timeline: EditTimeline
): EditFrame {
  const out = timeline.arrowsOutMs;
  const travelEnd = out + timeline.travelMs;
  if (elapsedMs < out) {
    return {
      holdingOld: true,
      oldArrowOpacity: 1 - clamp01(elapsedMs / out),
      progress: 0,
      newArrowOpacity: 0,
    };
  }
  const travel =
    timeline.travelMs > 0 ? clamp01((elapsedMs - out) / timeline.travelMs) : 1;
  return {
    holdingOld: false,
    oldArrowOpacity: 0,
    progress: cubicInOut(travel),
    newArrowOpacity:
      elapsedMs < travelEnd
        ? 0
        : timeline.arrowsInMs > 0
          ? clamp01((elapsedMs - travelEnd) / timeline.arrowsInMs)
          : 1,
  };
}
