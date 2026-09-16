/**
 * Arrow placement calculations
 *
 * Calculates arrow location and position based on motion type,
 * start/end locations, and grid mode.
 */

import type { ArrowPlacement, Coordinates, GridLocation, GridMode, MotionType } from "../types.js";
import { getLayer2PointCoordinates } from "./grid-placement.js";
import { calculateArrowRotation } from "./arrow-rotation.js";


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
  [createLocationPairKey(["n", "e"])]: "ne",
  [createLocationPairKey(["e", "s"])]: "se",
  [createLocationPairKey(["s", "w"])]: "sw",
  [createLocationPairKey(["w", "n"])]: "nw",

  // Adjacent Intercardinal combinations (normal shifts)
  [createLocationPairKey(["ne", "nw"])]: "n",
  [createLocationPairKey(["ne", "se"])]: "e",
  [createLocationPairKey(["sw", "se"])]: "s",
  [createLocationPairKey(["nw", "sw"])]: "w",

  // SKEWED motion combinations (cardinal ↔ non-adjacent intercardinal)
  [createLocationPairKey(["w", "ne"])]: "n",
  [createLocationPairKey(["w", "se"])]: "s",
  [createLocationPairKey(["n", "se"])]: "e",
  [createLocationPairKey(["n", "sw"])]: "w",
  [createLocationPairKey(["e", "sw"])]: "s",
  [createLocationPairKey(["e", "nw"])]: "n",
  [createLocationPairKey(["s", "nw"])]: "w",
  [createLocationPairKey(["s", "ne"])]: "e",
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
    case "static":
      // Static arrows use their start location directly
      return normalizedStartLoc;

    case "pro":
    case "anti":
    case "float":
      // Shift arrows use location pair mapping
      const locationPairKey = createLocationPairKey([normalizedStartLoc, normalizedEndLoc]);
      return shiftDirectionPairs[locationPairKey] ?? normalizedStartLoc;

    case "dash":
      // For simplicity, dash uses end location
      // (full implementation uses DashLocationCalculator)
      return normalizedEndLoc;

    default:
      return normalizedStartLoc;
  }
}

export function calculateArrowPosition(
  location: GridLocation | string,
  gridMode: GridMode
): Coordinates {
  return getLayer2PointCoordinates(location, gridMode);
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
