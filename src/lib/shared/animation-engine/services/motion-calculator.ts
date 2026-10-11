/**
 * Motion Calculation Service
 *
 * Handles calculations for different motion types including
 * pro, anti, static, dash, and float motions.
 */

import { Orientation } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import { RotationDirection } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import { PI } from "#lib/shared/foundation/domain/math-constants.js";
import {
  mapOrientationToAngle,
  normalizeAnglePositive,
  normalizeAngleSigned,
} from "#lib/shared/animation-engine/services/angle-calculator.js";

export function calculateProIsolationStaffAngle(
  centerPathAngle: number,
  _propRotDir: RotationDirection
): number {
  return normalizeAnglePositive(centerPathAngle + PI);
}

export function calculateProTargetAngle(
  startCenterAngle: number,
  targetCenterAngle: number,
  startStaffAngle: number,
  turns: number,
  rotationDirection: RotationDirection
): number {
  const centerMovement = normalizeAngleSigned(
    targetCenterAngle - startCenterAngle
  );
  const dir =
    rotationDirection === RotationDirection.COUNTER_CLOCKWISE ? -1 : 1;
  const propRotation = dir * turns * PI; // 1 turn = 180°, not 360°
  const staffMovement = centerMovement; // PRO: same direction as grid movement
  const targetStaffAngle = startStaffAngle + staffMovement + propRotation;
  return normalizeAnglePositive(targetStaffAngle);
}

export function calculateAntispinTargetAngle(
  startCenterAngle: number,
  targetCenterAngle: number,
  startStaffAngle: number,
  turns: number,
  rotationDirection: RotationDirection
): number {
  const centerMovement = normalizeAngleSigned(
    targetCenterAngle - startCenterAngle
  );
  const dir =
    rotationDirection === RotationDirection.COUNTER_CLOCKWISE ? -1 : 1;
  const propRotation = dir * turns * PI; // 1 turn = 180°, not 360°
  const staffMovement = -centerMovement; // ANTI: opposite direction to grid movement
  const targetStaffAngle = startStaffAngle + staffMovement + propRotation;
  return normalizeAnglePositive(targetStaffAngle);
}

export function calculateStaticStaffAngle(
  startStaffAngle: number,
  endOrientation: Orientation,
  targetCenterAngle: number
): number {
  const endOriAngle = mapOrientationToAngle(endOrientation, targetCenterAngle);
  const angleDiff = normalizeAngleSigned(endOriAngle - startStaffAngle);

  return Math.abs(angleDiff) > 0.1 ? endOriAngle : startStaffAngle;
}

export function calculateDashTargetAngle(
  startStaffAngle: number,
  endOrientation: Orientation,
  targetCenterAngle: number,
  turns: number,
  rotationDirection: RotationDirection
): number {
  // Calculate base orientation angle
  let baseAngle: number;
  if (endOrientation === Orientation.IN) {
    baseAngle = targetCenterAngle + PI;
  } else if (endOrientation === Orientation.OUT) {
    baseAngle = targetCenterAngle;
  } else {
    baseAngle = startStaffAngle;
  }

  // Add prop rotation: 1 turn = 180° (π) for all motion types
  const dir =
    rotationDirection === RotationDirection.COUNTER_CLOCKWISE ? -1 : 1;
  const propRotation = dir * turns * PI;
  const targetStaffAngle = baseAngle + propRotation;

  return normalizeAnglePositive(targetStaffAngle);
}

export function calculateFloatStaffAngle(startStaffAngle: number): number {
  return startStaffAngle;
}
