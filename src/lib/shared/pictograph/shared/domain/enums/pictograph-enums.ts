/**
 * Core Domain Enums
 *
 * All enumeration types used throughout the TKA domain models.
 * Centralized location for type-safe constants and values.
 * Based on modern desktop app's enums.py
 */

export enum Timing {
  TOG = "tog",
  SPLIT = "split",
  QUARTER = "quarter",
  NONE = "none",
}

export enum Direction {
  SAME = "same",
  OPP = "opp",
  NONE = "none",
}

export const MotionType = {
  PRO: "pro",
  ANTI: "anti",
  FLOAT: "float",
  DASH: "dash",
  STATIC: "static",
} as const;

export type MotionType = (typeof MotionType)[keyof typeof MotionType];

export const HandMotionType = {
  SHIFT: "shift",
  DASH: "dash",
  STATIC: "static",
  HASH_IN: "hashIn", // Perimeter → center
  HASH_OUT: "hashOut", // Center → perimeter
} as const;

export type HandMotionType =
  (typeof HandMotionType)[keyof typeof HandMotionType];

export enum HandPath {
  CLOCKWISE = "cw",
  COUNTER_CLOCKWISE = "ccw",
  DASH = "dash",
  STATIC = "static",
  // Hash (dash-): shortened dash to/from center. Same geometry and rotation rules as dash.
  HASH_IN = "hashIn", // perimeter → center
  HASH_OUT = "hashOut", // center → perimeter
}

/**
 * Path length modifier for shifts and dashes.
 *
 * For shifts (L5+): modifies arc length on 8-point grid.
 *   - PLUS (skew+): Extended arc (e.g., S to NE, spanning 3 segments)
 *   - MINUS (skew-): Shortened arc (less than one standard segment)
 *
 * For dashes: modifies straight-line distance.
 *   - MINUS (dash-, L6): Shortened to center = hash, so it needs the center point
 *   - PLUS (dash+, L7): Extended to cross-grid destination, so it needs a second grid
 *
 * Displayed per-hand in the turns column of the TKA glyph.
 */
export enum SkewDirection {
  PLUS = "+",
  MINUS = "-",
}

import {
  HandSide as CanonicalHandSide,
  type HandSide as CanonicalHandSideValue,
} from "@tka/tka-types";

export const HandSide = CanonicalHandSide;
export type HandSide = CanonicalHandSideValue;

export const RotationDirection = {
  CLOCKWISE: "cw",
  COUNTER_CLOCKWISE: "ccw",
  NO_ROTATION: "noRotation",
} as const;

export type RotationDirection =
  (typeof RotationDirection)[keyof typeof RotationDirection];

/**
 * Orientation describes the direction a prop points relative to the center.
 *
 * Cardinal orientations (Level 1-5):
 * - IN: Points toward center
 * - OUT: Points away from center
 * - CLOCK: Perpendicular, 90° clockwise from radial
 * - COUNTER: Perpendicular, 90° counter-clockwise from radial
 *
 * Interradial orientations (Level 4 - 45° between cardinal orientations):
 * - CLOCK_IN: Between CLOCK and IN (gravity at NE)
 * - CLOCK_OUT: Between CLOCK and OUT (gravity at SE)
 * - COUNTER_IN: Between COUNTER and IN (gravity at NW)
 * - COUNTER_OUT: Between COUNTER and OUT (gravity at SW)
 */
export const Orientation = {
  // Cardinal orientations (radial - relative to center)
  IN: "in",
  OUT: "out",
  // Non-radial orientations (Level 3)
  CLOCK: "clock",
  COUNTER: "counter",
  // Centric orientations (Level 6 - prop at center, points toward compass direction)
  CENTER_N: "centerN",
  CENTER_NE: "centerNE",
  CENTER_E: "centerE",
  CENTER_SE: "centerSE",
  CENTER_S: "centerS",
  CENTER_SW: "centerSW",
  CENTER_W: "centerW",
  CENTER_NW: "centerNW",
  // Interradial orientations (Level 4)
  CLOCK_IN: "clockIn",
  CLOCK_OUT: "clockOut",
  COUNTER_IN: "counterIn",
  COUNTER_OUT: "counterOut",
} as const;

export type Orientation = (typeof Orientation)[keyof typeof Orientation];

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

export enum TnDMode {
  SPLIT_SAME = "SS",
  SPLIT_OPP = "SO",
  TOG_SAME = "TS",
  TOG_OPP = "TO",
  QUARTER_SAME = "QS",
  QUARTER_OPP = "QO",
}

export enum ElementalType {
  WATER = "water",
  FIRE = "fire",
  EARTH = "earth",
  AIR = "air",
  SUN = "sun",
  MOON = "moon",
}

const ELEMENT_IMAGE_FILE: Record<ElementalType, string> = {
  [ElementalType.WATER]: "norm/water",
  [ElementalType.FIRE]: "norm/fire",
  [ElementalType.EARTH]: "norm/earth",
  [ElementalType.AIR]: "norm/air",
  [ElementalType.SUN]: "norm/sun",
  [ElementalType.MOON]: "norm/moon",
};

// The normalized set (trimmed, perceptually sized, centered in a square with
// the family code baked into the art) is the one source for every surface;
// the shape matrix's TND_ELEMENTS points at the same art. Live render serves
// the WebP variants (~28-60 KB each vs 270-450 KB PNGs) because they are
// SW-precached for offline. The print/card pipeline
// (choreo-card/domain/tnd-element.ts) intentionally keeps the lossless PNGs.
// Renaming a file here means updating ELEMENT_FILES in
// scripts/generate-svg-precache-manifest.cjs too.
export function getElementImagePath(element: ElementalType | string): string {
  const filename = ELEMENT_IMAGE_FILE[element as ElementalType] ?? element;
  return `/images/elements/${filename}.webp`;
}

export enum GlyphType {
  TKA = "tka",
  REVERSALS = "reversals",
  TnD = "tnd",
  ELEMENTAL = "elemental",
  POSITIONS = "positions",
}
