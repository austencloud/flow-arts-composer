/**
 * Arrow placement calculations for pictograph rendering
 * Ported from src/lib/shared/pictograph/arrow for Node.js usage
 *
 * Handles arrow location, position, and rotation calculations.
 */

import { GridLocation, GridMode, MotionType } from "./enums.js";
import { getLayer2PointCoordinates, type Coordinates } from "@tka/render-core";


/**
 * PRO rotation maps - exact values from ProAntiRotationMaps.ts
 */
export const proClockwiseMap: Record<GridLocation, number> = {
  [GridLocation.NORTH]: 315,
  [GridLocation.EAST]: 45,
  [GridLocation.SOUTH]: 135,
  [GridLocation.WEST]: 225,
  [GridLocation.NORTHEAST]: 0,
  [GridLocation.SOUTHEAST]: 90,
  [GridLocation.SOUTHWEST]: 180,
  [GridLocation.NORTHWEST]: 270,
};

export const proCounterClockwiseMap: Record<GridLocation, number> = {
  [GridLocation.NORTH]: 45,
  [GridLocation.EAST]: 135,
  [GridLocation.SOUTH]: 225,
  [GridLocation.WEST]: 315,
  [GridLocation.NORTHEAST]: 90,
  [GridLocation.SOUTHEAST]: 180,
  [GridLocation.SOUTHWEST]: 270,
  [GridLocation.NORTHWEST]: 0,
};

/**
 * ANTI rotation maps
 * ANTI clockwise = PRO counter-clockwise
 * ANTI counter-clockwise = PRO clockwise
 */
export const antiClockwiseMap: Record<GridLocation, number> = {
  [GridLocation.NORTH]: 45,
  [GridLocation.EAST]: 135,
  [GridLocation.SOUTH]: 225,
  [GridLocation.WEST]: 315,
  [GridLocation.NORTHEAST]: 90,
  [GridLocation.SOUTHEAST]: 180,
  [GridLocation.SOUTHWEST]: 270,
  [GridLocation.NORTHWEST]: 0,
};

export const antiCounterClockwiseMap: Record<GridLocation, number> = {
  [GridLocation.NORTH]: 315,
  [GridLocation.EAST]: 45,
  [GridLocation.SOUTH]: 135,
  [GridLocation.WEST]: 225,
  [GridLocation.NORTHEAST]: 0,
  [GridLocation.SOUTHEAST]: 90,
  [GridLocation.SOUTHWEST]: 180,
  [GridLocation.NORTHWEST]: 270,
};

/**
 * STATIC rotation maps - radial (IN/OUT) orientations
 */
export const staticRadialClockwiseMap: Record<GridLocation, number> = {
  [GridLocation.NORTH]: 0,
  [GridLocation.EAST]: 90,
  [GridLocation.SOUTH]: 180,
  [GridLocation.WEST]: 270,
  [GridLocation.NORTHEAST]: 45,
  [GridLocation.SOUTHEAST]: 135,
  [GridLocation.SOUTHWEST]: 225,
  [GridLocation.NORTHWEST]: 315,
};

export const staticRadialCounterClockwiseMap: Record<GridLocation, number> = {
  [GridLocation.NORTH]: 180,
  [GridLocation.EAST]: 270,
  [GridLocation.SOUTH]: 0,
  [GridLocation.WEST]: 90,
  [GridLocation.NORTHEAST]: 225,
  [GridLocation.SOUTHEAST]: 315,
  [GridLocation.SOUTHWEST]: 45,
  [GridLocation.NORTHWEST]: 135,
};

/**
 * STATIC rotation maps - non-radial (CLOCK/COUNTER) orientations
 */
export const staticNonRadialClockwiseMap: Record<GridLocation, number> = {
  [GridLocation.NORTH]: 315,
  [GridLocation.EAST]: 45,
  [GridLocation.SOUTH]: 135,
  [GridLocation.WEST]: 225,
  [GridLocation.NORTHEAST]: 0,
  [GridLocation.SOUTHEAST]: 90,
  [GridLocation.SOUTHWEST]: 180,
  [GridLocation.NORTHWEST]: 270,
};

export const staticNonRadialCounterClockwiseMap: Record<GridLocation, number> = {
  [GridLocation.NORTH]: 135,
  [GridLocation.EAST]: 225,
  [GridLocation.SOUTH]: 315,
  [GridLocation.WEST]: 45,
  [GridLocation.NORTHEAST]: 180,
  [GridLocation.SOUTHEAST]: 270,
  [GridLocation.SOUTHWEST]: 0,
  [GridLocation.NORTHWEST]: 90,
};

