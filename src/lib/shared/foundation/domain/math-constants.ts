/**
 * Math Constants
 *
 * Centralized mathematical constants used throughout the animator.
 */

import { GridLocation } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";

// Core mathematical constants
export const PI = Math.PI;
export const TWO_PI = 2 * PI;
export const HALF_PI = PI / 2;

// GridLocation angles mapping using centralized enums
// Canvas Y-axis points DOWN, so angles are:
// E=0°, S=90°, W=180°, N=270°(-90°)
export const LOCATION_ANGLES = {
  [GridLocation.EAST]: 0, // 0°
  [GridLocation.SOUTH]: HALF_PI, // 90°
  [GridLocation.WEST]: PI, // 180°
  [GridLocation.NORTH]: -HALF_PI, // 270° (or -90°)
  [GridLocation.NORTHEAST]: -HALF_PI / 2, // 315° (or -45°)
  [GridLocation.SOUTHEAST]: HALF_PI / 2, // 45°
  [GridLocation.SOUTHWEST]: PI - HALF_PI / 2, // 135° (between S 90° and W 180°)
  [GridLocation.NORTHWEST]: PI + HALF_PI / 2, // 225° (between W 180° and N 270°)
  [GridLocation.CENTER]: 0, // Center has no angle
} as const;

/**
 * How far a location sits from the grid center, in grid radii: 0 at the
 * center point, 1 on the rim. LOCATION_ANGLES only gives a direction, and
 * center's 0 there is East, so drawing center from its angle alone puts the
 * hand on the rim at East.
 */
export function locationRadius(location: GridLocation): number {
  return location === GridLocation.CENTER ? 0 : 1;
}

/** A location's point on the unit grid (canvas Y down), center at the origin. */
export function locationUnitPoint(location: GridLocation): {
  x: number;
  y: number;
} {
  const radius = locationRadius(location);
  const angle = LOCATION_ANGLES[location];
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
}

/**
 * True when a motion starts or ends at center. Such a motion is a hash: the
 * hand travels the straight line between the center point and its rim end,
 * never an arc of the rim.
 */
export function touchesCenter(
  startLocation: GridLocation,
  endLocation: GridLocation
): boolean {
  return (
    startLocation === GridLocation.CENTER || endLocation === GridLocation.CENTER
  );
}
