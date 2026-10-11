import type { Vector3 } from "three";
import type { Plane } from "@austencloud/scene-3d";
import { GridLocation } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import { getAllGridPositions } from "#lib/shared/3d/services/plane-coordinate-mapper.js";

const ALL_LOCATIONS: GridLocation[] = [
  GridLocation.NORTH,
  GridLocation.NORTHEAST,
  GridLocation.EAST,
  GridLocation.SOUTHEAST,
  GridLocation.SOUTH,
  GridLocation.SOUTHWEST,
  GridLocation.WEST,
  GridLocation.NORTHWEST,
];

export function snapToNearestGridLocation(
  point: Vector3,
  plane: Plane,
): GridLocation {
  const positions = getAllGridPositions(plane);
  let best: GridLocation = GridLocation.EAST;
  let bestDist = Infinity;

  for (const loc of ALL_LOCATIONS) {
    const pos = positions.get(loc);
    if (!pos) continue;
    const d = point.distanceTo(pos);
    if (d < bestDist) {
      bestDist = d;
      best = loc;
    }
  }

  return best;
}
