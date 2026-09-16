/**
 * Trigrid Placement Definitions
 *
 * On the trigrid, only two placement groups exist:
 * - Beta: both hands at the same vertex (3 variations)
 * - Gamma: hands at different vertices, 120 degrees apart (3 variations)
 *
 * Alpha placements don't exist because there are no opposite points on a 3-point grid.
 */

import { GridLocation } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import type { TriGridMode, TriGridPlacementInfo } from "./trigrid-types";
import { getTriGridLocations } from "./trigrid-coordinates";

/** Location label abbreviations */
const LOCATION_LABELS: Record<string, string> = {
  [GridLocation.NORTH]: "N",
  [GridLocation.SOUTH]: "S",
  [GridLocation.NORTHEAST]: "NE",
  [GridLocation.NORTHWEST]: "NW",
  [GridLocation.SOUTHEAST]: "SE",
  [GridLocation.SOUTHWEST]: "SW",
};

function locationLabel(loc: GridLocation): string {
  return LOCATION_LABELS[loc] ?? loc;
}

/**
 * Get all trigrid placements for a given mode.
 * Returns 3 beta + 3 gamma = 6 total placements.
 */
export function getTriGridPlacements(mode: TriGridMode): TriGridPlacementInfo[] {
  const locs = getTriGridLocations(mode);
  const placements: TriGridPlacementInfo[] = [];

  // 3 beta placements: both hands at same vertex
  for (let i = 0; i < locs.length; i++) {
    const loc = locs[i]!;
    placements.push({
      group: "beta",
      index: i + 1,
      label: `Beta ${i + 1} (${locationLabel(loc)})`,
      leftLocation: loc,
      rightLocation: loc,
    });
  }

  // 3 gamma placements: hands at different vertices
  // Each pairing of two distinct vertices from the three available
  let gammaIndex = 1;
  for (let i = 0; i < locs.length; i++) {
    for (let j = i + 1; j < locs.length; j++) {
      const left = locs[i]!;
      const right = locs[j]!;
      placements.push({
        group: "gamma",
        index: gammaIndex,
        label: `Gamma ${gammaIndex} (${locationLabel(left)}, ${locationLabel(right)})`,
        leftLocation: left,
        rightLocation: right,
      });
      gammaIndex++;
    }
  }

  return placements;
}

/**
 * Resolve placement group from blue and red grid locations.
 */
export function resolveTriGridPlacement(
  leftLocation: GridLocation,
  rightLocation: GridLocation,
  mode: TriGridMode,
): TriGridPlacementInfo | null {
  const placements = getTriGridPlacements(mode);
  return (
    placements.find(
      (p) =>
        (p.leftLocation === leftLocation && p.rightLocation === rightLocation) ||
        (p.leftLocation === rightLocation && p.rightLocation === leftLocation),
    ) ?? null
  );
}
