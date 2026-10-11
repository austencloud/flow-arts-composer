/**
 * Motion calculator — computes target staff angles from MotionConfig3D.
 * Matches 2D EndpointCalculator sign conventions.
 */

import {
  MotionType,
  RotationDirection,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import type { MotionConfig3D } from "../domain/models/motion-data-3d";
import {
  normalizeAngleSigned,
} from "./angle-math-calculator";
import { mapOrientationToAngle } from "./orientation-mapper";

const PI = Math.PI;

/**
 * Calculate target staff angle based on motion type.
 *
 * IMPORTANT: This must match the 2D EndpointCalculator logic:
 * - dir = CCW ? -1 : 1 (not inverted!)
 * - centerMovement uses normalizeAngleSigned for shortest path
 */
export function calculateTargetStaffAngle(
  config: MotionConfig3D,
  startStaffAngle: number,
  startCenterAngle: number,
  endCenterAngle: number
): number {
  const centerMovement = normalizeAngleSigned(endCenterAngle - startCenterAngle);

  const dir =
    config.rotationDirection === RotationDirection.COUNTER_CLOCKWISE ? -1 : 1;
  const propRotation = dir * config.turns * PI;

  switch (config.motionType) {
    case MotionType.PRO:
      return startStaffAngle + centerMovement + propRotation;

    case MotionType.ANTI:
      return startStaffAngle - centerMovement + propRotation;

    case MotionType.STATIC:
      return config.turns > 0
        ? startStaffAngle + propRotation
        : mapOrientationToAngle(config.endOrientation, endCenterAngle);

    case MotionType.DASH:
      return config.turns > 0
        ? startStaffAngle + propRotation
        : mapOrientationToAngle(config.endOrientation, endCenterAngle);

    case MotionType.FLOAT:
      return startStaffAngle;

    default:
      return startStaffAngle;
  }
}
