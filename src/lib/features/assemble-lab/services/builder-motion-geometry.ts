import { GridLocation } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import {
  Orientation,
  RotationDirection,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import {
  LOCATION_ANGLES,
  PI,
} from "$lib/shared/foundation/domain/math-constants";
import {
  lerpAngle,
  normalizeAnglePositive,
  normalizeAngleSigned,
} from "$lib/shared/animation-engine/services/angle-calculator";
import {
  centerOrientationToDegrees,
  orientationToStaffAngle,
  staffAngleToCenterOrientation,
  staffAngleToOrientation,
} from "$lib/shared/render/core/calculations/orientation-angle";

export interface BuilderMotionGeometry {
  readonly startCenterAngle: number;
  readonly endCenterAngle: number;
  readonly startStaffAngle: number;
  readonly staffRotationDelta: number;
  readonly isSamePoint: boolean;
  readonly isStraightPath: boolean;
  readonly startRadius: number;
  readonly endRadius: number;
}

function staffAngleForOrientation(
  orientation: Orientation,
  centerAngle: number
): number {
  const centerDegrees = centerOrientationToDegrees(orientation);
  return centerDegrees === null
    ? orientationToStaffAngle(orientation, centerAngle)
    : normalizeAnglePositive((centerDegrees * PI) / 180);
}

function isOpposite(start: GridLocation, end: GridLocation): boolean {
  if (start === GridLocation.CENTER || end === GridLocation.CENTER)
    return false;
  const delta = Math.abs(
    normalizeAngleSigned(LOCATION_ANGLES[end] - LOCATION_ANGLES[start])
  );
  return Math.abs(delta - PI) < 0.01;
}

export function deriveBuilderMotionGeometry(
  startLocation: GridLocation,
  endLocation: GridLocation,
  startOrientation: Orientation,
  rotationDirection: RotationDirection,
  turnCount: number
): BuilderMotionGeometry {
  const startCenterAngle = LOCATION_ANGLES[startLocation];
  const endCenterAngle = LOCATION_ANGLES[endLocation];
  const startStaffAngle = staffAngleForOrientation(
    startOrientation,
    startCenterAngle
  );
  const isSamePoint = startLocation === endLocation;
  const isHash =
    !isSamePoint &&
    (startLocation === GridLocation.CENTER ||
      endLocation === GridLocation.CENTER);
  const isStraightPath =
    !isSamePoint && (isHash || isOpposite(startLocation, endLocation));
  const centerMovement = normalizeAngleSigned(
    endCenterAngle - startCenterAngle
  );
  const directionSign =
    rotationDirection === RotationDirection.COUNTER_CLOCKWISE ? -1 : 1;
  const turnRotation = directionSign * turnCount * PI;

  let staffRotationDelta = turnRotation;
  if (!isSamePoint && !isStraightPath) {
    if (turnCount === -0.5) {
      // Float holds the prop's absolute angle on every curved path, including
      // 45-degree and wider paths on the merged eight-point grid.
      staffRotationDelta = 0;
    } else {
      const arcDirection = centerMovement > 0 ? 1 : -1;
      const isPro =
        arcDirection === directionSign || Math.abs(centerMovement) < 0.01;
      staffRotationDelta =
        (isPro ? centerMovement : -centerMovement) + turnRotation;
    }
  }

  return {
    startCenterAngle,
    endCenterAngle,
    startStaffAngle,
    staffRotationDelta,
    isSamePoint,
    isStraightPath,
    startRadius: startLocation === GridLocation.CENTER ? 0 : 1,
    endRadius: endLocation === GridLocation.CENTER ? 0 : 1,
  };
}

export function calculateBuilderEndOrientation(
  startOrientation: Orientation,
  startLocation: GridLocation,
  endLocation: GridLocation,
  rotationDirection: RotationDirection,
  turnCount: number
): Orientation {
  const geometry = deriveBuilderMotionGeometry(
    startLocation,
    endLocation,
    startOrientation,
    rotationDirection,
    turnCount
  );
  const endStaffAngle = normalizeAnglePositive(
    geometry.startStaffAngle + geometry.staffRotationDelta
  );
  if (endLocation === GridLocation.CENTER) {
    return (
      (staffAngleToCenterOrientation(endStaffAngle) as Orientation | null) ??
      Orientation.CENTER_N
    );
  }

  return (
    (staffAngleToOrientation(
      endStaffAngle,
      geometry.endCenterAngle
    ) as Orientation | null) ?? Orientation.IN
  );
}

export { lerpAngle, normalizeAnglePositive };
