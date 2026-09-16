/**
 * Beta Offset Calculator for Standalone Renderer
 *
 * When two props end at the same location (a "beta" placement),
 * they need to be offset from each other so they don't overlap.
 * The direction of offset depends on:
 * - The location (N/S/E/W vs NE/SE/SW/NW)
 * - The orientation type (radial IN/OUT vs non-radial CLOCK/COUNTER)
 * - The performer hand
 * - For shift motions, the start->end transition
 *
 * Ported from src/lib/shared/pictograph/prop/domain/direction/DirectionMaps.ts
 */

import { GridLocation, GridMode, Orientation } from "./enums.js";
import type { HandSide } from "@tka/tka-types";

// Vector directions for offset calculation
export enum VectorDirection {
  UP = "up",
  DOWN = "down",
  LEFT = "left",
  RIGHT = "right",
  UPRIGHT = "upright",
  DOWNRIGHT = "downright",
  UPLEFT = "upleft",
  DOWNLEFT = "downleft",
}

// Motion input for beta calculation
export interface BetaMotionInput {
  startLocation: string;
  endLocation: string;
  endOrientation?: string;
  motionType: string;
  hand: HandSide;
  propType?: string;
}

export interface BetaOffsetInput {
  leftMotion: BetaMotionInput;
  rightMotion: BetaMotionInput;
  letter: string;
  gridMode: GridMode;
}

// Default offset distance in pixels (for staff prop type in diamond mode)
const BETA_OFFSET_DISTANCE_DIAMOND = 21.11;
const BETA_OFFSET_DISTANCE_BOX = 14.93;

// Hand-specific offset distance
// Matches getBetaOffsetSize() from PropClassification.ts: 950/45 = 21.11px
const HAND_BETA_OFFSET_DISTANCE_DIAMOND = 950 / 45;  // ~21.11px
const HAND_BETA_OFFSET_DISTANCE_BOX = (950 / 45) / Math.sqrt(2);  // ~14.93px


type HandMap = Record<HandSide, VectorDirection>;

/**
 * Diamond grid (N/S/E/W) - radial orientation (IN/OUT)
 * Props at cardinal locations with radial orientations
 */
const DIAMOND_RADIAL_MAP: Record<string, HandMap> = {
  [GridLocation.NORTH]: { right: VectorDirection.RIGHT, left: VectorDirection.LEFT },
  [GridLocation.EAST]: { right: VectorDirection.DOWN, left: VectorDirection.UP },
  [GridLocation.SOUTH]: { right: VectorDirection.LEFT, left: VectorDirection.RIGHT },
  [GridLocation.WEST]: { right: VectorDirection.UP, left: VectorDirection.DOWN },
};

/**
 * Diamond grid (N/S/E/W) - non-radial orientation (CLOCK/COUNTER)
 */
const DIAMOND_NON_RADIAL_MAP: Record<string, HandMap> = {
  [GridLocation.NORTH]: { right: VectorDirection.UP, left: VectorDirection.DOWN },
  [GridLocation.EAST]: { right: VectorDirection.RIGHT, left: VectorDirection.LEFT },
  [GridLocation.SOUTH]: { right: VectorDirection.DOWN, left: VectorDirection.UP },
  [GridLocation.WEST]: { right: VectorDirection.LEFT, left: VectorDirection.RIGHT },
};

/**
 * Box grid (NE/SE/SW/NW) - radial orientation
 */
const BOX_RADIAL_MAP: Record<string, HandMap> = {
  [GridLocation.NORTHEAST]: { right: VectorDirection.DOWNRIGHT, left: VectorDirection.UPLEFT },
  [GridLocation.SOUTHEAST]: { right: VectorDirection.UPRIGHT, left: VectorDirection.DOWNLEFT },
  [GridLocation.SOUTHWEST]: { right: VectorDirection.DOWNRIGHT, left: VectorDirection.UPLEFT },
  [GridLocation.NORTHWEST]: { right: VectorDirection.UPRIGHT, left: VectorDirection.DOWNLEFT },
};

/**
 * Box grid (NE/SE/SW/NW) - non-radial orientation
 */
// CCW 90° rotation of BOX_RADIAL_MAP — non-radial staff lies perpendicular to
// the radial axis, so props nest along the radial axis.
const BOX_NON_RADIAL_MAP: Record<string, HandMap> = {
  [GridLocation.NORTHEAST]: { right: VectorDirection.UPRIGHT, left: VectorDirection.DOWNLEFT },
  [GridLocation.SOUTHEAST]: { right: VectorDirection.UPLEFT, left: VectorDirection.DOWNRIGHT },
  [GridLocation.SOUTHWEST]: { right: VectorDirection.UPRIGHT, left: VectorDirection.DOWNLEFT },
  [GridLocation.NORTHWEST]: { right: VectorDirection.UPLEFT, left: VectorDirection.DOWNRIGHT },
};