/**
 * DASH rotation maps
 *
 * IMPORTANT: Both CW and CCW maps are IDENTICAL for dash arrows!
 * The rotation angle is based purely on the arrow's location (pointing outward).
 * The CW/CCW only affects mirroring, not the rotation angle itself.
 */
export const dashClockwiseMap: Record<GridLocation, number> = {
  [GridLocation.NORTH]: 0,
  [GridLocation.EAST]: 90,
  [GridLocation.SOUTH]: 180,
  [GridLocation.WEST]: 270,
  [GridLocation.NORTHEAST]: 45,
  [GridLocation.SOUTHEAST]: 135,
  [GridLocation.SOUTHWEST]: 225,
  [GridLocation.NORTHWEST]: 315,
};

// CCW map is identical to CW - rotation angle is location-based, not direction-based
export const dashCounterClockwiseMap: Record<GridLocation, number> = {
  [GridLocation.NORTH]: 0,
  [GridLocation.EAST]: 90,
  [GridLocation.SOUTH]: 180,
  [GridLocation.WEST]: 270,
  [GridLocation.NORTHEAST]: 45,
  [GridLocation.SOUTHEAST]: 135,
  [GridLocation.SOUTHWEST]: 225,
  [GridLocation.NORTHWEST]: 315,
};

/**
 * DASH no-rotation map (special case for straight dashes)
 * Key format: "startLocation,endLocation" (lowercase)
 */
export const dashNoRotationMap: Record<string, number> = {
  // Vertical dashes
  "n,s": 90,
  "s,n": 270,
  // Horizontal dashes
  "e,w": 180,
  "w,e": 0,
  // Diagonal dashes
  "se,nw": 225,
  "sw,ne": 315,
  "nw,se": 45,
  "ne,sw": 135,
};

/**
 * FLOAT rotation maps (same as PRO but uses handpath direction)
 */
export const floatClockwiseMap = proClockwiseMap;
export const floatCounterClockwiseMap = proCounterClockwiseMap;


/**
 * Direction pairs mapping for shift arrows (PRO/ANTI/FLOAT)
 * Maps start/end location pairs to their calculated arrow location
 */
function createLocationPairKey(locations: GridLocation[]): string {
  // Sort locations to ensure consistent key regardless of order
  const sortedLocations = [...locations].sort();
  return sortedLocations.join(",");
}

const shiftDirectionPairs: Record<string, GridLocation> = {
  // Cardinal + Adjacent Cardinal combinations (normal shifts)
  [createLocationPairKey([GridLocation.NORTH, GridLocation.EAST])]: GridLocation.NORTHEAST,
  [createLocationPairKey([GridLocation.EAST, GridLocation.SOUTH])]: GridLocation.SOUTHEAST,
  [createLocationPairKey([GridLocation.SOUTH, GridLocation.WEST])]: GridLocation.SOUTHWEST,
  [createLocationPairKey([GridLocation.WEST, GridLocation.NORTH])]: GridLocation.NORTHWEST,
  // Adjacent Intercardinal combinations (normal shifts)
  [createLocationPairKey([GridLocation.NORTHEAST, GridLocation.NORTHWEST])]: GridLocation.NORTH,
  [createLocationPairKey([GridLocation.NORTHEAST, GridLocation.SOUTHEAST])]: GridLocation.EAST,
  [createLocationPairKey([GridLocation.SOUTHWEST, GridLocation.SOUTHEAST])]: GridLocation.SOUTH,
  [createLocationPairKey([GridLocation.NORTHWEST, GridLocation.SOUTHWEST])]: GridLocation.WEST,

  // SKEWED motion combinations (cardinal ↔ non-adjacent intercardinal)
  [createLocationPairKey([GridLocation.WEST, GridLocation.NORTHEAST])]: GridLocation.NORTH,
  [createLocationPairKey([GridLocation.WEST, GridLocation.SOUTHEAST])]: GridLocation.SOUTH,
  [createLocationPairKey([GridLocation.NORTH, GridLocation.SOUTHEAST])]: GridLocation.EAST,
  [createLocationPairKey([GridLocation.NORTH, GridLocation.SOUTHWEST])]: GridLocation.WEST,
  [createLocationPairKey([GridLocation.EAST, GridLocation.SOUTHWEST])]: GridLocation.SOUTH,
  [createLocationPairKey([GridLocation.EAST, GridLocation.NORTHWEST])]: GridLocation.NORTH,
  [createLocationPairKey([GridLocation.SOUTH, GridLocation.NORTHWEST])]: GridLocation.WEST,
  [createLocationPairKey([GridLocation.SOUTH, GridLocation.NORTHEAST])]: GridLocation.EAST,
};

