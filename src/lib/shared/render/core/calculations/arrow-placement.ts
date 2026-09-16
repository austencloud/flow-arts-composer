import type { ArrowPlacement, Coordinates, GridLocation, GridMode, MotionType } from "../types.js";
import { getLayer2PointCoordinates } from "./grid-placement.js";
import { calculateArrowRotation } from "./arrow-rotation.js";

function createLocationPairKey(locations: GridLocation[]): string {
  const sortedLocations = [...locations].sort();
  return sortedLocations.join(",");
}

const shiftDirectionPairs: Record<string, GridLocation> = {
  [createLocationPairKey(["n", "e"])]: "ne",
  [createLocationPairKey(["e", "s"])]: "se",
  [createLocationPairKey(["s", "w"])]: "sw",
  [createLocationPairKey(["w", "n"])]: "nw",

  [createLocationPairKey(["ne", "nw"])]: "n",
  [createLocationPairKey(["ne", "se"])]: "e",
  [createLocationPairKey(["sw", "se"])]: "s",
  [createLocationPairKey(["nw", "sw"])]: "w",

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
      return normalizedStartLoc;

    case "pro":
    case "anti":
    case "float": {
      const locationPairKey = createLocationPairKey([normalizedStartLoc, normalizedEndLoc]);
      return shiftDirectionPairs[locationPairKey] ?? normalizedStartLoc;
    }

    case "dash":
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
  const location = calculateArrowLocation(motionType, startLocation, endLocation);

  const position = calculateArrowPosition(location, gridMode);

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
