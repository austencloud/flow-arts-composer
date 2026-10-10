/**
 * Angle normalization and interpolation operations.
 */

import { RotationDirection } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";

const TWO_PI = Math.PI * 2;
const PI = Math.PI;

/**
 * Structural interface for the old AngleMathCalculator class API.
 * Used by implementation classes that accept it as a constructor parameter.
 */
export interface AngleMathCalculatorAPI {
  normalizeAngle(angle: number): number;
  normalizeAngleSigned(angle: number): number;
  lerp(a: number, b: number, t: number): number;
  lerpAngle(a: number, b: number, t: number): number;
  lerpAngleDirectional(start: number, end: number, direction: RotationDirection, t: number): number;
}

/** Normalize angle to [0, 2π) */
export function normalizeAngle(angle: number): number {
  let normalized = angle % TWO_PI;
  if (normalized < 0) normalized += TWO_PI;
  return normalized;
}

/** Normalize angle to signed range (-π, π] */
export function normalizeAngleSigned(angle: number): number {
  const norm = normalizeAngle(angle);
  return norm > PI ? norm - TWO_PI : norm;
}

/** Linear interpolation between two values */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Interpolate angle taking shortest path */
export function lerpAngle(a: number, b: number, t: number): number {
  const diff = b - a;

  let normalizedDiff = diff % TWO_PI;
  if (normalizedDiff > PI) normalizedDiff -= TWO_PI;
  if (normalizedDiff < -PI) normalizedDiff += TWO_PI;

  return normalizeAngle(a + normalizedDiff * t);
}

/** Interpolate angle with explicit direction (CW, CCW, or shortest path) */
export function lerpAngleDirectional(
  start: number,
  end: number,
  direction: RotationDirection,
  t: number,
): number {
  if (direction === RotationDirection.NO_ROTATION) {
    return lerpAngle(start, end, t);
  }

  let delta = end - start;

  if (direction === RotationDirection.CLOCKWISE) {
    if (delta > 0) delta -= TWO_PI;
  } else {
    if (delta < 0) delta += TWO_PI;
  }

  return normalizeAngle(start + delta * t);
}
