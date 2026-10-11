import { calculateMotionEndpoints } from "#lib/shared/animation-engine/services/endpoint-calculator.js";
import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";
import { isVisibleMotion } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";

/** A readable base pace for ordinary motions, including most zero-turn shifts. */
export const PICTOGRAPH_ARRIVAL_PROP_MOTION_MIN_MS = 850;
/** Keep repeated option selection responsive even at the highest turn setting. */
export const PICTOGRAPH_ARRIVAL_PROP_MOTION_MAX_MS = 2000;
/** The fastest either prop may rotate during the instructional preview. */
export const PICTOGRAPH_ARRIVAL_PROP_DEGREES_PER_SECOND = 360;

/**
 * Give both props one shared preview clock, sized for whichever travels farther.
 * Turns alone cannot drive this calculation because a zero-turn shift still has
 * base rotation. The endpoint calculator supplies the same effective staff
 * rotation that the pictograph renderer uses.
 */
export function getPictographArrivalPropMotionDurationMs(
  step: StepData
): number {
  const effectiveDegrees = ([step.motions?.left, step.motions?.right] as const)
    .filter(isVisibleMotion)
    .map(
      (motion) =>
        Math.abs(calculateMotionEndpoints(motion).staffRotationDelta) *
        (180 / Math.PI)
    );
  const largestRotation = Math.max(0, ...effectiveDegrees);
  const rateLimitedDuration =
    (largestRotation / PICTOGRAPH_ARRIVAL_PROP_DEGREES_PER_SECOND) * 1000;

  return Math.min(
    PICTOGRAPH_ARRIVAL_PROP_MOTION_MAX_MS,
    Math.max(PICTOGRAPH_ARRIVAL_PROP_MOTION_MIN_MS, rateLimitedDuration)
  );
}

/**
 * The card and grid settle together as one landing gesture, so the landing runs
 * on the same clock as every other grid layout change.
 */
export {
  LAYOUT_MOTION_DURATION_MS as PICTOGRAPH_ARRIVAL_LANDING_MS,
  LAYOUT_MOTION_EASING as PICTOGRAPH_ARRIVAL_LANDING_EASING,
} from "#lib/shared/transitions/layout-flip.js";
