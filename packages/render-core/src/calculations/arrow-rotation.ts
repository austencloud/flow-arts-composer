/**
 * Arrow rotation calculations
 *
 * Calculates arrow rotation angle based on motion type, location,
 * and rotation direction.
 */

import type { GridLocation, MotionType } from "../types.js";
import {
  PRO_CLOCKWISE_MAP,
  PRO_COUNTER_CLOCKWISE_MAP,
  ANTI_CLOCKWISE_MAP,
  ANTI_COUNTER_CLOCKWISE_MAP,
  STATIC_RADIAL_CLOCKWISE_MAP,
  STATIC_RADIAL_COUNTER_CLOCKWISE_MAP,
  STATIC_NON_RADIAL_CLOCKWISE_MAP,
  STATIC_NON_RADIAL_COUNTER_CLOCKWISE_MAP,
  DASH_CLOCKWISE_MAP,
  DASH_COUNTER_CLOCKWISE_MAP,
  DASH_NO_ROTATION_MAP,
  FLOAT_CLOCKWISE_MAP,
  FLOAT_COUNTER_CLOCKWISE_MAP,
} from "../constants/rotation-maps.js";
import { getHandpathDirection } from "./orientation.js";

const SCREEN_DIRECTIONS: Record<string, [number, number]> = {
  n: [0, -1],
  ne: [1, -1],
  e: [1, 0],
  se: [1, 1],
  s: [0, 1],
  sw: [-1, 1],
  w: [-1, 0],
  nw: [-1, -1],
  c: [0, 0],
};

/**
 * A float turns with the hand's path, not its rotation direction: the
 * clockwise or counter-clockwise path map, or, for a straight skewed path,
 * the screen angle from start to end, as the app's float rotation does.
 */
function floatRotation(location: string, startLocation: string, endLocation: string): number {
  const handpath = getHandpathDirection(startLocation, endLocation);
  if (handpath === "cw") return FLOAT_CLOCKWISE_MAP[location as GridLocation] ?? 0;
  if (handpath === "ccw") return FLOAT_COUNTER_CLOCKWISE_MAP[location as GridLocation] ?? 0;
  if (handpath === "dash" && startLocation !== endLocation) {
    const start = SCREEN_DIRECTIONS[startLocation];
    const end = SCREEN_DIRECTIONS[endLocation];
    if (start && end) {
      const degrees = (Math.atan2(end[1] - start[1], end[0] - start[0]) * 180) / Math.PI;
      return ((degrees % 360) + 360) % 360;
    }
  }
  return 0;
}

function selectRotationMap(
  motionType: MotionType,
  rotationDirection: string,
  isRadialOrientation?: boolean
): Record<GridLocation, number> {
  const normalizedDir = rotationDirection.toLowerCase();
  const isCW = normalizedDir === "cw" || normalizedDir === "clockwise";

  switch (motionType) {
    case "pro":
      return isCW ? PRO_CLOCKWISE_MAP : PRO_COUNTER_CLOCKWISE_MAP;

    case "anti":
      return isCW ? ANTI_CLOCKWISE_MAP : ANTI_COUNTER_CLOCKWISE_MAP;

    case "static":
      if (isRadialOrientation) {
        return isCW ? STATIC_RADIAL_CLOCKWISE_MAP : STATIC_RADIAL_COUNTER_CLOCKWISE_MAP;
      }
      return isCW ? STATIC_NON_RADIAL_CLOCKWISE_MAP : STATIC_NON_RADIAL_COUNTER_CLOCKWISE_MAP;

    case "dash":
      return isCW ? DASH_CLOCKWISE_MAP : DASH_COUNTER_CLOCKWISE_MAP;

    case "float":
      return isCW ? FLOAT_CLOCKWISE_MAP : FLOAT_COUNTER_CLOCKWISE_MAP;

    default:
      return PRO_CLOCKWISE_MAP;
  }
}

export function calculateArrowRotation(
  motionType: MotionType | string,
  location: GridLocation | string,
  rotationDirection: string,
  startLocation?: GridLocation | string,
  endLocation?: GridLocation | string,
  isRadialOrientation?: boolean,
  turns?: number | string
): number {
  const normalizedMotionType = (
    typeof motionType === "string" ? motionType.toLowerCase() : motionType
  ) as MotionType;

  const normalizedLocation = (
    typeof location === "string" ? location.toLowerCase() : location
  ) as GridLocation;

  // Handle DASH with no rotation (straight dashes)
  // For 0-turn dashes, always use start/end pair map — rotation direction
  // is meaningless at 0 turns and may be incorrectly set to cw/ccw
  if (normalizedMotionType === "dash") {
    const normalizedDir = rotationDirection.toLowerCase();
    const isNoRotation =
      normalizedDir === "no_rot" ||
      normalizedDir === "no_rotation" ||
      normalizedDir === "norotation" ||
      normalizedDir === "none";

    if (isNoRotation || turns === 0) {
      if (startLocation && endLocation) {
        const startLoc = typeof startLocation === "string" ? startLocation.toLowerCase() : startLocation;
        const endLoc = typeof endLocation === "string" ? endLocation.toLowerCase() : endLocation;
        const key = `${startLoc},${endLoc}`;
        return DASH_NO_ROTATION_MAP[key] ?? 0;
      }
    }
  }

  if (normalizedMotionType === "float" && startLocation && endLocation) {
    return floatRotation(
      normalizedLocation,
      String(startLocation).toLowerCase(),
      String(endLocation).toLowerCase()
    );
  }

  const rotationMap = selectRotationMap(normalizedMotionType, rotationDirection, isRadialOrientation);
  return rotationMap[normalizedLocation] ?? 0;
}