/**
 * Shift motion transitions - radial orientation
 * Maps [startLocation][endLocation] -> direction
 */
const SHIFT_RADIAL_MAP: Record<string, Record<string, VectorDirection>> = {
  [GridLocation.EAST]: {
    [GridLocation.NORTH]: VectorDirection.RIGHT,
    [GridLocation.SOUTH]: VectorDirection.RIGHT,
  },
  [GridLocation.WEST]: {
    [GridLocation.NORTH]: VectorDirection.LEFT,
    [GridLocation.SOUTH]: VectorDirection.LEFT,
  },
  [GridLocation.NORTH]: {
    [GridLocation.EAST]: VectorDirection.UP,
    [GridLocation.WEST]: VectorDirection.UP,
  },
  [GridLocation.SOUTH]: {
    [GridLocation.EAST]: VectorDirection.DOWN,
    [GridLocation.WEST]: VectorDirection.DOWN,
  },
  [GridLocation.NORTHEAST]: {
    [GridLocation.NORTHWEST]: VectorDirection.UPRIGHT,
    [GridLocation.SOUTHEAST]: VectorDirection.UPRIGHT,
  },
  [GridLocation.SOUTHEAST]: {
    [GridLocation.NORTHEAST]: VectorDirection.DOWNRIGHT,
    [GridLocation.SOUTHWEST]: VectorDirection.DOWNRIGHT,
  },
  [GridLocation.SOUTHWEST]: {
    [GridLocation.NORTHWEST]: VectorDirection.DOWNLEFT,
    [GridLocation.SOUTHEAST]: VectorDirection.DOWNLEFT,
  },
  [GridLocation.NORTHWEST]: {
    [GridLocation.NORTHEAST]: VectorDirection.UPLEFT,
    [GridLocation.SOUTHWEST]: VectorDirection.UPLEFT,
  },
};

/**
 * Shift motion transitions - non-radial orientation
 */
const SHIFT_NON_RADIAL_MAP: Record<string, Record<string, VectorDirection>> = {
  [GridLocation.EAST]: {
    [GridLocation.NORTH]: VectorDirection.UP,
    [GridLocation.SOUTH]: VectorDirection.UP,
  },
  [GridLocation.WEST]: {
    [GridLocation.NORTH]: VectorDirection.DOWN,
    [GridLocation.SOUTH]: VectorDirection.DOWN,
  },
  [GridLocation.NORTH]: {
    [GridLocation.EAST]: VectorDirection.RIGHT,
    [GridLocation.WEST]: VectorDirection.RIGHT,
  },
  [GridLocation.SOUTH]: {
    [GridLocation.EAST]: VectorDirection.LEFT,
    [GridLocation.WEST]: VectorDirection.LEFT,
  },
  [GridLocation.NORTHEAST]: {
    [GridLocation.SOUTHEAST]: VectorDirection.UPLEFT,
    [GridLocation.NORTHWEST]: VectorDirection.DOWNRIGHT,
  },
  [GridLocation.SOUTHEAST]: {
    [GridLocation.NORTHEAST]: VectorDirection.DOWNLEFT,
    [GridLocation.SOUTHWEST]: VectorDirection.UPRIGHT,
  },
  [GridLocation.SOUTHWEST]: {
    [GridLocation.NORTHWEST]: VectorDirection.UPRIGHT,
    [GridLocation.SOUTHEAST]: VectorDirection.DOWNLEFT,
  },
  [GridLocation.NORTHWEST]: {
    [GridLocation.NORTHEAST]: VectorDirection.DOWNRIGHT,
    [GridLocation.SOUTHWEST]: VectorDirection.UPLEFT,
  },
};


/**
 * Opposite direction lookup table
 */
const OPPOSITE_DIRECTIONS: Record<VectorDirection, VectorDirection> = {
  [VectorDirection.UP]: VectorDirection.DOWN,
  [VectorDirection.DOWN]: VectorDirection.UP,
  [VectorDirection.LEFT]: VectorDirection.RIGHT,
  [VectorDirection.RIGHT]: VectorDirection.LEFT,
  [VectorDirection.UPRIGHT]: VectorDirection.DOWNLEFT,
  [VectorDirection.DOWNLEFT]: VectorDirection.UPRIGHT,
  [VectorDirection.UPLEFT]: VectorDirection.DOWNRIGHT,
  [VectorDirection.DOWNRIGHT]: VectorDirection.UPLEFT,
};

