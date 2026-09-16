/**
 * Grid Placement Deriver
 *
 * Maps between placement names (alpha4, beta2, etc.) and hand location pairs.
 * A placement represents the combination of (blue_hand_location, red_hand_location).
 */

import { GridLocation, GridPlacement } from "../domain/enums/grid-enums";

const PLACEMENTS_MAP = new Map<string, GridPlacement>([
  // Alpha placements - hands in opposite/inverted directions
  [`${GridLocation.SOUTH},${GridLocation.NORTH}`, GridPlacement.ALPHA1],
  [`${GridLocation.SOUTHWEST},${GridLocation.NORTHEAST}`, GridPlacement.ALPHA2],
  [`${GridLocation.WEST},${GridLocation.EAST}`, GridPlacement.ALPHA3],
  [`${GridLocation.NORTHWEST},${GridLocation.SOUTHEAST}`, GridPlacement.ALPHA4],
  [`${GridLocation.NORTH},${GridLocation.SOUTH}`, GridPlacement.ALPHA5],
  [`${GridLocation.NORTHEAST},${GridLocation.SOUTHWEST}`, GridPlacement.ALPHA6],
  [`${GridLocation.EAST},${GridLocation.WEST}`, GridPlacement.ALPHA7],
  [`${GridLocation.SOUTHEAST},${GridLocation.NORTHWEST}`, GridPlacement.ALPHA8],

  // Beta placements - both hands same direction
  [`${GridLocation.NORTH},${GridLocation.NORTH}`, GridPlacement.BETA1],
  [`${GridLocation.NORTHEAST},${GridLocation.NORTHEAST}`, GridPlacement.BETA2],
  [`${GridLocation.EAST},${GridLocation.EAST}`, GridPlacement.BETA3],
  [`${GridLocation.SOUTHEAST},${GridLocation.SOUTHEAST}`, GridPlacement.BETA4],
  [`${GridLocation.SOUTH},${GridLocation.SOUTH}`, GridPlacement.BETA5],
  [`${GridLocation.SOUTHWEST},${GridLocation.SOUTHWEST}`, GridPlacement.BETA6],
  [`${GridLocation.WEST},${GridLocation.WEST}`, GridPlacement.BETA7],
  [`${GridLocation.NORTHWEST},${GridLocation.NORTHWEST}`, GridPlacement.BETA8],

  // Gamma placements - mixed/varied combinations
  [`${GridLocation.WEST},${GridLocation.NORTH}`, GridPlacement.GAMMA1],
  [`${GridLocation.NORTHWEST},${GridLocation.NORTHEAST}`, GridPlacement.GAMMA2],
  [`${GridLocation.NORTH},${GridLocation.EAST}`, GridPlacement.GAMMA3],
  [`${GridLocation.NORTHEAST},${GridLocation.SOUTHEAST}`, GridPlacement.GAMMA4],
  [`${GridLocation.EAST},${GridLocation.SOUTH}`, GridPlacement.GAMMA5],
  [`${GridLocation.SOUTHEAST},${GridLocation.SOUTHWEST}`, GridPlacement.GAMMA6],
  [`${GridLocation.SOUTH},${GridLocation.WEST}`, GridPlacement.GAMMA7],
  [`${GridLocation.SOUTHWEST},${GridLocation.NORTHWEST}`, GridPlacement.GAMMA8],
  [`${GridLocation.EAST},${GridLocation.NORTH}`, GridPlacement.GAMMA9],
  [`${GridLocation.SOUTHEAST},${GridLocation.NORTHEAST}`, GridPlacement.GAMMA10],
  [`${GridLocation.SOUTH},${GridLocation.EAST}`, GridPlacement.GAMMA11],
  [`${GridLocation.SOUTHWEST},${GridLocation.SOUTHEAST}`, GridPlacement.GAMMA12],
  [`${GridLocation.WEST},${GridLocation.SOUTH}`, GridPlacement.GAMMA13],
  [`${GridLocation.NORTHWEST},${GridLocation.SOUTHWEST}`, GridPlacement.GAMMA14],
  [`${GridLocation.NORTH},${GridLocation.WEST}`, GridPlacement.GAMMA15],
  [`${GridLocation.NORTHEAST},${GridLocation.NORTHWEST}`, GridPlacement.GAMMA16],

  // Zeta placements - 135° obtuse angle (skewed mode)
  [`${GridLocation.SOUTHWEST},${GridLocation.NORTH}`, GridPlacement.ZETA1],
  [`${GridLocation.WEST},${GridLocation.NORTHEAST}`, GridPlacement.ZETA2],
  [`${GridLocation.NORTHWEST},${GridLocation.EAST}`, GridPlacement.ZETA3],
  [`${GridLocation.NORTH},${GridLocation.SOUTHEAST}`, GridPlacement.ZETA4],
  [`${GridLocation.NORTHEAST},${GridLocation.SOUTH}`, GridPlacement.ZETA5],
  [`${GridLocation.EAST},${GridLocation.SOUTHWEST}`, GridPlacement.ZETA6],
  [`${GridLocation.SOUTHEAST},${GridLocation.WEST}`, GridPlacement.ZETA7],
  [`${GridLocation.SOUTH},${GridLocation.NORTHWEST}`, GridPlacement.ZETA8],
  [`${GridLocation.SOUTHEAST},${GridLocation.NORTH}`, GridPlacement.ZETA9],
  [`${GridLocation.SOUTH},${GridLocation.NORTHEAST}`, GridPlacement.ZETA10],
  [`${GridLocation.SOUTHWEST},${GridLocation.EAST}`, GridPlacement.ZETA11],
  [`${GridLocation.WEST},${GridLocation.SOUTHEAST}`, GridPlacement.ZETA12],
  [`${GridLocation.NORTHWEST},${GridLocation.SOUTH}`, GridPlacement.ZETA13],
  [`${GridLocation.NORTH},${GridLocation.SOUTHWEST}`, GridPlacement.ZETA14],
  [`${GridLocation.NORTHEAST},${GridLocation.WEST}`, GridPlacement.ZETA15],
  [`${GridLocation.EAST},${GridLocation.NORTHWEST}`, GridPlacement.ZETA16],

  // Eta placements - 45° acute angle (skewed mode)
  [`${GridLocation.NORTHWEST},${GridLocation.NORTH}`, GridPlacement.ETA1],
  [`${GridLocation.NORTH},${GridLocation.NORTHEAST}`, GridPlacement.ETA2],
  [`${GridLocation.NORTHEAST},${GridLocation.EAST}`, GridPlacement.ETA3],
  [`${GridLocation.EAST},${GridLocation.SOUTHEAST}`, GridPlacement.ETA4],
  [`${GridLocation.SOUTHEAST},${GridLocation.SOUTH}`, GridPlacement.ETA5],
  [`${GridLocation.SOUTH},${GridLocation.SOUTHWEST}`, GridPlacement.ETA6],
  [`${GridLocation.SOUTHWEST},${GridLocation.WEST}`, GridPlacement.ETA7],
  [`${GridLocation.WEST},${GridLocation.NORTHWEST}`, GridPlacement.ETA8],
  [`${GridLocation.NORTHEAST},${GridLocation.NORTH}`, GridPlacement.ETA9],
  [`${GridLocation.EAST},${GridLocation.NORTHEAST}`, GridPlacement.ETA10],
  [`${GridLocation.SOUTHEAST},${GridLocation.EAST}`, GridPlacement.ETA11],
  [`${GridLocation.SOUTH},${GridLocation.SOUTHEAST}`, GridPlacement.ETA12],
  [`${GridLocation.SOUTHWEST},${GridLocation.SOUTH}`, GridPlacement.ETA13],
  [`${GridLocation.WEST},${GridLocation.SOUTHWEST}`, GridPlacement.ETA14],
  [`${GridLocation.NORTHWEST},${GridLocation.WEST}`, GridPlacement.ETA15],
  [`${GridLocation.NORTH},${GridLocation.NORTHWEST}`, GridPlacement.ETA16],
]);

