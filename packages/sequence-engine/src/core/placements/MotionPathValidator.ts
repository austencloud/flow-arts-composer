/**
 * Motion Path Validator
 *
 * Validates that motion types use physically possible grid paths.
 * PRO and ANTI motions travel in 90-degree arcs to adjacent grid points.
 * They cannot travel to opposite grid points (180 degrees apart) because
 * that would require passing through the center, which only DASH does.
 */

import type { MotionData } from "../types/sequence-engine-types.js";

/**
 * Grid locations that are directly opposite each other (180 degrees apart).
 * These pairs are unreachable via PRO or ANTI motions.
 */
const OPPOSITE_PAIRS: ReadonlySet<string> = new Set([
  "n:s", "s:n",
  "e:w", "w:e",
  "ne:sw", "sw:ne",
  "nw:se", "se:nw",
]);

/**
 * Motion types that travel in arcs (only to adjacent grid points).
 * These cannot have start and end locations that are opposite.
 */
const ARC_MOTION_TYPES: ReadonlySet<string> = new Set([
  "pro", "anti", "float",
]);

export function areOppositeLocations(loc1: string, loc2: string): boolean {
  return OPPOSITE_PAIRS.has(`${loc1}:${loc2}`);
}

/**
 * Returns false if the motion is an arc type (PRO/ANTI/FLOAT) traveling
 * between opposite grid points.
 */
export function isValidMotionPath(motion: MotionData): boolean {
  if (!ARC_MOTION_TYPES.has(motion.motionType)) {
    return true;
  }

  // Static locations (start === end) are always valid
  if (motion.startLocation === motion.endLocation) {
    return true;
  }

  return !areOppositeLocations(motion.startLocation, motion.endLocation);
}

/**
 * Use this to filter out invalid variations from source data.
 */
export function hasValidMotionPaths(
  leftMotion: MotionData,
  rightMotion: MotionData,
): boolean {
  return isValidMotionPath(leftMotion) && isValidMotionPath(rightMotion);
}