function getOppositeDirection(direction: VectorDirection): VectorDirection {
  return OPPOSITE_DIRECTIONS[direction];
}

/**
 * Check if orientation is radial (IN or OUT)
 */
function isRadialOrientation(orientation: string | undefined): boolean {
  if (!orientation) return true; // Default to radial if not specified
  const ori = orientation.toLowerCase();
  return ori === Orientation.IN || ori === Orientation.OUT ||
         ori === "in" || ori === "out";
}

/**
 * Check if both orientations are radial
 */
function areBothRadial(leftOri: string | undefined, rightOri: string | undefined): boolean {
  return isRadialOrientation(leftOri) && isRadialOrientation(rightOri);
}

/**
 * Check if motion is a shift motion (PRO, ANTI, FLOAT)
 */
function isShiftMotion(motionType: string): boolean {
  const type = motionType.toLowerCase();
  return type === "pro" || type === "anti" || type === "float";
}

/**
 * Check if location is a cardinal (diamond) location
 */
function isCardinalLocation(location: string): boolean {
  const loc = location.toLowerCase();
  return loc === "n" || loc === "e" || loc === "s" || loc === "w";
}

/**
 * Convert direction to pixel offset
 */
function directionToOffset(direction: VectorDirection, gridMode: GridMode): { x: number; y: number } {
  const distance = gridMode === GridMode.BOX ? BETA_OFFSET_DISTANCE_BOX : BETA_OFFSET_DISTANCE_DIAMOND;

  switch (direction) {
    case VectorDirection.UP:
      return { x: 0, y: -distance };
    case VectorDirection.DOWN:
      return { x: 0, y: distance };
    case VectorDirection.LEFT:
      return { x: -distance, y: 0 };
    case VectorDirection.RIGHT:
      return { x: distance, y: 0 };
    case VectorDirection.UPRIGHT:
      return { x: distance, y: -distance };
    case VectorDirection.DOWNRIGHT:
      return { x: distance, y: distance };
    case VectorDirection.UPLEFT:
      return { x: -distance, y: -distance };
    case VectorDirection.DOWNLEFT:
      return { x: -distance, y: distance };
    default:
      return { x: 0, y: 0 };
  }
}

/**
 * Normalize location to lowercase enum value
 */
function normalizeLocation(loc: string): string {
  return loc.toLowerCase();
}


/**
 * Calculate beta offset for a single motion
 * Returns { x, y } pixel offset to apply to prop position
 */
export function calculateBetaOffset(
  input: BetaOffsetInput,
  targetMotion: BetaMotionInput
): { x: number; y: number } {
  const { leftMotion, rightMotion, letter, gridMode } = input;

  // Check if both props end at the same location (beta placement)
  const leftEndLoc = normalizeLocation(leftMotion.endLocation);
  const rightEndLoc = normalizeLocation(rightMotion.endLocation);

  if (leftEndLoc !== rightEndLoc) {
    // Props don't overlap, no offset needed
    return { x: 0, y: 0 };
  }

  // SPECIAL CASE: Hand props always use "right hand on right, left hand on left"
  // This matches the behavior in PropPlacer.ts (lines 129-197)
  const bothAreHands = leftMotion.propType === "hand" && rightMotion.propType === "hand";
  if (bothAreHands) {
    const distance = gridMode === GridMode.BOX
      ? HAND_BETA_OFFSET_DISTANCE_BOX
      : HAND_BETA_OFFSET_DISTANCE_DIAMOND;

    // Keep the anatomical hands separated on their corresponding sides.
    if (targetMotion.hand === "left") {
      return { x: -distance, y: 0 };
    } else {
      return { x: distance, y: 0 };
    }
  }

  // Determine if both orientations are radial
  const isRadial = areBothRadial(leftMotion.endOrientation, rightMotion.endOrientation);

  // Get the target motion's end location
  const location = normalizeLocation(targetMotion.endLocation);
  const hand = targetMotion.hand;

  // Check for letter-specific handling (Y/Z have special logic)
  if (letter === "Y" || letter === "Z" || letter === "Y-" || letter === "Z-") {
    // Y/Z letters: shift motion gets calculated direction, non-shift gets OPPOSITE
    return calculateYZBetaOffset(input, targetMotion, isRadial, gridMode);
  }

  // Check if this is a shift motion (PRO/ANTI/FLOAT)
  if (isShiftMotion(targetMotion.motionType)) {
    // Letter G/H have special handling
    if (letter === "G" || letter === "H") {
      return calculateShiftBetaOffset(targetMotion, isRadial, gridMode);
    }
    // Letter I has its own maps but we'll use shift maps
    if (letter === "I") {
      return calculateShiftBetaOffset(targetMotion, isRadial, gridMode);
    }
    return calculateShiftBetaOffset(targetMotion, isRadial, gridMode);
  }

  // Static or Dash motion - use location-based maps
  return calculateStaticDashBetaOffset(location, hand, isRadial, gridMode);
}

