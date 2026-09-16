/**
 * Hand Path Motion Calculator
 *
 * Calculates motion types and properties based on grid location movements.
 * Used for tap-based hand path construction where users select locations
 * and the system determines the motion type (STATIC, DASH, or SHIFT).
 */

import {
  GridLocation,
  GridMode,
} from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import {
  HandPath,
  HandMotionType,
  RotationDirection,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";

// Clockwise ordering for diamond mode
const diamondClockwise = [
  GridLocation.NORTH,
  GridLocation.EAST,
  GridLocation.SOUTH,
  GridLocation.WEST,
];

// Clockwise ordering for box mode
const boxClockwise = [
  GridLocation.NORTHEAST,
  GridLocation.SOUTHEAST,
  GridLocation.SOUTHWEST,
  GridLocation.NORTHWEST,
];

// The skewed grid is one eight-point ring, so cardinal and intercardinal
// locations must stay interleaved for adjacency and direction calculations.
const skewedClockwise = [
  GridLocation.NORTH,
  GridLocation.NORTHEAST,
  GridLocation.EAST,
  GridLocation.SOUTHEAST,
  GridLocation.SOUTH,
  GridLocation.SOUTHWEST,
  GridLocation.WEST,
  GridLocation.NORTHWEST,
];

/**
 * Get all valid locations for a grid mode
 */
export function getActiveLocations(gridMode: GridMode): GridLocation[] {
  if (gridMode === GridMode.DIAMOND) {
    return [...diamondClockwise];
  } else if (gridMode === GridMode.BOX) {
    return [...boxClockwise];
  } else if (gridMode === GridMode.SKEWED) {
    return [...skewedClockwise];
  }

  throw new Error(`Unsupported grid mode: ${gridMode}`);
}

/**
 * Calculate the motion type between two grid locations
 */
export function calculateMotionType(
  from: GridLocation,
  to: GridLocation,
  gridMode: GridMode
): HandMotionType {
  // Same location = static
  if (from === to) {
    return HandMotionType.STATIC;
  }

  // Hash motions: one end is center, the other is on the perimeter
  if (from === GridLocation.CENTER) {
    return HandMotionType.HASH_OUT;
  }
  if (to === GridLocation.CENTER) {
    return HandMotionType.HASH_IN;
  }

  const locations = getActiveLocations(gridMode);

  // Validate that both locations are in the active set
  if (!locations.includes(from) || !locations.includes(to)) {
    throw new Error(
      `Invalid locations for ${gridMode} mode: from=${from}, to=${to}`
    );
  }

  const fromIndex = locations.indexOf(from);
  const toIndex = locations.indexOf(to);
  const count = locations.length; // 4 for diamond/box, 8 for skewed

  // Check if adjacent (1 step clockwise or counter-clockwise)
  const isAdjacentCW = (fromIndex + 1) % count === toIndex;
  const isAdjacentCCW = (fromIndex - 1 + count) % count === toIndex;

  if (isAdjacentCW || isAdjacentCCW) {
    return HandMotionType.SHIFT;
  }

  // Opposite location (halfway around the ring)
  const isOpposite = (fromIndex + count / 2) % count === toIndex;
  if (isOpposite) {
    return HandMotionType.DASH;
  }

  // For 8-point grid: non-adjacent, non-opposite = still a shift (just wider arc)
  if (count === 8) {
    return HandMotionType.SHIFT;
  }

  throw new Error(`Unexpected location relationship: from=${from}, to=${to}`);
}

/**
 * Determine the rotation direction for a shift motion
 * Returns null for STATIC and DASH motions
 */
export function calculateRotationDirection(
  from: GridLocation,
  to: GridLocation,
  gridMode: GridMode
): RotationDirection | null {
  const motionType = calculateMotionType(from, to, gridMode);

  // Only SHIFT motions have rotation direction
  if (motionType !== HandMotionType.SHIFT) {
    return null;
  }

  const locations = getActiveLocations(gridMode);
  const fromIndex = locations.indexOf(from);
  const toIndex = locations.indexOf(to);
  const count = locations.length;

  const clockwiseDistance = (toIndex - fromIndex + count) % count;
  const isClockwise = clockwiseDistance < count / 2;

  return isClockwise
    ? RotationDirection.CLOCKWISE
    : RotationDirection.COUNTER_CLOCKWISE;
}

/** Derive the persisted hand-path label from the same ring calculation. */
export function calculateHandPath(
  from: GridLocation,
  to: GridLocation,
  gridMode: GridMode
): HandPath {
  const motionType = calculateMotionType(from, to, gridMode);
  switch (motionType) {
    case HandMotionType.STATIC:
      return HandPath.STATIC;
    case HandMotionType.DASH:
      return HandPath.DASH;
    case HandMotionType.HASH_IN:
      return HandPath.HASH_IN;
    case HandMotionType.HASH_OUT:
      return HandPath.HASH_OUT;
    case HandMotionType.SHIFT:
      return calculateRotationDirection(from, to, gridMode) ===
        RotationDirection.COUNTER_CLOCKWISE
        ? HandPath.COUNTER_CLOCKWISE
        : HandPath.CLOCKWISE;
  }
}

/**
 * Check if a location is valid for the given grid mode
 */
export function isLocationEnabled(
  location: GridLocation,
  gridMode: GridMode
): boolean {
  const activeLocations = getActiveLocations(gridMode);
  return activeLocations.includes(location);
}
