/**
 * Endpoint Calculation Service
 *
 * Handles calculation of motion endpoints and staff angles
 * for different motion types.
 */

import type { MotionData } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
import type { MotionEndpoints } from "#lib/shared/pictograph/shared/domain/models/motion-endpoints.js";
import {
  MotionType,
  RotationDirection,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import {
  mapPositionToAngle,
  mapOrientationToAngle,
  normalizeAngleSigned,
  normalizeAnglePositive,
} from "./angle-calculator";
import {
  calculateProTargetAngle,
  calculateAntispinTargetAngle,
  calculateStaticStaffAngle,
  calculateDashTargetAngle,
  calculateFloatStaffAngle,
} from "#lib/shared/animation-engine/services/motion-calculator.js";
import { PI } from "#lib/shared/foundation/domain/math-constants.js";

// ✅ ELIMINATED: StepEndpoints and StepDefinition - pointless reshuffling!
// Work directly with MotionData and return simple objects

/**
 * Calculate motion endpoints directly from MotionData (NATIVE!)
 */
export function calculateMotionEndpoints(motionData: MotionData): MotionEndpoints {
  const {
    startLocation,
    endLocation,
    startOrientation,
    endOrientation,
    motionType,
    rotationDirection,
    turns = 0,
  } = motionData;

  // Logging removed - too noisy
  const normalizedTurns = typeof turns === "number" ? turns : 0;

  const startCenterAngle = mapPositionToAngle(startLocation);
  const startStaffAngle = mapOrientationToAngle(
    startOrientation,
    startCenterAngle
  );
  const targetCenterAngle = mapPositionToAngle(endLocation);

  let calculatedTargetStaffAngle: number;
  let calculatedStaffRotationDelta: number;

  // Calculate target staff angle based on motion type
  switch (motionType) {
    case MotionType.PRO: {
      const numericTurns = normalizedTurns;
      const effectiveRotDir = rotationDirection;

      // Calculate delta for interpolation (un-normalized)
      const centerMovement = normalizeAngleSigned(
        targetCenterAngle - startCenterAngle
      );
      const dir =
        effectiveRotDir === RotationDirection.COUNTER_CLOCKWISE ? -1 : 1;
      const propRotation = dir * numericTurns * PI;
      const staffMovement = centerMovement; // PRO: same direction as grid movement
      calculatedStaffRotationDelta = staffMovement + propRotation;

      // Calculate normalized target angle
      calculatedTargetStaffAngle =
        calculateProTargetAngle(
          startCenterAngle,
          targetCenterAngle,
          startStaffAngle,
          numericTurns,
          effectiveRotDir
        );
      break;
    }
    case MotionType.ANTI: {
      const numericTurns = normalizedTurns;
      const effectiveRotDir = rotationDirection;

      // Calculate delta for interpolation (un-normalized)
      const centerMovement = normalizeAngleSigned(
        targetCenterAngle - startCenterAngle
      );
      const dir =
        effectiveRotDir === RotationDirection.COUNTER_CLOCKWISE ? -1 : 1;
      const propRotation = dir * numericTurns * PI;
      const staffMovement = -centerMovement; // ANTI: opposite direction to grid movement
      calculatedStaffRotationDelta = staffMovement + propRotation;

      // Calculate normalized target angle
      calculatedTargetStaffAngle =
        calculateAntispinTargetAngle(
          startCenterAngle,
          targetCenterAngle,
          startStaffAngle,
          numericTurns,
          effectiveRotDir
        );
      break;
    }
    case MotionType.STATIC: {
      const numericTurns = normalizedTurns;
      const effectiveRotDir = rotationDirection;

      // Calculate base orientation angle (without turns)
      const baseTargetAngle = calculateStaticStaffAngle(
        startStaffAngle,
        endOrientation,
        targetCenterAngle
      );

      // If there are turns, calculate rotation delta respecting direction
      if (
        numericTurns > 0 &&
        effectiveRotDir !== RotationDirection.NO_ROTATION
      ) {
        // STATIC with turns: rotation is determined ONLY by turns and direction
        // DO NOT add orientation change - the turns value is the total rotation
        const dir =
          effectiveRotDir === RotationDirection.COUNTER_CLOCKWISE ? -1 : 1;
        calculatedStaffRotationDelta = dir * numericTurns * PI; // 1 turn = 180° (π)
        calculatedTargetStaffAngle = normalizeAnglePositive(
          startStaffAngle + calculatedStaffRotationDelta
        );
      } else {
        // No turns or NO_ROTATION: use orientation (shortest path)
        calculatedTargetStaffAngle = baseTargetAngle;
        calculatedStaffRotationDelta = normalizeAngleSigned(
          calculatedTargetStaffAngle - startStaffAngle
        );
      }
      break;
    }
    case MotionType.DASH: {
      const numericTurns = normalizedTurns;
      const effectiveRotDir = rotationDirection;

      calculatedTargetStaffAngle =
        calculateDashTargetAngle(
          startStaffAngle,
          endOrientation,
          targetCenterAngle,
          numericTurns,
          effectiveRotDir
        );

      // DASH with turns: rotation is determined ONLY by turns and direction
      // DO NOT add orientation change - the turns value is the total rotation
      // This ensures multi-turn dashes rotate the full amount, not shortest path
      if (numericTurns > 0) {
        const dir =
          effectiveRotDir === RotationDirection.COUNTER_CLOCKWISE ? -1 : 1;
        calculatedStaffRotationDelta = dir * numericTurns * PI; // 1 turn = 180° (π)
      } else {
        // No turns: calculate based on orientation change only
        const baseAngle = calculateDashTargetAngle(
          startStaffAngle,
          endOrientation,
          targetCenterAngle,
          0,
          effectiveRotDir
        );
        calculatedStaffRotationDelta = normalizeAngleSigned(
          baseAngle - startStaffAngle
        );
      }
      break;
    }
    case MotionType.FLOAT: {
      calculatedTargetStaffAngle =
        calculateFloatStaffAngle(startStaffAngle);
      // For FLOAT, no rotation
      calculatedStaffRotationDelta = 0;
      break;
    }
    default: {
      const _exhaustiveCheck: never = motionType;
      console.warn(
        `Unknown motion type '${String(_exhaustiveCheck)}'. Treating as static.`
      );
      calculatedTargetStaffAngle = startStaffAngle;
      calculatedStaffRotationDelta = 0;
      break;
    }
  }

  return {
    startCenterAngle,
    startStaffAngle,
    targetCenterAngle,
    targetStaffAngle: calculatedTargetStaffAngle,
    staffRotationDelta: calculatedStaffRotationDelta,
    rotationDirection, // Pass through for interpolation
  };
}

/**
 * Calculate endpoint staff angle for a motion (NATIVE MotionData!)
 */
export function calculateEndpointStaffAngle(motionData: MotionData): number {
  const endpoints = calculateMotionEndpoints(motionData);
  return endpoints.targetStaffAngle;
}
