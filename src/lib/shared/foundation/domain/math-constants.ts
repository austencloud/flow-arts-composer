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
