/**
 * Grid position calculations
 *
 * Functions for looking up hand point and layer2 point coordinates
 * based on location and grid mode.
 */

import type { Coordinates, GridLocation, GridMode } from "../types.js";
import { isCardinal } from "../types.js";
import {
  DIAMOND_HAND_POINTS,
  DIAMOND_LAYER2_POINTS,
  BOX_HAND_POINTS,
  BOX_LAYER2_POINTS,
  FALLBACK_HAND_POINTS,
  FALLBACK_LAYER2_POINTS,
  CENTER_POINT,
} from "../constants/grid-coordinates.js";

// Matches the app's DefaultPropPositioner normal hand-point set. Strict points
// remain the default for legacy placement and arrow calibration.
const DIAMOND_NORMAL_HAND_POINTS: Partial<Record<GridLocation, Coordinates>> = {
  n: { x: 475, y: 331.9 },
  e: { x: 618.1, y: 475 },
  s: { x: 475, y: 618.1 },
  w: { x: 331.9, y: 475 },
  c: CENTER_POINT,
};

const BOX_NORMAL_HAND_POINTS: Partial<Record<GridLocation, Coordinates>> = {
  ne: { x: 576.2, y: 373.8 },
  se: { x: 576.2, y: 576.2 },
  sw: { x: 373.8, y: 576.2 },
  nw: { x: 373.8, y: 373.8 },
  c: CENTER_POINT,
};

/** App-compatible non-strict hand points for prop placement. */
export function getNormalHandPointCoordinates(
  location: GridLocation | string,
  gridMode: GridMode
): Coordinates {
  const normalizedLocation = location.toLowerCase() as GridLocation;
  const points =
    gridMode === "skewed"
      ? isCardinal(normalizedLocation)
        ? DIAMOND_NORMAL_HAND_POINTS
        : BOX_NORMAL_HAND_POINTS
      : gridMode === "diamond"
        ? DIAMOND_NORMAL_HAND_POINTS
        : BOX_NORMAL_HAND_POINTS;
  return points[normalizedLocation] ?? CENTER_POINT;
}

/**
 * This is the core function for prop positioning.
 */
export function getHandPointCoordinates(
  location: GridLocation | string,
  gridMode: GridMode
): Coordinates {
  const normalizedLocation = location.toLowerCase() as GridLocation;

  // For SKEWED mode, determine grid type based on location
  if (gridMode === "skewed") {
    if (isCardinal(normalizedLocation)) {
      // Cardinal locations use diamond hand points
      const point = DIAMOND_HAND_POINTS[normalizedLocation];
      if (point) return point;
    } else {
      // Intercardinal locations use box hand points
      const point = BOX_HAND_POINTS[normalizedLocation];
      if (point) return point;
    }
    return FALLBACK_HAND_POINTS[normalizedLocation] ?? CENTER_POINT;
  }

  // DIAMOND mode
  if (gridMode === "diamond") {
    const point = DIAMOND_HAND_POINTS[normalizedLocation];
    if (point) return point;
    return FALLBACK_HAND_POINTS[normalizedLocation] ?? CENTER_POINT;
  }

  // BOX mode
  if (gridMode === "box") {
    const point = BOX_HAND_POINTS[normalizedLocation];
    if (point) return point;
    return FALLBACK_HAND_POINTS[normalizedLocation] ?? CENTER_POINT;
  }

  // Default fallback
  return FALLBACK_HAND_POINTS[normalizedLocation] ?? CENTER_POINT;
}

/**
 * Used for arrow positioning.
 */
export function getLayer2PointCoordinates(
  location: GridLocation | string,
  gridMode: GridMode
): Coordinates {
  const normalizedLocation = location.toLowerCase() as GridLocation;

  // For SKEWED mode, determine grid type based on location
  if (gridMode === "skewed") {
    if (isCardinal(normalizedLocation)) {
      // Cardinal locations use diamond layer2 (but diamond layer2 is for intercardinals)
      // Actually in skewed, cardinals use box layer2 points
      const point = BOX_LAYER2_POINTS[normalizedLocation];
      if (point) return point;
    } else {
      // Intercardinal locations use diamond layer2 points
      const point = DIAMOND_LAYER2_POINTS[normalizedLocation];
      if (point) return point;
    }
    return (
      FALLBACK_LAYER2_POINTS[normalizedLocation] ??
      getHandPointCoordinates(location, gridMode)
    );
  }

  // DIAMOND mode - layer2 points are at intercardinal positions
  if (gridMode === "diamond") {
    const point = DIAMOND_LAYER2_POINTS[normalizedLocation];
    if (point) return point;
    // If not an intercardinal, try box layer2 (which has cardinals)
    const boxPoint = BOX_LAYER2_POINTS[normalizedLocation];
    if (boxPoint) return boxPoint;
    return (
      FALLBACK_LAYER2_POINTS[normalizedLocation] ??
      getHandPointCoordinates(location, gridMode)
    );
  }

  // BOX mode - layer2 points are at cardinal positions
  if (gridMode === "box") {
    const point = BOX_LAYER2_POINTS[normalizedLocation];
    if (point) return point;
    // If not a cardinal, try diamond layer2 (which has intercardinals)
    const diamondPoint = DIAMOND_LAYER2_POINTS[normalizedLocation];
    if (diamondPoint) return diamondPoint;
    return (
      FALLBACK_LAYER2_POINTS[normalizedLocation] ??
      getHandPointCoordinates(location, gridMode)
    );
  }

  // Default fallback
  return (
    FALLBACK_LAYER2_POINTS[normalizedLocation] ??
    getHandPointCoordinates(location, gridMode)
  );
}
