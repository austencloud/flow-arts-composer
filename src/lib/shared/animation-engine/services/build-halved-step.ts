/**
 * buildHalvedStep(step, t) — Phase 3 core: compose a REAL pictograph of a
 * step's halfway state, per hand.
 *
 * This is not an arithmetic trick — it builds an actual synthetic StepData
 * whose end state IS the state at fraction t, so the existing prepare/render
 * pipeline (props from location+orientation, arrow from the Phase 2 `segment`
 * branch) can render it with zero new renderer code.
 *
 * Per hand:
 *   - a placeholder/invisible motion (see `isVisibleMotion`) carries through
 *     unchanged — a hand that isn't really there doesn't get "halved".
 *   - a FLOAT motion bails the WHOLE step to null. No `float_half` asset
 *     exists yet (spec §9 restricts v1 to pro/anti/dash/static).
 *   - a skewed motion (`skewSteps`/`skewDir` set) bails the whole step to
 *     null. Skew's arc-length math for orientation-at-t isn't validated for
 *     v1 (spec §9) — halving is restricted to non-skew motions.
 *   - `calculateOrientationAt` is the keystone (see ./orientation-at.ts) and
 *     is the ONLY source of the halfway orientation. It is called with the
 *     hand's own `HandSide` explicitly (the function defaults to RIGHT, so
 *     a left hand passed without the 3rd arg would silently compute the right
 *     angle). A null result means the physical staff angle at t is off the
 *     45deg lattice (no legal Orientation exists there — e.g. an L4
 *     quarter-turn) and bails the whole step.
 *
 * On t !== 0.5: this function ALWAYS returns null. The signature keeps a `t`
 * parameter for future generality (the segment shape already supports
 * arbitrary {t0,t1}), but v1 only supports the midpoint. This corrects an
 * over-claim in spec §7 (docs/superpowers/specs/
 * 2026-07-14-halved-pictograph-pipeline-design.md) that on-lattice quarter
 * frames (t=0.25/0.75) "route through the pipeline" the same way halves do:
 * quarters CAN have a legal orientation (the 45deg lattice check in
 * `calculateOrientationAt` doesn't care which fraction it's asked about), but
 * they do NOT have a legal grid LOCATION. A shift's quarter-point sits 1/4 of
 * the way along the diamond-grid arc between two named points — physically
 * between the grid's 8 named locations, not on any of them. Only the
 * midpoint of a cardinal-to-intercardinal (or intercardinal-to-cardinal) arc
 * lands on a point this pipeline can name (see `SHIFT_MIDPOINTS` below).
 * Quarter frames stay on the guide's visual `poseArrow` path.
 *
 * Null contract, once more for callers: null = "not pipeline-representable
 * at this t" (off-lattice orientation, unsupported motion family, or no
 * named halfway location) — render a visual pose instead (the guide's
 * existing `poseArrow`/`halfwayPose` path), don't guess.
 */
