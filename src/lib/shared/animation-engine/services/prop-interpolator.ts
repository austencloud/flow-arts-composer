/**
 * Prop Interpolation Service
 *
 * Focused service for angle interpolation and motion calculations.
 * Single responsibility: Motion interpolation between keyframes.
 */

import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";
import { MotionType } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import type { MotionData } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
import { isVisibleMotion } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
import type { MotionEndpoints } from "#lib/shared/pictograph/shared/domain/models/motion-endpoints.js";
import { GridLocation } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import {
  locationUnitPoint,
  touchesCenter,
} from "#lib/shared/foundation/domain/math-constants.js";
import type { InterpolationResult } from "./animation-state-manager";
import { lerpAngle, normalizeAnglePositive } from "./angle-calculator";
import { calculateMotionEndpoints } from "./endpoint-calculator";
import {
  getAnimationVisibilityManager,
  type AnimationVisibilityStateManager,
} from "#lib/shared/animation-engine/state/animation-visibility-state.svelte.js";

// `vm` lets a caller pass a per-instance (e.g. landing-page ephemeral) visibility
// manager so path-shape settings stay scoped to that surface. When omitted we
// fall back to the global singleton — unchanged behavior for the main app.
function resolvePathType(
  motionType: MotionType,
  motionPathShape?: "arc" | "linear" | "concave",
  vm?: AnimationVisibilityStateManager
): "arc" | "linear" | "concave" {
  if (motionPathShape) return motionPathShape;
  if (motionType === MotionType.DASH) return "linear";
  if (motionType === MotionType.STATIC) return "arc";

  const manager = vm ?? getAnimationVisibilityManager();

  const pathPolicy = manager.getPathPolicy();
  if (pathPolicy.motionAwarePaths) {
    if (motionType === MotionType.PRO) return "arc";
    if (motionType === MotionType.ANTI) return "concave";
  }

  return pathPolicy.pathShape;
}

/**
 * Calculate interpolated prop angles for current beat progress
 * Uses Cartesian interpolation for DASH motions (straight through center)
 * Uses angular interpolation for all other motions
 */
export function interpolatePropAngles(
  currentStepData: StepData,
  stepProgress: number,
  vm?: AnimationVisibilityStateManager
): InterpolationResult {
  // Get motion data directly from domain beat (PURE DOMAIN!)
  // A hand that is "not really there" is an invisible placeholder under the
  // both-required Step shape — treat it exactly like the old absent hand
  // (solo/mandala animations and blank beats rely on this skip).
  const leftMotion = isVisibleMotion(currentStepData.motions?.left)
    ? currentStepData.motions.left
    : undefined;
  const rightMotion = isVisibleMotion(currentStepData.motions?.right)
    ? currentStepData.motions.right
    : undefined;

  // Both hands missing = truly invalid
  if (!leftMotion && !rightMotion) {
    return {
      leftAngles: null,
      rightAngles: null,
      isValid: false,
    };
  }

  // Interpolate the left prop (null if not present)
  let leftAngles: InterpolationResult["leftAngles"] = null;
  if (leftMotion) {
    const leftEndpoints = calculateMotionEndpoints(leftMotion);
    leftAngles = interpolateMotion(leftEndpoints, leftMotion, stepProgress, vm);
  }

  // Interpolate the right prop (null if not present)
  let rightAngles: InterpolationResult["rightAngles"] = null;
  if (rightMotion) {
    const rightEndpoints = calculateMotionEndpoints(rightMotion);
    rightAngles = interpolateMotion(
      rightEndpoints,
      rightMotion,
      stepProgress,
      vm
    );
  }

  return {
    leftAngles,
    rightAngles,
    isValid: true,
  };
}

function interpolateMotion(
  endpoints: MotionEndpoints,
  motion: MotionData,
  progress: number,
  vm?: AnimationVisibilityStateManager
): {
  centerPathAngle: number;
  staffRotationAngle: number;
  x?: number;
  y?: number;
} {
  if (touchesCenter(motion.startLocation, motion.endLocation)) {
    return interpolateHashMotion(endpoints, motion, progress);
  }

  const pathType = resolvePathType(motion.motionType, motion.pathShape, vm);

  if (pathType === "linear") {
    return interpolateLinearMotion(endpoints, progress);
  }

  if (pathType === "concave") {
    return interpolateConcaveMotion(endpoints, progress);
  }

  return {
    centerPathAngle: lerpAngle(
      endpoints.startCenterAngle,
      endpoints.targetCenterAngle,
      progress
    ),
    staffRotationAngle: normalizeAnglePositive(
      endpoints.startStaffAngle +
        endpoints.staffRotationDelta * progress
    ),
  };
}

/**
 * Interpolate motion using Cartesian coordinates (straight line path)
 * Used for DASH motions and shifts when pathShape is "linear"
 * Returns angle for compatibility, but the angle will be recalculated from x,y in the renderer
 */
function interpolateLinearMotion(
  endpoints: MotionEndpoints,
  progress: number
): {
  centerPathAngle: number;
  staffRotationAngle: number;
  x?: number;
  y?: number;
} {
  // Convert start and end angles to Cartesian coordinates (unit circle)
  const startX = Math.cos(endpoints.startCenterAngle);
  const startY = Math.sin(endpoints.startCenterAngle);
  const endX = Math.cos(endpoints.targetCenterAngle);
  const endY = Math.sin(endpoints.targetCenterAngle);

  // Linear interpolation in Cartesian space (straight line through center)
  const currentX = startX + (endX - startX) * progress;
  const currentY = startY + (endY - startY) * progress;

  // Convert back to angle for compatibility
  const centerPathAngle = Math.atan2(currentY, currentX);

  // Staff rotation: Use total rotation delta to respect turns (NOT shortest path!)
  // This ensures 1.5 turns rotates +270°, not -90° via shortest path
  const staffRotationAngle = normalizeAnglePositive(
    endpoints.startStaffAngle + endpoints.staffRotationDelta * progress
  );

  // Return x,y coordinates so renderer can use them directly
  return { centerPathAngle, staffRotationAngle, x: currentX, y: currentY };
}

