/**
 * GridModeOffsets - Location offsets per grid mode, normalized to radius=1.0
 *
 * Derived from the canonical pixel coordinates in gridCoordinates.ts:
 * - Grid center: (475, 475) in pixel space
 * - Diamond hand points (strict): 150px from center (e.g., east = (625, 475))
 * - Box hand points (strict): ~150px from center at 45° (e.g., ne = (581.1, 368.9))
 * - Outer points: 300px from center (double the hand point radius)
 *
 * Normalization: divide pixel offset by 150 (the hand point radius) to get radius=1.0 units.
 *
 * For the topology system, "hand points" and "outer points" are the same concept -
 * we just use the strict hand point locations as the canonical grid points.
 * The outer points (at 2x radius) are used only for conjoined junction rendering.
 */

import type { GridLocation, GridMode } from "#lib/shared/render/core/types.js";
import type { Vec2 } from "../models/grid-topology";

// LOCATION OFFSETS (normalized: radius = 1.0)

/**
 * Offset from grid center to each location, in abstract units where radius = 1.0.
 *
 * Diamond mode: hand points at cardinal positions (n/e/s/w)
 * Box mode: hand points at intercardinal positions (ne/se/sw/nw)
 *
 * Both modes share all 9 locations - the distinction is which locations
 * are "hand points" (primary) vs "layer 2 points" (secondary).
 * For topology purposes, all locations are valid placement targets.
 *
 * SVG origin convention: +x = right, +y = down.
 * Cardinal: n=(0,-1), e=(1,0), s=(0,1), w=(-1,0)
 * Intercardinal: at ±cos(45°) ≈ ±0.7071
 */

const INV_SQRT2 = Math.SQRT1_2; // ~0.7071

/** Offsets from center for all 9 grid locations, normalized to radius=1.0 */
export const LOCATION_OFFSETS: Readonly<Record<GridLocation, Vec2>> = {
  n:  { x: 0,         y: -1 },
  e:  { x: 1,         y: 0 },
  s:  { x: 0,         y: 1 },
  w:  { x: -1,        y: 0 },
  ne: { x: INV_SQRT2, y: -INV_SQRT2 },
  se: { x: INV_SQRT2, y: INV_SQRT2 },
  sw: { x: -INV_SQRT2, y: INV_SQRT2 },
  nw: { x: -INV_SQRT2, y: -INV_SQRT2 },
  c:  { x: 0,         y: 0 },
};


/**
 * Which locations are "hand points" (primary positions where hands can be placed)
 * for each grid mode.
 *
 * Diamond: cardinal points (n, e, s, w)
 * Box: intercardinal points (ne, se, sw, nw)
 * Skewed: one of each - determined at runtime, but all 8 perimeter points are valid
 *
 * For topology purposes, all perimeter locations are valid regardless of mode.
 * The mode determines which ones are visually highlighted as hand points.
 */
export const HAND_POINT_LOCATIONS: Readonly<Record<GridMode, readonly GridLocation[]>> = {
  diamond: ["n", "e", "s", "w"],
  box: ["ne", "se", "sw", "nw"],
  skewed: ["n", "e", "s", "w", "ne", "se", "sw", "nw"],
};

/** All 8 perimeter locations (everything except center) */
export const PERIMETER_LOCATIONS: readonly GridLocation[] = [
  "n", "ne", "e", "se", "s", "sw", "w", "nw",
];

/** Clockwise ordering of perimeter locations (for adjacency) */
export const CW_PERIMETER_ORDER: readonly GridLocation[] = [
  "n", "ne", "e", "se", "s", "sw", "w", "nw",
];


/**
 * Outer points sit at 2x the hand point radius from center.
 *
 * In the canonical 950x950 grid:
 * - Hand points (strict): 150px from center
 * - Outer points: 300px from center
 *
 * The conjoined lab's junction model uses outer points for alignment:
 * Grid A's outer east point = Grid B's center. This means grid centers
 * are separated by 2 * radius, not 1 * radius.
 *
 * The TopologyBuilder uses this multiplier when resolving conjoin constraints
 * so that grids are spaced at the correct distance for junction alignment.
 */
export const OUTER_POINT_MULTIPLIER = 2.0;


/**
 * Diametrically opposite location on the 4-point grid.
 * Only defined for perimeter locations.
 */
export const OPPOSITE_LOCATION: Readonly<Partial<Record<GridLocation, GridLocation>>> = {
  n: "s", s: "n", e: "w", w: "e",
  ne: "sw", sw: "ne", se: "nw", nw: "se",
};


/** Pixels per abstract unit in the canonical 950x950 SVG coordinate space */
export const PIXELS_PER_UNIT = 150;

/** Grid center in the canonical 950x950 SVG coordinate space */
export const SVG_CENTER = 475;

/**
 * Convert a grid location offset to SVG pixel coordinates relative to grid center.
 */
export function locationToSvgOffset(location: GridLocation, radius: number = 1.0): Vec2 {
  const offset = LOCATION_OFFSETS[location];
  return {
    x: offset.x * radius * PIXELS_PER_UNIT,
    y: offset.y * radius * PIXELS_PER_UNIT,
  };
}
