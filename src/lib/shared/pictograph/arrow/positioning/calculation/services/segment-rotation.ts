import { GridLocation } from "../../../../grid/domain/enums/grid-enums";
import type { Orientation } from "../../../../shared/domain/enums/pictograph-enums";
import {
  orientationToStaffAngle,
  centerOrientationToDegrees,
  RADIAL_CYCLE,
} from "#lib/shared/render/core/calculations/orientation-angle.js";
import { LOCATION_ANGLES } from "#lib/shared/foundation/domain/math-constants.js";

/**
 * The center-path angle (RADIANS) for a hand at `location`, i.e. the direction
 * from grid center to the hand, in the engine's convention. Sourced from the
 * canonical `LOCATION_ANGLES` — the same constant the production engine uses to
 * produce `centerPathAngle` — so this never re-derives grid geometry.
 *
 * CENTER resolves to its canonical `LOCATION_ANGLES[GridLocation.CENTER] = 0`
 * directly — oracle-verified (`half-arrow-pipeline.test.ts`, DASH S→N t2): for
 * that halfway `halfwayOrientation === "clock"` and
 * `orientationToStaffAngle("clock", 0) === PI/2 === 90°`, which matches the
 * guide's physical staff angle (`poseAt`) exactly. An earlier revision special-
 * cased CENTER to `centerFallback` (the pre-dash cardinal) purely to preserve
 * pre-dedup behavior; that fallback was wrong by 90° against the ground truth
 * and has been removed for the rotation path. `centerFallback` is kept as a
 * parameter — still used when `location` itself has no `LOCATION_ANGLES` entry
 * — in case a future non-center use needs it.
 */
export function centerPathAngleFor(
  location: GridLocation,
  centerFallback: GridLocation
): number {
  return (
    LOCATION_ANGLES[location] ??
    LOCATION_ANGLES[centerFallback] ??
    LOCATION_ANGLES[GridLocation.EAST]
  );
}

/**
 * Half-arrow rotation in DEGREES (pipeline arrow-rotation convention): the staff
 * angle at the segment end, from Phase 1's pure orientation→angle bijection.
 * `halfwayOrientation` is the motion's endOrientation (the state at t1).
 *
 * `LOCATION_ANGLES` (via centerPathAngleFor) is already in radians, which is what
 * `orientationToStaffAngle` expects — no unit conversion on the way in.
 */
export function calculateSegmentRotation(
  halfwayOrientation: Orientation,
  location: GridLocation,
  centerFallback: GridLocation
): number {
  // Center-family (centerN…) halfway orientations are ABSOLUTE compass angles —
  // buildHalvedStep emits them when the halfway location is CENTER (a standard
  // dash's midpoint), where the radial reference is degenerate and travel-axis-
  // dependent (the fixed centerPathAngleFor(CENTER)=0 below is only correct for
  // the S<->N axis; E<->W dashes label against PI/2 and were 90deg off). The
  // absolute angle needs no reference — return it directly.
  const centerDeg = centerOrientationToDegrees(
    halfwayOrientation as Parameters<typeof centerOrientationToDegrees>[0]
  );
  if (centerDeg !== null) return centerDeg;

  // orientationToStaffAngle's contract is "radial: caller guards" — any other
  // non-radial orientation would silently degrade; warn (do not throw) so a
  // future wiring can't silently ship a wrong number.
  if (!RADIAL_CYCLE.includes(halfwayOrientation as (typeof RADIAL_CYCLE)[number])) {
    console.warn(
      `[segment-rotation] non-radial halfwayOrientation "${halfwayOrientation}" — ` +
        `orientationToStaffAngle guards for radial orientations only; rotation may be wrong.`
    );
  }

  const centerPathAngle = centerPathAngleFor(location, centerFallback);
  const staffAngleRad = orientationToStaffAngle(
    halfwayOrientation as Parameters<typeof orientationToStaffAngle>[0],
    centerPathAngle
  );
  const deg = (staffAngleRad * 180) / Math.PI;
  return ((deg % 360) + 360) % 360;
}