/**
 * A motion with a center end (a hash) runs the straight line between the
 * center point (radius 0) and its rim end, whatever its path shape, as
 * Assemble's animator does (`builder-motion-geometry.ts`). Returning x,y makes
 * renderers place the hand there instead of on the rim at the angle.
 */
function interpolateHashMotion(
  endpoints: MotionEndpoints,
  motion: MotionData,
  progress: number
): {
  centerPathAngle: number;
  staffRotationAngle: number;
  x: number;
  y: number;
} {
  const start = locationUnitPoint(motion.startLocation);
  const end = locationUnitPoint(motion.endLocation);
  const x = start.x + (end.x - start.x) * progress;
  const y = start.y + (end.y - start.y) * progress;

  // The hand stays on its rim end's ray, so that end's angle is its direction
  // all the way in, including at the center itself, where atan2 has none.
  const centerPathAngle =
    motion.startLocation === GridLocation.CENTER
      ? endpoints.targetCenterAngle
      : endpoints.startCenterAngle;
  const staffRotationAngle = normalizeAnglePositive(
    endpoints.startStaffAngle + endpoints.staffRotationDelta * progress
  );

  return { centerPathAngle, staffRotationAngle, x, y };
}

/**
 * Concave path: reflection of the arc path across the straight line.
 * At every t, concavePoint = 2·straightPoint - circlePoint.
 */
function interpolateConcaveMotion(
  endpoints: MotionEndpoints,
  progress: number
): {
  centerPathAngle: number;
  staffRotationAngle: number;
  x?: number;
  y?: number;
} {
  // Circle point (arc path)
  const arcAngle = lerpAngle(
    endpoints.startCenterAngle,
    endpoints.targetCenterAngle,
    progress
  );
  const circleX = Math.cos(arcAngle);
  const circleY = Math.sin(arcAngle);

  // Straight line point
  const startX = Math.cos(endpoints.startCenterAngle);
  const startY = Math.sin(endpoints.startCenterAngle);
  const endX = Math.cos(endpoints.targetCenterAngle);
  const endY = Math.sin(endpoints.targetCenterAngle);
  const straightX = startX + (endX - startX) * progress;
  const straightY = startY + (endY - startY) * progress;

  // Reflect circle across straight line
  const concaveX = 2 * straightX - circleX;
  const concaveY = 2 * straightY - circleY;

  const centerPathAngle = Math.atan2(concaveY, concaveX);
  const staffRotationAngle = normalizeAnglePositive(
    endpoints.startStaffAngle + endpoints.staffRotationDelta * progress
  );

  return { centerPathAngle, staffRotationAngle, x: concaveX, y: concaveY };
}

/**
 * Calculate initial prop angles from first beat
 */
export function calculateInitialAngles(firstStep: StepData): InterpolationResult {
  // Get motion data directly from domain beat (PURE DOMAIN!)
  // Invisible placeholders count as "not there" (see interpolatePropAngles).
  const leftStartMotion = isVisibleMotion(firstStep.motions?.left)
    ? firstStep.motions.left
    : undefined;
  const rightStartMotion = isVisibleMotion(firstStep.motions?.right)
    ? firstStep.motions.right
    : undefined;

  // Both hands missing = truly invalid
  if (!leftStartMotion && !rightStartMotion) {
    return {
      leftAngles: null,
      rightAngles: null,
      isValid: false,
    };
  }

  // Calculate angles for whichever hand is present (null for missing hand)
  let leftAngles: InterpolationResult["leftAngles"] = null;
  if (leftStartMotion) {
    const leftStartEndpoints = calculateMotionEndpoints(leftStartMotion);
    leftAngles = touchesCenter(
      leftStartMotion.startLocation,
      leftStartMotion.endLocation
    )
      ? interpolateHashMotion(leftStartEndpoints, leftStartMotion, 0)
      : {
          centerPathAngle: leftStartEndpoints.startCenterAngle,
          staffRotationAngle: leftStartEndpoints.startStaffAngle,
        };
  }

  let rightAngles: InterpolationResult["rightAngles"] = null;
  if (rightStartMotion) {
    const rightStartEndpoints = calculateMotionEndpoints(rightStartMotion);
    rightAngles = touchesCenter(
      rightStartMotion.startLocation,
      rightStartMotion.endLocation
    )
      ? interpolateHashMotion(rightStartEndpoints, rightStartMotion, 0)
      : {
          centerPathAngle: rightStartEndpoints.startCenterAngle,
          staffRotationAngle: rightStartEndpoints.startStaffAngle,
        };
  }

  return {
    leftAngles,
    rightAngles,
    isValid: true,
  };
}

/**
 * Get motion data for debugging (supports single-hand beats)
 */
export function getMotionData(stepData: StepData): {
  left: MotionData | null;
  right: MotionData | null;
} {
  return {
    left: stepData.motions?.left ?? null,
    right: stepData.motions?.right ?? null,
  };
}

/**
 * Calculate endpoints for debugging (supports single-hand beats)
 */
export function getEndpoints(stepData: StepData): {
  left: MotionEndpoints | null;
  right: MotionEndpoints | null;
} {
  const motionData = getMotionData(stepData);
  return {
    left: motionData.left
      ? calculateMotionEndpoints(motionData.left)
      : null,
    right: motionData.right
      ? calculateMotionEndpoints(motionData.right)
      : null,
  };
}
