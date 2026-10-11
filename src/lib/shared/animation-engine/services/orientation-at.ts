/**
 * calculateOrientationAt(motion, t) — the keystone for halving pictographs.
 *
 * A halfway orientation is a PHYSICAL fact (where the staff actually is at
 * fraction t along a motion), so this samples the production animation
 * engine (`interpolatePropAngles`) for the staff angle at t and inverts it
 * through the pure angle<->orientation bijection
 * (`orientation-angle.ts`'s `staffAngleToOrientation`) over the 8-point
 * radial cycle.
 *
 * Radial orientations only (cardinal + interradial). Center-family ("spun",
 * L6) orientations return null — deferred to the physical-pose fallback,
 * out of scope for this phase. The bijection itself also returns null when
 * the sampled staff angle lands off the 45deg lattice (no legal orientation
 * exists at that t — e.g. halving an L4 quarter-turn).
 *
 * At t=1 this must equal the shipped discrete algebra `calculateEndOrientation`
 * — pinned by a dataset-wide invariant test across real pictograph data.
 *
 * Built by mirroring the proven engine-sampling pattern in `poseAt`
 * (src/routes/(public)/guide/level-2/_data/halfway-pose.ts:55-90).
 */
import { interpolatePropAngles } from "#lib/shared/animation-engine/services/prop-interpolator.js";
import { staffAngleToOrientation } from "#lib/shared/render/core/calculations/orientation-angle.js";
import { createMotionData } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
import {
  MotionType,
  HandSide,
  Orientation,
  RotationDirection,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import { GridMode, type GridLocation } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";

export type OrientationAtInput = {
  motionType: MotionType;
  rotationDirection: RotationDirection;
  startLocation: GridLocation;
  endLocation: GridLocation;
  startOrientation: Orientation;
  endOrientation: Orientation;
  turns?: number;
};

function isCenterOrientation(ori: string): boolean {
  return ori.startsWith("center");
}

/** Force the arc/linear path so the interpolator never reads global visibility
 *  state — same rationale as `poseAt`/`halfwayPose`. */
function pathShapeFor(type: MotionType): "arc" | "linear" {
  return type === MotionType.DASH ? "linear" : "arc";
}

/**
 * The prop's orientation at fraction t in [0,1] along a motion, or null when the
 * physical staff angle lands off the 45deg lattice (no legal orientation exists
 * at that t — e.g. halving an L4 quarter-turn) or the motion is a center/"spun"
 * orientation (deferred, Phase 1 scope). At t=1 this equals calculateEndOrientation.
 */
export function calculateOrientationAt(
  m: OrientationAtInput,
  t: number,
  hand: HandSide = HandSide.RIGHT
): Orientation | null {
  if (isCenterOrientation(m.startOrientation)) return null; // center-family deferred

  const angles = sampleAnglesAt(m, t, hand);
  if (!angles) return null;

  return staffAngleToOrientation(angles.staffRotationAngle, angles.centerPathAngle);
}

/**
 * The prop's ABSOLUTE staff angle (radians, engine/SVG convention: 0=east,
 * PI/2=south, PI=west, 3PI/2=north) at fraction t along a motion, or null when
 * the engine can't produce angles for this hand.
 *
 * Exists for the CENTER-location case: at the grid center the radial reference
 * direction is degenerate, so a center-relative Orientation label cannot encode
 * where the staff physically points (the interpolator's midpoint centerPathAngle
 * differs by travel axis — 0 for S<->N dashes, PI/2 for E<->W). Callers whose
 * halfway location is CENTER take this absolute angle and map it to the
 * center-family orientations (centerN..centerNW) instead of a radial label.
 */
export function calculateStaffAngleAt(
  m: OrientationAtInput,
  t: number,
  hand: HandSide = HandSide.RIGHT
): number | null {
  if (isCenterOrientation(m.startOrientation)) return null; // center-family deferred
  return sampleAnglesAt(m, t, hand)?.staffRotationAngle ?? null;
}

/** Shared engine sampling for the two calculators above. */
function sampleAnglesAt(
  m: OrientationAtInput,
  t: number,
  hand: HandSide
): { staffRotationAngle: number; centerPathAngle: number } | null {
  const motion = createMotionData({
    motionType: m.motionType,
    rotationDirection: m.rotationDirection,
    startLocation: m.startLocation,
    endLocation: m.endLocation,
    startOrientation: m.startOrientation,
    endOrientation: m.endOrientation,
    turns: m.turns ?? 0,
    hand,
    propType: PropType.STAFF,
    gridMode: GridMode.DIAMOND,
    pathShape: pathShapeFor(m.motionType),
  });
  const step = {
    id: "orientation-at",
    letter: null,
    gridMode: GridMode.DIAMOND,
    motions: { [hand]: motion },
  } as unknown as StepData;

  const result = interpolatePropAngles(step, t);
  return (hand === HandSide.LEFT ? result.leftAngles : result.rightAngles) ?? null;
}
