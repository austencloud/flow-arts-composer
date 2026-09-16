/**
 * Letter Lookup for LOOP Execution
 *
 * Given motion parameters (type, rotation direction, start/end locations),
 * finds the corresponding TKA letter by searching the pictograph data.
 *
 * This is needed for LOOP execution because when you reverse motions,
 * the resulting letter may be different from the original. For example,
 * reversing E's motions produces K (they are inverses of each other).
 */

interface MotionData {
  hand?: string;
  startLocation: string;
  endLocation: string;
  motionType: string;
  rotationDirection: string;
  startOrientation?: string;
  endOrientation?: string;
  prefloatMotionType?: string;
  prefloatRotationDirection?: string;
}

interface PictographData {
  letter: string;
  startPlacement: string;
  endPlacement: string;
  timing: string;
  direction: string;
  leftMotion: MotionData;
  rightMotion: MotionData;
}

/**
 * Find the TKA letter that matches the given left and right motion parameters.
 * @param leftMotion - Left motion data (type, locations, rotation)
 * @param rightMotion - Right motion data (type, locations, rotation)
 * @param allPictographs - All available pictograph data to search
 * @returns The matching letter, or null if no match found
 */
export function findLetterByMotions(
  leftMotion: MotionData,
  rightMotion: MotionData,
  allPictographs: PictographData[]
): string | null {
  // Normalize inputs to lowercase for matching
  const leftType = (
    leftMotion.motionType === "float"
      ? (leftMotion.prefloatMotionType ?? leftMotion.motionType)
      : leftMotion.motionType
  ).toLowerCase();
  const leftStart = leftMotion.startLocation.toLowerCase();
  const leftEnd = leftMotion.endLocation.toLowerCase();
  const leftRot = (
    leftMotion.motionType === "float"
      ? (leftMotion.prefloatRotationDirection ?? leftMotion.rotationDirection)
      : leftMotion.rotationDirection
  ).toLowerCase();

  const rightType = (
    rightMotion.motionType === "float"
      ? (rightMotion.prefloatMotionType ?? rightMotion.motionType)
      : rightMotion.motionType
  ).toLowerCase();
  const rightStart = rightMotion.startLocation.toLowerCase();
  const rightEnd = rightMotion.endLocation.toLowerCase();
  const rightRot = (
    rightMotion.motionType === "float"
      ? (rightMotion.prefloatRotationDirection ?? rightMotion.rotationDirection)
      : rightMotion.rotationDirection
  ).toLowerCase();

  // For static and dash motions, rotation direction doesn't matter
  // because the generator applies turns which changes rotation
  const leftIgnoreRotation = leftType === "static" || leftType === "dash";
  const rightIgnoreRotation = rightType === "static" || rightType === "dash";

  for (const pictograph of allPictographs) {
    const pLeft = pictograph.leftMotion;
    const pRight = pictograph.rightMotion;

    // Check left motion matches
    const leftTypeMatches = pLeft.motionType.toLowerCase() === leftType;
    const leftStartMatches = pLeft.startLocation.toLowerCase() === leftStart;
    const leftEndMatches = pLeft.endLocation.toLowerCase() === leftEnd;
    const leftRotMatches =
      leftIgnoreRotation || pLeft.rotationDirection.toLowerCase() === leftRot;

    // Check right motion matches
    const rightTypeMatches = pRight.motionType.toLowerCase() === rightType;
    const rightStartMatches = pRight.startLocation.toLowerCase() === rightStart;
    const rightEndMatches = pRight.endLocation.toLowerCase() === rightEnd;
    const rightRotMatches =
      rightIgnoreRotation || pRight.rotationDirection.toLowerCase() === rightRot;

    if (
      leftTypeMatches &&
      leftStartMatches &&
      leftEndMatches &&
      leftRotMatches &&
      rightTypeMatches &&
      rightStartMatches &&
      rightEndMatches &&
      rightRotMatches
    ) {
      return pictograph.letter;
    }
  }

  // No exact match found - try with relaxed rotation matching
  // This handles cases where turns have been applied
  for (const pictograph of allPictographs) {
    const pLeft = pictograph.leftMotion;
    const pRight = pictograph.rightMotion;

    const leftTypeMatches = pLeft.motionType.toLowerCase() === leftType;
    const leftStartMatches = pLeft.startLocation.toLowerCase() === leftStart;
    const leftEndMatches = pLeft.endLocation.toLowerCase() === leftEnd;

    const rightTypeMatches = pRight.motionType.toLowerCase() === rightType;
    const rightStartMatches = pRight.startLocation.toLowerCase() === rightStart;
    const rightEndMatches = pRight.endLocation.toLowerCase() === rightEnd;

    if (
      leftTypeMatches &&
      leftStartMatches &&
      leftEndMatches &&
      rightTypeMatches &&
      rightStartMatches &&
      rightEndMatches
    ) {
      return pictograph.letter;
    }
  }

  return null;
}

/**
 * CW becomes CCW, CCW becomes CW.
 * Static/dash/noRotation stay unchanged.
 */
export function getInverseRotation(rotation: string): string {
  const normalized = rotation.toLowerCase();
  if (normalized === "cw") return "ccw";
  if (normalized === "ccw") return "cw";
  return rotation;
}
