/**
 * Poi Gravity Orientation Deriver
 *
 * Maps grid positions to their "gravity" orientations for poi physics.
 */

import { GridLocation } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import { Orientation } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";

/**
 * Static mapping of grid locations to gravity orientations.
 *
 * At each position, "gravity" (down) maps to a specific orientation:
 * - Cardinal positions use cardinal orientations
 * - Intercardinal positions use interradial (compound) orientations
 */
const GRAVITY_ORIENTATION_MAP: Record<GridLocation, Orientation> = {
  // Cardinal positions
  [GridLocation.NORTH]: Orientation.IN, // Down toward center
  [GridLocation.EAST]: Orientation.CLOCK, // Down is clockwise perpendicular
  [GridLocation.SOUTH]: Orientation.OUT, // Down away from center
  [GridLocation.WEST]: Orientation.COUNTER, // Down is counter-clockwise perpendicular

  // Intercardinal positions (interradial orientations)
  [GridLocation.NORTHEAST]: Orientation.CLOCK_IN, // Between E (clock) and N (in)
  [GridLocation.SOUTHEAST]: Orientation.CLOCK_OUT, // Between E (clock) and S (out)
  [GridLocation.SOUTHWEST]: Orientation.COUNTER_OUT, // Between W (counter) and S (out)
  [GridLocation.NORTHWEST]: Orientation.COUNTER_IN, // Between W (counter) and N (in)

  // Center position: gravity pulls downward = prop points south
  [GridLocation.CENTER]: Orientation.CENTER_S,
};

export function getGravityOrientation(location: GridLocation): Orientation {
  return GRAVITY_ORIENTATION_MAP[location];
}

export function isGravityOrientation(location: GridLocation, orientation: Orientation): boolean {
  return GRAVITY_ORIENTATION_MAP[location] === orientation;
}
