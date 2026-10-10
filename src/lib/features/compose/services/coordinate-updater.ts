/**
 * Coordinate Update Service
 *
 * Handles conversion from angles to x,y coordinates
 * for prop positioning on the animation grid.
 */

import type { PropState } from "#lib/shared/foundation/domain/types/prop-state.js";
import { ANIMATION_CONSTANTS } from "../shared/domain/constants";
// Grid constants from domain constants
const { GRID_CENTER, GRID_HALFWAY_POINT_OFFSET } = ANIMATION_CONSTANTS;

/**
 * Update x,y coordinates from center path angle
 * Uses exact same logic as standalone animator with grid center offset
 */
export function updateCoordinatesFromAngle(propState: PropState): void {
  const radius = GRID_HALFWAY_POINT_OFFSET; // 151.5
  const centerX = GRID_CENTER; // 475
  const centerY = GRID_CENTER; // 475

  // EXACT LOGIC FROM STANDALONE ANIMATOR
  propState.x = centerX + Math.cos(propState.centerPathAngle) * radius;
  propState.y = centerY + Math.sin(propState.centerPathAngle) * radius;
}

/**
 * Calculate x,y coordinates from angle without modifying state
 */
export function calculateCoordinatesFromAngle(centerPathAngle: number): {
  x: number;
  y: number;
} {
  const radius = GRID_HALFWAY_POINT_OFFSET;
  const centerX = GRID_CENTER;
  const centerY = GRID_CENTER;

  return {
    x: centerX + Math.cos(centerPathAngle) * radius,
    y: centerY + Math.sin(centerPathAngle) * radius,
  };
}

export function calculateAngleFromCoordinates(x: number, y: number): number {
  const centerX = GRID_CENTER;
  const centerY = GRID_CENTER;

  return Math.atan2(y - centerY, x - centerX);
}
