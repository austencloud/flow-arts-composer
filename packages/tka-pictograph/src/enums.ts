/**
 * Core enums for TKA pictograph rendering
 * Ported from src/lib/shared/pictograph for Node.js usage
 */

// Grid locations (8 compass points)
export enum GridLocation {
  NORTH = "n",
  EAST = "e",
  SOUTH = "s",
  WEST = "w",
  NORTHEAST = "ne",
  SOUTHEAST = "se",
  SOUTHWEST = "sw",
  NORTHWEST = "nw",
}

// Grid rendering modes
export enum GridMode {
  DIAMOND = "diamond",
  BOX = "box",
  SKEWED = "skewed",
}

// Motion types
export enum MotionType {
  STATIC = "static",
  PRO = "pro",
  ANTI = "anti",
  DASH = "dash",
  FLOAT = "float",
}

// Prop orientations
export enum Orientation {
  IN = "in",
  OUT = "out",
  CLOCK = "clock",
  COUNTER = "counter",
  // Interradial orientations (Level 6)
  CLOCK_IN = "clock_in",
  CLOCK_OUT = "clock_out",
  COUNTER_IN = "counter_in",
  COUNTER_OUT = "counter_out",
}

// Rotation directions
export enum RotationDirection {
  CW = "cw",
  CCW = "ccw",
  NO_ROTATION = "no_rot",
}

// Prop colors

// Cardinal and intercardinal location sets for quick lookup
export const CARDINAL_LOCATIONS = new Set([
  GridLocation.NORTH,
  GridLocation.EAST,
  GridLocation.SOUTH,
  GridLocation.WEST,
]);

export const INTERCARDINAL_LOCATIONS = new Set([
  GridLocation.NORTHEAST,
  GridLocation.SOUTHEAST,
  GridLocation.SOUTHWEST,
  GridLocation.NORTHWEST,
]);