export function calculateArrowLocation(
  motionType: MotionType | string,
  startLocation: GridLocation | string,
  endLocation: GridLocation | string
): GridLocation {
  const normalizedMotionType = (
    typeof motionType === "string" ? motionType.toLowerCase() : motionType
  ) as MotionType;

  const normalizedStartLoc = (
    typeof startLocation === "string" ? startLocation.toLowerCase() : startLocation
  ) as GridLocation;

  const normalizedEndLoc = (
    typeof endLocation === "string" ? endLocation.toLowerCase() : endLocation
  ) as GridLocation;

  switch (normalizedMotionType) {
    case MotionType.STATIC:
      // Static arrows use their start location directly
      return normalizedStartLoc;

    case MotionType.PRO:
    case MotionType.ANTI:
    case MotionType.FLOAT:
      // Shift arrows use location pair mapping
      const locationPairKey = createLocationPairKey([normalizedStartLoc, normalizedEndLoc]);
      return shiftDirectionPairs[locationPairKey] ?? normalizedStartLoc;

    case MotionType.DASH:
      // For simplicity, dash uses end location
      // (full implementation would use DashLocationCalculator)
      return normalizedEndLoc;

    default:
      return normalizedStartLoc;
  }
}


function selectRotationMap(
  motionType: MotionType,
  rotationDirection: string,
  isRadialOrientation?: boolean
): Record<GridLocation, number> {
  const normalizedDir = rotationDirection.toLowerCase();
  const isCW = normalizedDir === "cw" || normalizedDir === "clockwise";

  switch (motionType) {
    case MotionType.PRO:
      return isCW ? proClockwiseMap : proCounterClockwiseMap;

    case MotionType.ANTI:
      return isCW ? antiClockwiseMap : antiCounterClockwiseMap;

    case MotionType.STATIC:
      if (isRadialOrientation) {
        return isCW ? staticRadialClockwiseMap : staticRadialCounterClockwiseMap;
      }
      return isCW ? staticNonRadialClockwiseMap : staticNonRadialCounterClockwiseMap;

    case MotionType.DASH:
      return isCW ? dashClockwiseMap : dashCounterClockwiseMap;

    case MotionType.FLOAT:
      return isCW ? floatClockwiseMap : floatCounterClockwiseMap;

    default:
      return proClockwiseMap;
  }
}

export function calculateArrowRotation(
  motionType: MotionType | string,
  location: GridLocation | string,
  rotationDirection: string,
  startLocation?: GridLocation | string,
  endLocation?: GridLocation | string,
  isRadialOrientation?: boolean
): number {
  const normalizedMotionType = (
    typeof motionType === "string" ? motionType.toLowerCase() : motionType
  ) as MotionType;

  const normalizedLocation = (
    typeof location === "string" ? location.toLowerCase() : location
  ) as GridLocation;

  // Handle DASH with no rotation (straight dashes)
  if (normalizedMotionType === MotionType.DASH) {
    const normalizedDir = rotationDirection.toLowerCase();
    // Check all variants: "no_rot", "no_rotation", "norotation", "none"
    const isNoRotation = normalizedDir === "no_rot" || normalizedDir === "no_rotation" ||
                         normalizedDir === "norotation" || normalizedDir === "none";
    if (isNoRotation) {
      if (startLocation && endLocation) {
        const startLoc = typeof startLocation === "string" ? startLocation.toLowerCase() : startLocation;
        const endLoc = typeof endLocation === "string" ? endLocation.toLowerCase() : endLocation;
        const key = `${startLoc},${endLoc}`;
        return dashNoRotationMap[key] ?? 0;
      }
    }
  }

  const rotationMap = selectRotationMap(normalizedMotionType, rotationDirection, isRadialOrientation);
  return rotationMap[normalizedLocation] ?? 0;
}


export function calculateArrowPosition(
  location: GridLocation | string,
  gridMode: GridMode
): Coordinates {
  return getLayer2PointCoordinates(location, gridMode);
}


export interface ArrowPlacement {
  x: number;
  y: number;
  rotation: number;
  location: GridLocation;
}

export function calculateArrowPlacement(
  motionType: MotionType | string,
  startLocation: GridLocation | string,
  endLocation: GridLocation | string,
  rotationDirection: string,
  gridMode: GridMode,
  isRadialOrientation?: boolean
): ArrowPlacement {
  // Step 1: Calculate arrow location
  const location = calculateArrowLocation(motionType, startLocation, endLocation);

  // Step 2: Calculate position from location
  const position = calculateArrowPosition(location, gridMode);

  // Step 3: Calculate rotation
  const rotation = calculateArrowRotation(
    motionType,
    location,
    rotationDirection,
    startLocation,
    endLocation,
    isRadialOrientation
  );

  return {
    x: position.x,
    y: position.y,
    rotation,
    location,
  };
}