import {
  calculateOrientationAt,
  calculateStaffAngleAt,
  type OrientationAtInput,
} from "./orientation-at";
import { staffAngleToCenterOrientation } from "$lib/shared/render/core/calculations/orientation-angle";
import {
  createMotionData,
  isVisibleMotion,
  type MotionData,
} from "$lib/shared/pictograph/shared/domain/models/motion-data";
import {
  MotionType,
  type HandSide,
  type Orientation,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { GridLocation } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import type {
  StepData,
  StepMotions,
} from "$lib/shared/foundation/domain/models/step-data";

/**
 * Order-independent lookup: the arc midpoint between two 45deg-adjacent grid
 * points. Covers both directions of travel (a shift can run either way along
 * the arc) via a sorted pair key. Only the eight adjacencies that actually
 * exist on the diamond/box 8-point grid are listed — anything else (e.g. a
 * cardinal-to-opposite-cardinal shift, which doesn't travel a single 45deg
 * arc segment) has no legal named midpoint and falls through to null.
 */
const SHIFT_MIDPOINTS: Record<string, GridLocation> = {
  [pairKey(GridLocation.NORTH, GridLocation.EAST)]: GridLocation.NORTHEAST,
  [pairKey(GridLocation.EAST, GridLocation.SOUTH)]: GridLocation.SOUTHEAST,
  [pairKey(GridLocation.SOUTH, GridLocation.WEST)]: GridLocation.SOUTHWEST,
  [pairKey(GridLocation.WEST, GridLocation.NORTH)]: GridLocation.NORTHWEST,
  [pairKey(GridLocation.NORTHEAST, GridLocation.SOUTHEAST)]: GridLocation.EAST,
  [pairKey(GridLocation.SOUTHEAST, GridLocation.SOUTHWEST)]: GridLocation.SOUTH,
  [pairKey(GridLocation.SOUTHWEST, GridLocation.NORTHWEST)]: GridLocation.WEST,
  [pairKey(GridLocation.NORTHWEST, GridLocation.NORTHEAST)]: GridLocation.NORTH,
};

function pairKey(a: GridLocation, b: GridLocation): string {
  return [a, b].sort().join("|");
}

/** The center-family orientation at fraction t: the engine's absolute staff
 *  angle mapped onto the 8-point compass. Null when off the 45deg lattice. */
function centerOrientationAt(
  input: OrientationAtInput,
  t: number,
  color: HandSide
): Orientation | null {
  const staffAngle = calculateStaffAngleAt(input, t, color);
  if (staffAngle === null) return null;
  return (
    (staffAngleToCenterOrientation(staffAngle) as Orientation | null) ?? null
  );
}

/** Halfway grid location for a shift (pro/anti) — the named arc midpoint, or
 *  null when the start/end pair isn't a single 45deg-adjacent hop (unknown
 *  pair → don't guess, bail). */
function shiftHalfwayLocation(motion: MotionData): GridLocation | null {
  return (
    SHIFT_MIDPOINTS[pairKey(motion.startLocation, motion.endLocation)] ?? null
  );
}

/** Halfway grid location for one hand's motion, or null when the motion
 *  family has no named halfway point on-lattice. */
function halfwayLocationFor(motion: MotionData): GridLocation | null {
  switch (motion.motionType) {
    case MotionType.PRO:
    case MotionType.ANTI:
      return shiftHalfwayLocation(motion);
    case MotionType.DASH:
      // A standard dash travels perimeter->opposite-perimeter in a straight
      // line THROUGH the center, so its midpoint is the center point. A hash
      // (dash-) runs perimeter<->center instead — its midpoint sits halfway
      // along that half-line, off the named grid — so center-touching dashes
      // bail to null rather than claiming CENTER.
      if (
        motion.startLocation === GridLocation.CENTER ||
        motion.endLocation === GridLocation.CENTER
      ) {
        return null;
      }
      return GridLocation.CENTER;
    case MotionType.STATIC:
      // A static motion doesn't travel — "halfway" is still at the start.
      return motion.startLocation;
    default:
      // FLOAT is guarded out before this is ever reached.
      return null;
  }
}

/**
 * Halve a single hand's motion at fraction t, or null if this hand can't be
 * halved (see the guard list in the module doc comment above).
 */
function halveMotion(motion: MotionData, t: number): MotionData | null {
  if (motion.motionType === MotionType.FLOAT) return null;
  if (motion.skewSteps || motion.skewDir) return null;

  const halfwayLocation = halfwayLocationFor(motion);
  if (halfwayLocation === null) return null;

  const orientationInput = {
    motionType: motion.motionType,
    rotationDirection: motion.rotationDirection,
    startLocation: motion.startLocation,
    endLocation: motion.endLocation,
    startOrientation: motion.startOrientation,
    endOrientation: motion.endOrientation,
    // motion.turns is `number | "fl"` on the canonical Motion shape, but
    // FLOAT (the only "fl" case) is already guarded out above.
    turns: typeof motion.turns === "number" ? motion.turns : 0,
  };

  // At CENTER (a standard dash's midpoint) the radial reference is degenerate:
  // the interpolator's midpoint centerPathAngle depends on the travel axis
  // (0 for S<->N, PI/2 for E<->W), so a radial label computed against it can't
  // be rendered back to the correct physical angle by location+orientation
  // alone (that lossiness is what drew dash-half props 90deg off). The
  // center-family (L6 centric) orientations are ABSOLUTE and survive the
  // roundtrip — PropRotAngleManager's CENTRIC_ANGLE_MAP and the arrow
  // segment-rotation branch both render them by compass angle directly.
  const halfwayOrientation =
    halfwayLocation === GridLocation.CENTER
      ? centerOrientationAt(orientationInput, t, motion.hand)
      : calculateOrientationAt(orientationInput, t, motion.hand);
  if (halfwayOrientation === null) return null;

  return createMotionData({
    ...motion,
    endLocation: halfwayLocation,
    endOrientation: halfwayOrientation,
    // The segment discriminator, not turns, is what routes the arrow
    // pipeline's half-motion branches (Phase 2a) — turns is left as-is.
    segment: { t0: 0, t1: t },
  });
}

/**
 * Compose a real pictograph of `step`'s state at fraction t (default the
 * midpoint), or null when it isn't pipeline-representable at that t — see
 * the module doc comment for the full guard list and the null contract.
 */
export function buildHalvedStep(step: StepData, t = 0.5): StepData | null {
  // v1 only supports the midpoint: it's the only fraction with a NAMED grid
  // location (see the module doc comment). Quarter fractions have legal
  // orientations but no legal location, so they stay off this path.
  if (t !== 0.5) return null;

  const leftMotion = step.motions.left;
  const rightMotion = step.motions.right;

  const halvedLeft = isVisibleMotion(leftMotion)
    ? halveMotion(leftMotion, t)
    : leftMotion;
  if (halvedLeft === null) return null;

  const halvedRight = isVisibleMotion(rightMotion)
    ? halveMotion(rightMotion, t)
    : rightMotion;
  if (halvedRight === null) return null;

  const motions: StepMotions = { left: halvedLeft, right: halvedRight };

  return {
    id: step.id,
    letter: step.letter,
    // The halfway hand-pair may not match any named GridPlacement the
    // original endPlacement referred to — letterless/positionless synthetic
    // steps are valid (StepData allows null letter and positions).
    startPlacement: null,
    endPlacement: null,
    gridMode: step.gridMode,
    motions,
    stepNumber: step.stepNumber,
    duration: step.duration,
    leftReversal: step.leftReversal,
    rightReversal: step.rightReversal,
    isBlank: step.isBlank,
    ...(step.betaSwapped !== undefined
      ? { betaSwapped: step.betaSwapped }
      : {}),
    ...(step.category !== undefined ? { category: step.category } : {}),
  };
}
