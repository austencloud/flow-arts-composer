/**
 * 3D Grid Layout Constants
 *
 * Scale: 1 unit = 1 meter
 *
 * Defines the radii for center, hand, and outer points,
 * and which locations are hand vs layer2 in each mode.
 *
 * NOTE: These are DEFAULT values. Use userProportionsState for
 * user-specific dimensions that respect their height and staff length.
 */

import { GridLocation } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import { DEFAULT_SCENE_DIMENSIONS } from "@austencloud/scene-3d";

// Base radius for hand points (comfortable arm extension)
// Default: ~76cm for 6'3" person (40% of height)
export const HAND_POINT_RADIUS = DEFAULT_SCENE_DIMENSIONS.handPointRadius;

// Outer points where staff tips reach when held at hand point
// Default: hand radius + half of 34" staff
export const OUTER_POINT_RADIUS = DEFAULT_SCENE_DIMENSIONS.outerPointRadius;

// Point sizes in meters (visual indicators on the grid)
export const CENTER_POINT_SIZE = 0.04;  // 4cm - largest, at origin
export const HAND_POINT_SIZE = 0.025;   // 2.5cm - medium, at hand radius
export const OUTER_POINT_SIZE = 0.018;  // 1.8cm - smallest, at outer radius

/**
 * Grid mode - determines which locations are hand points vs layer2 points
 */
export type GridMode = "diamond" | "box";

/**
 * Diamond mode: Cardinals (N/E/S/W) are hand points
 * Outer points are also on cardinals, just further out
 */
export const DIAMOND_HAND_POINTS = [
  GridLocation.NORTH,
  GridLocation.EAST,
  GridLocation.SOUTH,
  GridLocation.WEST,
] as const;

export const DIAMOND_OUTER_POINTS = [
  GridLocation.NORTH,
  GridLocation.EAST,
  GridLocation.SOUTH,
  GridLocation.WEST,
] as const;

/**
 * Box mode: Diagonals (NE/SE/SW/NW) are hand points
 * Outer points are also on diagonals, just further out
 */
export const BOX_HAND_POINTS = [
  GridLocation.NORTHEAST,
  GridLocation.SOUTHEAST,
  GridLocation.SOUTHWEST,
  GridLocation.NORTHWEST,
] as const;

export const BOX_OUTER_POINTS = [
  GridLocation.NORTHEAST,
  GridLocation.SOUTHEAST,
  GridLocation.SOUTHWEST,
  GridLocation.NORTHWEST,
] as const;

/**
 * Get hand points for a grid mode
 */
export function getHandPoints(mode: GridMode): readonly GridLocation[] {
  return mode === "diamond" ? DIAMOND_HAND_POINTS : BOX_HAND_POINTS;
}

/**
 * Get outer points for a grid mode (same directions as hand points, further radius)
 */
export function getOuterPoints(mode: GridMode): readonly GridLocation[] {
  return mode === "diamond" ? DIAMOND_OUTER_POINTS : BOX_OUTER_POINTS;
}

/**
 * Check if a location is a hand point in the given mode
 */
export function isHandPoint(mode: GridMode, location: GridLocation): boolean {
  const handPoints = getHandPoints(mode);
  return handPoints.includes(location);
}
