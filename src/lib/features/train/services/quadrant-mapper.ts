import {
  GridLocation,
  GridMode,
} from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";

/**
 * Maps normalized coordinates (0-1) to one of 8 grid quadrants.
 * Assumes camera view where user faces camera (mirrored).
 * @param x - Normalized x coordinate (0=left, 1=right)
 * @param y - Normalized y coordinate (0=top, 1=bottom)
 */
export function mapToQuadrant(x: number, y: number): GridLocation {
  // Calculate relative position from center
  const dx = x - 0.5;
  const dy = 0.5 - y; // Invert Y (screen coords vs math coords)

  // Calculate angle from center (0 = up/north, clockwise positive)
  let angle = Math.atan2(dx, dy) * (180 / Math.PI);
  if (angle < 0) angle += 360;

  // Always detect all 8 directions
  const sector = Math.floor((angle + 22.5) / 45) % 8;
  const allQuadrants: GridLocation[] = [
    GridLocation.NORTH,
    GridLocation.NORTHEAST,
    GridLocation.EAST,
    GridLocation.SOUTHEAST,
    GridLocation.SOUTH,
    GridLocation.SOUTHWEST,
    GridLocation.WEST,
    GridLocation.NORTHWEST,
  ];
  return allQuadrants[sector] ?? GridLocation.NORTH;
}

/**
 * Check if a quadrant is valid for the given grid mode.
 * DIAMOND mode: Only cardinal directions (N, E, S, W)
 * BOX mode: Only intercardinal directions (NE, SE, SW, NW)
 * @param quadrant - The detected quadrant
 * @param gridMode - The active grid mode
 * @returns true if the quadrant is valid for this mode, false otherwise
 */
export function isValidForMode(quadrant: GridLocation, gridMode?: GridMode): boolean {
  if (!gridMode) {
    return true; // All quadrants valid when no mode specified
  }

  const cardinalQuadrants: GridLocation[] = [
    GridLocation.NORTH,
    GridLocation.EAST,
    GridLocation.SOUTH,
    GridLocation.WEST,
  ];

  const intercardinalQuadrants: GridLocation[] = [
    GridLocation.NORTHEAST,
    GridLocation.SOUTHEAST,
    GridLocation.SOUTHWEST,
    GridLocation.NORTHWEST,
  ];

  if (gridMode === GridMode.DIAMOND) {
    return cardinalQuadrants.includes(quadrant);
  } else if (gridMode === GridMode.BOX) {
    return intercardinalQuadrants.includes(quadrant);
  }

  return true; // Default: all valid
}

/**
 * Calculate distance between two quadrants (0 = same, 4 = opposite)
 */
export function quadrantDistance(a: GridLocation, b: GridLocation): number {
  const order: GridLocation[] = [
    GridLocation.NORTH,
    GridLocation.NORTHEAST,
    GridLocation.EAST,
    GridLocation.SOUTHEAST,
    GridLocation.SOUTH,
    GridLocation.SOUTHWEST,
    GridLocation.WEST,
    GridLocation.NORTHWEST,
  ];

  const indexA = order.indexOf(a);
  const indexB = order.indexOf(b);

  let distance = Math.abs(indexA - indexB);
  if (distance > 4) distance = 8 - distance;

  return distance;
}

/**
 * Check if detected quadrant is correct or adjacent (within tolerance)
 */
export function isQuadrantCorrect(
  detected: GridLocation,
  expected: GridLocation,
  tolerance: number = 0
): boolean {
  return quadrantDistance(detected, expected) <= tolerance;
}
