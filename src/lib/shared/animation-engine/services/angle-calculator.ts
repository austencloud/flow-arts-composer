/**
 * Angle Calculation Service
 *
 * Handles all angle-related calculations including normalization,
 * position mapping, and orientation mapping.
 */

/**
 * Interface type for consumers that accept an angle calculator via constructor injection.
 * All methods are backed by the module-level functions below.
 */
export interface AngleCalculatorLike {
  normalizeAnglePositive(angle: number): number;
  normalizeAngleSigned(angle: number): number;
  mapPositionToAngle(loc: GridLocation): number;
  mapOrientationToAngle(ori: Orientation, centerPathAngle: number): number;
  lerp(a: number, b: number, t: number): number;
  lerpAngle(a: number, b: number, t: number): number;
  lerpAngleDirectional(startAngle: number, endAngle: number, direction: RotationDirection, progress: number): number;
}

import type { GridLocation } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import { Orientation } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import { RotationDirection } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import {
  HALF_PI,
  LOCATION_ANGLES,
  PI,
  TWO_PI,
} from "#lib/shared/foundation/domain/math-constants.js";
import {
  orientationToStaffAngle,
  RADIAL_CYCLE,
} from "#lib/shared/render/core/calculations/orientation-angle.js";

export function normalizeAnglePositive(angle: number): number {
  const norm = angle % TWO_PI;
  return norm < 0 ? norm + TWO_PI : norm;
}

export function normalizeAngleSigned(angle: number): number {
  const norm = normalizeAnglePositive(angle);
  return norm > PI ? norm - TWO_PI : norm;
}

export function mapPositionToAngle(loc: GridLocation): number {
  return LOCATION_ANGLES[loc];
}

export function mapOrientationToAngle(
  ori: Orientation,
  centerPathAngle: number
): number {
  // Radial (cardinal + interradial): canonical 8-point map. Cardinals are
  // byte-identical to the prior hard-coded branches; interradials, which
  // previously fell through to the counter branch, are now correct.
  if ((RADIAL_CYCLE as readonly string[]).includes(ori as string)) {
    return orientationToStaffAngle(
      ori as unknown as (typeof RADIAL_CYCLE)[number],
      centerPathAngle
    );
  }
  // Non-radial (center/"spun") orientations: preserve the prior behavior exactly
  // (this pass does not change center handling — out of scope).
  return normalizeAnglePositive(centerPathAngle - HALF_PI);
}

/**
 * Linear interpolation between two values
 */
export function lerp(a: number, b: number, t: number): number {
  return a * (1 - t) + b * t;
}

/**
 * Angular interpolation (handles wraparound) - ALWAYS TAKES SHORTEST PATH
 * ⚠️ This ignores rotation direction! Use lerpAngleDirectional for explicit direction control.
 */
export function lerpAngle(a: number, b: number, t: number): number {
  const d = normalizeAngleSigned(b - a);
  return normalizeAnglePositive(a + d * t);
}

/**
 * Directional angular interpolation - respects explicit rotation direction from sequence data
 * This is NOT over-engineered - it directly follows the sequence data instructions!
 *
 * @param startAngle - Starting angle in radians
 * @param endAngle - Target angle in radians
 * @param direction - Explicit rotation direction from sequence data (CW, CCW, or noRotation)
 * @param progress - Interpolation progress (0 to 1)
 * @returns Interpolated angle that follows the specified direction
 */
export function lerpAngleDirectional(
  startAngle: number,
  endAngle: number,
  direction: RotationDirection,
  progress: number
): number {
  // For noRotation (STATIC/DASH), use shortest path
  if (direction === RotationDirection.NO_ROTATION) {
    return lerpAngle(startAngle, endAngle, progress);
  }

  // Normalize angles to [0, 2π) range
  const start = normalizeAnglePositive(startAngle);
  const end = normalizeAnglePositive(endAngle);

  // Calculate the raw difference
  let delta = end - start;

  // Force the direction specified in the sequence data
  if (direction === RotationDirection.CLOCKWISE) {
    // Clockwise = negative rotation (in standard math coords)
    // If delta is positive, we need to go the long way (subtract 2π)
    if (delta > 0) {
      delta -= TWO_PI;
    }
    // If delta is 0, we're at the same angle - no movement needed
  } else {
    // Counter-clockwise = positive rotation
    // If delta is negative, we need to go the long way (add 2π)
    if (delta < 0) {
      delta += TWO_PI;
    }
    // If delta is 0, we're at the same angle - no movement needed
  }

  // Apply the forced direction
  return normalizeAnglePositive(start + delta * progress);
}

/**
 * Create an object that satisfies AngleCalculatorLike.
 * Used by class-based consumers (EndpointCalculator, PropInterpolator, etc.)
 * that receive an angle calculator via constructor injection.
 */
export function createAngleCalculator(): AngleCalculatorLike {
  return {
    normalizeAnglePositive,
    normalizeAngleSigned,
    mapPositionToAngle,
    mapOrientationToAngle,
    lerp,
    lerpAngle,
    lerpAngleDirectional,
  };
}