/**
 * Calculate beta offset for static/dash motions
 */
function calculateStaticDashBetaOffset(
  location: string,
  hand: HandSide,
  isRadial: boolean,
  gridMode: GridMode
): { x: number; y: number } {
  // Determine if this is a cardinal (diamond) or intercardinal (box) location
  const isDiamond = isCardinalLocation(location);

  // Select the appropriate direction map
  let map: Record<string, HandMap>;
  if (isDiamond) {
    map = isRadial ? DIAMOND_RADIAL_MAP : DIAMOND_NON_RADIAL_MAP;
  } else {
    map = isRadial ? BOX_RADIAL_MAP : BOX_NON_RADIAL_MAP;
  }

  // Look up the direction for this location and performer hand.
  const locationMap = map[location];
  if (!locationMap) {
    // Location not found in map, no offset
    return { x: 0, y: 0 };
  }

  const direction = locationMap[hand];
  if (!direction) {
    return { x: 0, y: 0 };
  }

  // Convert direction to pixel offset
  return directionToOffset(direction, gridMode);
}

/**
 * Calculate beta offset for shift motions (PRO/ANTI/FLOAT)
 */
function calculateShiftBetaOffset(
  motion: BetaMotionInput,
  isRadial: boolean,
  gridMode: GridMode
): { x: number; y: number } {
  const startLoc = normalizeLocation(motion.startLocation);
  const endLoc = normalizeLocation(motion.endLocation);

  // Select the appropriate shift map
  const map = isRadial ? SHIFT_RADIAL_MAP : SHIFT_NON_RADIAL_MAP;

  // Look up direction based on start->end transition
  const startMap = map[startLoc];
  if (!startMap) {
    // Fall back to static/dash calculation
    return calculateStaticDashBetaOffset(endLoc, motion.hand, isRadial, gridMode);
  }

  const direction = startMap[endLoc];
  if (!direction) {
    // Fall back to static/dash calculation
    return calculateStaticDashBetaOffset(endLoc, motion.hand, isRadial, gridMode);
  }

  return directionToOffset(direction, gridMode);
}

/**
 * Calculate beta offset for Y/Z letters.
 *
 * Y/Z letters combine a shift motion with a static/dash motion.
 * The shift motion gets its calculated direction, the non-shift motion
 * gets the OPPOSITE direction.
 */
function calculateYZBetaOffset(
  input: BetaOffsetInput,
  targetMotion: BetaMotionInput,
  isRadial: boolean,
  gridMode: GridMode
): { x: number; y: number } {
  const { leftMotion, rightMotion } = input;

  // Identify which motion is shift (PRO/ANTI/FLOAT) vs non-shift (STATIC/DASH)
  const rightIsShift = isShiftMotion(rightMotion.motionType);
  const leftIsShift = isShiftMotion(leftMotion.motionType);

  const shiftMotion = rightIsShift ? rightMotion : leftIsShift ? leftMotion : null;

  if (!shiftMotion) {
    // Neither is a shift motion - fall back to static/dash calculation
    const location = normalizeLocation(targetMotion.endLocation);
    return calculateStaticDashBetaOffset(location, targetMotion.hand, isRadial, gridMode);
  }

  // Calculate direction from the SHIFT motion (not the target motion)
  const startLoc = normalizeLocation(shiftMotion.startLocation);
  const endLoc = normalizeLocation(shiftMotion.endLocation);
  const map = isRadial ? SHIFT_RADIAL_MAP : SHIFT_NON_RADIAL_MAP;

  const startMap = map[startLoc];
  if (!startMap) {
    // Fall back
    const location = normalizeLocation(targetMotion.endLocation);
    return calculateStaticDashBetaOffset(location, targetMotion.hand, isRadial, gridMode);
  }

  const shiftDirection = startMap[endLoc];
  if (!shiftDirection) {
    // Fall back
    const location = normalizeLocation(targetMotion.endLocation);
    return calculateStaticDashBetaOffset(location, targetMotion.hand, isRadial, gridMode);
  }

  // If target is the shift motion, use the calculated direction
  // If target is the non-shift motion, use the OPPOSITE direction
  const isTargetShiftMotion = targetMotion.hand === shiftMotion.hand;
  const direction = isTargetShiftMotion
    ? shiftDirection
    : getOppositeDirection(shiftDirection);

  return directionToOffset(direction, gridMode);
}
