/**
 * Prop placement calculations
 *
 * Calculates prop position (x, y) and rotation angle based on
 * grid location, orientation, and grid mode.
 */

import type { Coordinates, GridLocation, GridMode, Orientation, PropPlacement } from "../types.js";
import { isCardinal } from "../types.js";
import { getHandPointCoordinates } from "./grid-placement.js";
import { DIAMOND_PROP_ANGLES, BOX_PROP_ANGLES } from "../constants/rotation-maps.js";

function getAngleMapForLocation(
  location: GridLocation,
  gridMode: GridMode
): Record<Orientation, Record<GridLocation, number>> {
  if (gridMode === "diamond") {
    return DIAMOND_PROP_ANGLES;
  }
  if (gridMode === "skewed") {
    // In skewed mode, use diamond angles for cardinal, box for intercardinal
    return isCardinal(location) ? DIAMOND_PROP_ANGLES : BOX_PROP_ANGLES;
  }
  // BOX mode or default
  return BOX_PROP_ANGLES;
}

export function calculatePropRotation(
  location: GridLocation | string,
  orientation: Orientation | string,
  gridMode: GridMode
): number {
  const normalizedLocation = location.toLowerCase() as GridLocation;
  const normalizedOrientation = orientation.toLowerCase() as Orientation;

  const angleMap = getAngleMapForLocation(normalizedLocation, gridMode);
  const orientationAngles = angleMap[normalizedOrientation];

  if (!orientationAngles) {
    console.warn(`Unknown orientation: ${normalizedOrientation}`);
    return 0;
  }

  return orientationAngles[normalizedLocation] ?? 0;
}

export function calculatePropPosition(
  location: GridLocation | string,
  gridMode: GridMode
): Coordinates {
  return getHandPointCoordinates(location, gridMode);
}

export function calculatePropPlacement(
  location: GridLocation | string,
  orientation: Orientation | string,
  gridMode: GridMode
): PropPlacement {
  const position = calculatePropPosition(location, gridMode);
  const rotation = calculatePropRotation(location, orientation, gridMode);

  return {
    x: position.x,
    y: position.y,
    rotation,
  };
}
