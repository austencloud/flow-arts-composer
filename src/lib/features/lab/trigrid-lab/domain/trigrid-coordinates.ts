/**
 * Trigrid Coordinate System
 *
 * All vertex positions computed trigonometrically for the equilateral triangle grid.
 * 950x950 SVG space, center at (475, 475).
 *
 * Four modes - one for each direction the apex can point:
 *   Upright:  apex N,  base SE + SW
 *   Inverted: apex S,  base NE + NW
 *   Right:    apex E,  base SW + NW
 *   Left:     apex W,  base NE + SE
 *
 * The 6-point "skewed" trigrid overlays two opposing modes
 * (upright+inverted or left+right) to produce 6 vertices at 60° intervals.
 */

import { GridLocation } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import type { Point, TriGridMode } from "./trigrid-types";
import {
  TRIGRID_CENTER_X,
  TRIGRID_CENTER_Y,
  TRIGRID_HAND_POINT_RADIUS,
  TRIGRID_OUTER_MARKER_RADIUS,
} from "./trigrid-constants";

/**
 * Compute a point at a given angle and radius from center.
 * Angle 0 = top (north), increasing clockwise.
 */
function pointAtAngle(angleDeg: number, radius: number): Point {
  const angleRad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: Math.round((TRIGRID_CENTER_X + radius * Math.cos(angleRad)) * 10) / 10,
    y: Math.round((TRIGRID_CENTER_Y + radius * Math.sin(angleRad)) * 10) / 10,
  };
}

/**
 * Angular positions for the 3 vertices in each mode.
 * Measured from north (top = 0°), increasing clockwise.
 *
 * Each mode is a 120° rotation of the triangle:
 *   Upright:  0°, 120°, 240°
 *   Right:   90°, 210°, 330°  (rotated 90° CW from upright)
 *   Inverted: 180°, 300°, 60° (rotated 180° from upright)
 *   Left:    270°, 30°, 150°  (rotated 270° CW from upright)
 */
const MODE_ANGLES: Record<string, Record<string, number>> = {
  upright: {
    [GridLocation.NORTH]: 0,
    [GridLocation.SOUTHEAST]: 120,
    [GridLocation.SOUTHWEST]: 240,
  },
  inverted: {
    [GridLocation.SOUTH]: 180,
    [GridLocation.NORTHEAST]: 60,
    [GridLocation.NORTHWEST]: 300,
  },
  right: {
    [GridLocation.EAST]: 90,
    [GridLocation.SOUTHWEST]: 210,
    [GridLocation.NORTHWEST]: 330,
  },
  left: {
    [GridLocation.WEST]: 270,
    [GridLocation.NORTHEAST]: 30,
    [GridLocation.SOUTHEAST]: 150,
  },
};

/** Get the 3 grid locations used in a given mode */
export function getTriGridLocations(mode: TriGridMode): GridLocation[] {
  const angles = MODE_ANGLES[mode];
  if (!angles) {
    throw new Error(`Unknown trigrid mode: "${mode}"`);
  }
  return Object.keys(angles) as GridLocation[];
}

/** Get the angular position (degrees from north, CW) for a grid location in the given mode */
export function getLocationAngle(location: GridLocation, mode: TriGridMode): number {
  const angles = MODE_ANGLES[mode];
  if (!angles) {
    throw new Error(`Unknown trigrid mode: "${mode}"`);
  }
  const angle = angles[location];
  if (angle === undefined) {
    throw new Error(`Location ${location} is not valid for trigrid mode "${mode}"`);
  }
  return angle;
}

/** Get hand point coordinates for a grid location */
export function getHandPoint(location: GridLocation, mode: TriGridMode): Point {
  const angle = getLocationAngle(location, mode);
  return pointAtAngle(angle, TRIGRID_HAND_POINT_RADIUS);
}

/** Get outer marker coordinates for a grid location */
export function getOuterMarker(location: GridLocation, mode: TriGridMode): Point {
  const angle = getLocationAngle(location, mode);
  return pointAtAngle(angle, TRIGRID_OUTER_MARKER_RADIUS);
}

/** Get all hand points as a Map */
export function getAllHandPoints(mode: TriGridMode): Map<GridLocation, Point> {
  const locations = getTriGridLocations(mode);
  const result = new Map<GridLocation, Point>();
  for (const loc of locations) {
    result.set(loc, getHandPoint(loc, mode));
  }
  return result;
}

/** Get all outer markers as a Map */
export function getAllOuterMarkers(mode: TriGridMode): Map<GridLocation, Point> {
  const locations = getTriGridLocations(mode);
  const result = new Map<GridLocation, Point>();
  for (const loc of locations) {
    result.set(loc, getOuterMarker(loc, mode));
  }
  return result;
}

/** Get the edge midpoint between two vertices (for edge labels) */
export function getEdgeMidpoint(a: GridLocation, b: GridLocation, mode: TriGridMode): Point {
  const pa = getHandPoint(a, mode);
  const pb = getHandPoint(b, mode);
  return {
    x: Math.round(((pa.x + pb.x) / 2) * 10) / 10,
    y: Math.round(((pa.y + pb.y) / 2) * 10) / 10,
  };
}

/** Get the center point */
export function getCenter(): Point {
  return { x: TRIGRID_CENTER_X, y: TRIGRID_CENTER_Y };
}

/**
 * Get adjacent vertices in CW and CCW order.
 * On a 3-point grid, each vertex has exactly 2 neighbors.
 */
export function getAdjacentVertices(
  location: GridLocation,
  mode: TriGridMode,
): { cw: GridLocation; ccw: GridLocation } {
  const locations = getTriGridLocations(mode);
  const idx = locations.indexOf(location);
  if (idx === -1) {
    throw new Error(`Location ${location} not found in trigrid mode "${mode}"`);
  }
  const cwIdx = (idx + 1) % 3;
  const ccwIdx = (idx + 2) % 3;
  return {
    cw: locations[cwIdx]!,
    ccw: locations[ccwIdx]!,
  };
}
