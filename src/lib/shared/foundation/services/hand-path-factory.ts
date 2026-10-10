import { hashHandPath } from "#lib/shared/foundation/services/content-hasher.js";
import type { HandPathData } from "../domain/models/hand-path-data";
import {
  GridLocation,
  GridMode,
} from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";

const CARDINAL_LOCATIONS = new Set<GridLocation>([
  GridLocation.NORTH,
  GridLocation.EAST,
  GridLocation.SOUTH,
  GridLocation.WEST,
]);

const INTERCARDINAL_LOCATIONS = new Set<GridLocation>([
  GridLocation.NORTHEAST,
  GridLocation.SOUTHEAST,
  GridLocation.SOUTHWEST,
  GridLocation.NORTHWEST,
]);

function deriveGridMode(locations: readonly GridLocation[]): GridMode {
  if (locations.includes(GridLocation.CENTER)) {
    return GridMode.CENTRIC;
  }

  const perimeter = locations.filter((loc) => loc !== GridLocation.CENTER);

  if (perimeter.length === 0) {
    return GridMode.DIAMOND;
  }

  const allCardinal = perimeter.every((loc) => CARDINAL_LOCATIONS.has(loc));
  if (allCardinal) return GridMode.DIAMOND;

  const allIntercardinal = perimeter.every((loc) =>
    INTERCARDINAL_LOCATIONS.has(loc)
  );
  if (allIntercardinal) return GridMode.BOX;

  return GridMode.SKEWED;
}

function buildBigrams(locations: readonly GridLocation[]): string[] {
  const bigrams: string[] = [];
  for (let i = 0; i < locations.length - 1; i++) {
    bigrams.push(`${locations[i]}_${locations[i + 1]}`);
  }
  return bigrams;
}

function deduplicateLocations(
  locations: readonly GridLocation[]
): GridLocation[] {
  const seen = new Set<GridLocation>();
  const result: GridLocation[] = [];
  for (const loc of locations) {
    if (!seen.has(loc)) {
      seen.add(loc);
      result.push(loc);
    }
  }
  return result;
}

export function createHandPath(
  locations: readonly GridLocation[],
  metadata?: { name?: string; author?: string; notes?: string }
): HandPathData {
  if (locations.length === 0) {
    throw new Error("createHandPath: locations must not be empty");
  }

  const startLocation = locations[0] as GridLocation;
  const endLocation = locations[locations.length - 1] as GridLocation;
  const length = locations.length - 1;
  const bigrams = buildBigrams(locations);
  const uniqueLocations = deduplicateLocations(locations);
  const impliedGridMode = deriveGridMode(locations);
  const isClosed = startLocation === endLocation;
  const contentHash = hashHandPath(locations);
  const id = crypto.randomUUID();

  return {
    id,
    locations,
    contentHash,
    startLocation,
    endLocation,
    length,
    bigrams,
    uniqueLocations,
    impliedGridMode,
    isClosed,
    ...metadata,
  };
}
