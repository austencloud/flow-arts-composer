/**
 * Grid Geometry - Resolves grid:location pairs to world coordinates
 *
 * Pure functions: no state, no side effects.
 */

import type { GridLocation, GridMode } from "#lib/shared/render/core/types.js";
import type { Vec2, GridPlacement } from "../domain/models/grid-topology";
import {
  LOCATION_OFFSETS,
  HAND_POINT_LOCATIONS,
  PERIMETER_LOCATIONS,
} from "../domain/constants/grid-mode-offsets";

export function getLocationOffset(location: GridLocation): Vec2 {
  return LOCATION_OFFSETS[location];
}

export function resolveWorldPoint(grid: GridPlacement, location: GridLocation): Vec2 {
  const offset = LOCATION_OFFSETS[location];
  return {
    x: grid.center.x + offset.x * grid.radius,
    y: grid.center.y + offset.y * grid.radius,
  };
}

export function getLocationsForMode(mode: string): readonly GridLocation[] {
  const handPoints = HAND_POINT_LOCATIONS[mode as GridMode];
  if (handPoints) return handPoints;

  return [...PERIMETER_LOCATIONS, "c" as GridLocation];
}
