/**
 * Maps prop orientations to angles relative to center path.
 */

import { Orientation } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";

const PI = Math.PI;
const HALF_PI = PI / 2;

/**
 * Structural interface for the old OrientationMapper class API.
 * Used by implementation classes that accept it as a constructor parameter.
 */
export interface OrientationMapperAPI {
  mapOrientationToAngle(orientation: Orientation, centerPathAngle: number): number;
}

export function mapOrientationToAngle(orientation: Orientation, centerPathAngle: number): number {
  switch (orientation) {
    case Orientation.IN:
      return centerPathAngle + PI;
    case Orientation.OUT:
      return centerPathAngle;
    case Orientation.CLOCK:
      return centerPathAngle + HALF_PI;
    case Orientation.COUNTER:
      return centerPathAngle - HALF_PI;
    default:
      return centerPathAngle;
  }
}