// Build reverse mapping from the PLACEMENTS_MAP
const LOCATION_PAIRS_MAP: Record<GridPlacement, [GridLocation, GridLocation]> =
  {} as Record<GridPlacement, [GridLocation, GridLocation]>;

PLACEMENTS_MAP.forEach((placement, locationKey) => {
  const [leftLocationStr, rightLocationStr] = locationKey.split(",");
  LOCATION_PAIRS_MAP[placement] = [
    leftLocationStr as GridLocation,
    rightLocationStr as GridLocation,
  ];
});

/**
 * Get the hand location pair for a given placement
 */
export function getGridLocationsFromPlacement(
  placement: GridPlacement
): [GridLocation, GridLocation] {
  const pair = LOCATION_PAIRS_MAP[placement];
  if (!pair) {
    throw new Error(`No location pair found for placement: ${placement}`);
  }
  return pair;
}

/**
 * Get the placement for a given hand location pair
 */
export function getGridPlacementFromLocations(
  leftLocation: GridLocation,
  rightLocation: GridLocation
): GridPlacement {
  const key = `${leftLocation},${rightLocation}`;
  const placement = PLACEMENTS_MAP.get(key);
  if (!placement) {
    throw new Error(
      `No placement found for locations: ${leftLocation}, ${rightLocation}`
    );
  }
  return placement;
}
