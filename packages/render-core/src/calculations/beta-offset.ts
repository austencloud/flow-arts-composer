/**
 * Beta offset calculator
 *
 * When two props end at the same location (a "beta" placement),
 * they need to be offset from each other so they don't overlap.
 *
 * This implements the EXACT gate sequence from PropPlacer.calculateBetaOffset()
 * (lines 130-376) and BetaPropDirectionCalculator for direction routing.
 */

import type { GridLocation, GridMode, VectorDirection } from "../types.js";
import { isCardinal } from "../types.js";
import {
  DIAMOND_RADIAL_MAP,
  DIAMOND_NON_RADIAL_MAP,
  BOX_RADIAL_MAP,
  BOX_NON_RADIAL_MAP,
  SHIFT_RADIAL_MAP,
  SHIFT_NON_RADIAL_MAP,
  LETTER_I_RADIAL_MAP,
  LETTER_I_NON_RADIAL_MAP,
  OPPOSITE_DIRECTIONS,
} from "../constants/direction-maps.js";
import {
  getBetaOffsetSize,
  isUnilateralProp,
  isBuugengFamilyProp,
} from "../constants/prop-classification.js";


export interface BetaMotionInput {
  startLocation: string;
  endLocation: string;
  endOrientation?: string;
  motionType: string;
  hand: "left" | "right";
  propType?: string;
}

export interface BetaOffsetInput {
  leftMotion: BetaMotionInput;
  rightMotion: BetaMotionInput;
  letter: string;
  gridMode: GridMode;
  /** Prop type override from user settings (e.g. user renders "staff" data as "buugeng") */
  leftPropType?: string;
  /** Prop type override from user settings */
  rightPropType?: string;
  /** Whether the left buugeng prop is flipped (chirality) */
  leftBuugengFlipped?: boolean;
  /** Whether the right buugeng prop is flipped (chirality) */
  rightBuugengFlipped?: boolean;
}


const RADIAL_ORIENTATIONS = ["in", "out"];
const NON_RADIAL_ORIENTATIONS = ["clock", "counter"];

function isRadialOrientation(ori: string | undefined): boolean {
  if (!ori) return false;
  return RADIAL_ORIENTATIONS.includes(ori.toLowerCase());
}

function isNonRadialOrientation(ori: string | undefined): boolean {
  if (!ori) return false;
  return NON_RADIAL_ORIENTATIONS.includes(ori.toLowerCase());
}

/**
 *
 * TODO: Known parity requirement — this logic is ASYMMETRIC in the app.
 * The app checks: (right is IN|OUT AND left is IN) OR (left is OUT regardless of right).
 * The symmetric version would be: both are IN|OUT. We replicate the asymmetric
 * version here for exact parity with the app's rendering.
 */
function isRadialForMapSelection(
  leftEndOri: string | undefined,
  rightEndOri: string | undefined
): boolean {
  const rightNorm = rightEndOri?.toLowerCase();
  const leftNorm = leftEndOri?.toLowerCase();

  const rightIsInOrOut = rightNorm === "in" || rightNorm === "out";
  const leftIsIn = leftNorm === "in";
  const leftIsOut = leftNorm === "out";

  return (rightIsInOrOut && leftIsIn) || leftIsOut;
}


function isShiftMotion(motionType: string): boolean {
  const type = motionType.toLowerCase();
  return type === "pro" || type === "anti" || type === "float";
}


function directionToOffset(
  direction: VectorDirection,
  distance: number
): { x: number; y: number } {
  switch (direction) {
    case "up":
      return { x: 0, y: -distance };
    case "down":
      return { x: 0, y: distance };
    case "left":
      return { x: -distance, y: 0 };
    case "right":
      return { x: distance, y: 0 };
    case "upright":
      return { x: distance, y: -distance };
    case "downright":
      return { x: distance, y: distance };
    case "upleft":
      return { x: -distance, y: -distance };
    case "downleft":
      return { x: -distance, y: distance };
    default:
      return { x: 0, y: 0 };
  }
}

function getOppositeDirection(direction: VectorDirection): VectorDirection {
  return OPPOSITE_DIRECTIONS[direction];
}


/**
 * by location and hand. Uses isCardinal(location) to choose diamond vs box map.
 */
function getStaticDashDirection(
  endLocation: string,
  hand: "left" | "right",
  isRadial: boolean
): VectorDirection | null {
  const loc = endLocation.toLowerCase() as GridLocation;
  const isDiamond = isCardinal(loc);

  let map: Record<GridLocation, Record<"left" | "right", VectorDirection>>;
  if (isDiamond) {
    map = isRadial ? DIAMOND_RADIAL_MAP : DIAMOND_NON_RADIAL_MAP;
  } else {
    map = isRadial ? BOX_RADIAL_MAP : BOX_NON_RADIAL_MAP;
  }

  const locationMap = map[loc];
  if (!locationMap) return null;
  return locationMap[hand] ?? null;
}

/**
 * Falls back to static/dash if lookup fails.
 */
function getShiftDirection(
  startLocation: string,
  endLocation: string,
  hand: "left" | "right",
  isRadial: boolean
): VectorDirection | null {
  const startLoc = startLocation.toLowerCase() as GridLocation;
  const endLoc = endLocation.toLowerCase() as GridLocation;

  const map = isRadial ? SHIFT_RADIAL_MAP : SHIFT_NON_RADIAL_MAP;
  const startMap = map[startLoc];
  if (!startMap) {
    return getStaticDashDirection(endLoc, hand, isRadial);
  }

  const direction = startMap[endLoc];
  if (!direction) {
    return getStaticDashDirection(endLoc, hand, isRadial);
  }

  return direction;
}

function getLetterIDirection(
  endLocation: string,
  hand: "left" | "right",
  isRadial: boolean
): VectorDirection | null {
  const loc = endLocation.toLowerCase() as GridLocation;
  const map = isRadial ? LETTER_I_RADIAL_MAP : LETTER_I_NON_RADIAL_MAP;
  const locationMap = map[loc];
  if (!locationMap) return null;
  return locationMap[hand] ?? null;
}

/**
 * G/H handler: look up from static/dash maps (DIAMOND/BOX) using endLocation.
 * Right gets the base direction. Left gets the OPPOSITE direction.
 * SPECIAL: At south location, always use RIGHT as right's base direction.
 */
function getLetterGHDirection(
  endLocation: string,
  hand: "left" | "right",
  isRadial: boolean
): VectorDirection | null {
  const loc = endLocation.toLowerCase();

  // Special case: south always returns RIGHT as base
  if (loc === "s") {
    const baseDirection: VectorDirection = "right";
    return hand === "right" ? baseDirection : getOppositeDirection(baseDirection);
  }

  // Determine map based on cardinal vs intercardinal
  const isBox = !isCardinal(loc);

  let map: Record<GridLocation, Record<"left" | "right", VectorDirection>>;
  if (isBox) {
    map = isRadial ? BOX_RADIAL_MAP : BOX_NON_RADIAL_MAP;
  } else {
    map = isRadial ? DIAMOND_RADIAL_MAP : DIAMOND_NON_RADIAL_MAP;
  }

  const locationMap = map[loc as GridLocation];
  if (!locationMap) return null;

  // Right gets the base direction from the map
  const baseDirection = locationMap["right"];
  if (!baseDirection) return null;

  // Right gets base, left gets opposite
  return hand === "right" ? baseDirection : getOppositeDirection(baseDirection);
}

/**
 * Y/Z handler: identify which motion is shift vs non-shift.
 * Calculate direction from the SHIFT motion using shift maps.
 * If target IS the shift motion → use that direction.
 * If target is NOT the shift motion → use OPPOSITE direction.
 */
function getLetterYZDirection(
  leftMotion: BetaMotionInput,
  rightMotion: BetaMotionInput,
  targetMotion: BetaMotionInput,
  isRadial: boolean
): VectorDirection | null {
  // Identify shift vs non-shift
  const rightIsShift = isShiftMotion(rightMotion.motionType);
  const leftIsShift = isShiftMotion(leftMotion.motionType);

  const shiftMotion = rightIsShift ? rightMotion : leftIsShift ? leftMotion : null;
  if (!shiftMotion) return null;

  // Identify non-shift motion (static first, then dash)
  const findNonShift = (): BetaMotionInput | null => {
    const rightType = rightMotion.motionType.toLowerCase();
    const leftType = leftMotion.motionType.toLowerCase();
    if (rightType === "static") return rightMotion;
    if (leftType === "static") return leftMotion;
    if (rightType === "dash") return rightMotion;
    if (leftType === "dash") return leftMotion;
    return null;
  };

  const nonShiftMotion = findNonShift();
  if (!nonShiftMotion) return null;

  // Calculate direction from the shift motion
  const shiftDirection = getShiftDirection(
    shiftMotion.startLocation,
    shiftMotion.endLocation,
    shiftMotion.hand,
    isRadial
  );
  if (!shiftDirection) return null;

  // Target is the shift motion → use direction; otherwise → opposite
  const isTargetShift = targetMotion.hand === shiftMotion.hand;
  return isTargetShift ? shiftDirection : getOppositeDirection(shiftDirection);
}

/**
 * Exact routing order from BetaPropDirectionCalculator.getDirectionForMotionData().
 */
function calculateDirection(
  input: BetaOffsetInput,
  targetMotion: BetaMotionInput,
  isRadial: boolean
): VectorDirection | null {
  const { leftMotion, rightMotion, letter } = input;

  // 1. Is letter Y, Z, Y-, or Z-?
  if (letter === "Y" || letter === "Z" || letter === "Y-" || letter === "Z-") {
    return getLetterYZDirection(leftMotion, rightMotion, targetMotion, isRadial);
  }

  // 2. Is target motion a shift (pro/anti/float)?
  if (isShiftMotion(targetMotion.motionType)) {
    // 2a. Is letter G or H (NOT G- or H-)?
    if (letter === "G" || letter === "H") {
      return getLetterGHDirection(targetMotion.endLocation, targetMotion.hand, isRadial);
    }
    // 2b. Is letter I (NOT I-)?
    if (letter === "I") {
      return getLetterIDirection(targetMotion.endLocation, targetMotion.hand, isRadial);
    }
    // 2c. Both-shift pairing: when BOTH motions are shift (e.g. letter J),
    // the shift maps give independent perpendicular directions that may not oppose.
    // Fix: compute left's direction from its shift path, right gets the opposite.
    const otherMotion = targetMotion.hand === "left" ? rightMotion : leftMotion;
    if (isShiftMotion(otherMotion.motionType)) {
      const leftDirection = getShiftDirection(
        leftMotion.startLocation,
        leftMotion.endLocation,
        "left",
        isRadial
      );
      if (!leftDirection) return null;
      return targetMotion.hand === "left"
        ? leftDirection
        : getOppositeDirection(leftDirection);
    }
    // 2d. Generic shift handler (only one motion is shift)
    return getShiftDirection(
      targetMotion.startLocation,
      targetMotion.endLocation,
      targetMotion.hand,
      isRadial
    );
  }

  // 3. Static or dash → static/dash handler
  return getStaticDashDirection(targetMotion.endLocation, targetMotion.hand, isRadial);
}


/**
 * Returns { x, y } pixel offset to apply to prop position.
 *
 * Implements the exact gate sequence from PropPlacer.calculateBetaOffset()
 * (lines 130-376 of the app's PropPlacer.ts).
 */
export function calculateBetaOffset(
  input: BetaOffsetInput,
  targetMotion: BetaMotionInput
): { x: number; y: number } {
  const { leftMotion, rightMotion, gridMode } = input;

  // Gate 1: Same location check
  // If left and right don't end at same location → return {0,0}
  const leftEndLoc = leftMotion.endLocation.toLowerCase();
  const rightEndLoc = rightMotion.endLocation.toLowerCase();

  if (leftEndLoc !== rightEndLoc) {
    return { x: 0, y: 0 };
  }

  // Resolve actual prop types (settings override stored motionData.propType)
  // A user may have "staff" stored in data but render as "buugeng" via settings.
  // Hand prop type is never overridden — if stored as hand, it stays hand.
  const leftIsHand = leftMotion.propType === "hand";
  const rightIsHand = rightMotion.propType === "hand";
  const actualLeftPropType = leftIsHand
    ? "hand"
    : (input.leftPropType ?? leftMotion.propType ?? "staff");
  const actualRightPropType = rightIsHand
    ? "hand"
    : (input.rightPropType ?? rightMotion.propType ?? "staff");

  // Gate 2: Hand prop special case (PropPlacer lines 154-222)
  // When both props are hands, use direction-aware positioning.
  const bothAreHands = actualLeftPropType === "hand" && actualRightPropType === "hand";

  if (bothAreHands) {
    const distance = getBetaOffsetSize("hand", gridMode);

    const eastPositions = ["e", "ne", "se"];
    const westPositions = ["w", "nw", "sw"];

    const leftStartLoc = leftMotion.startLocation.toLowerCase();
    const rightStartLoc = rightMotion.startLocation.toLowerCase();

    const leftFromEast = eastPositions.includes(leftStartLoc);
    const leftFromWest = westPositions.includes(leftStartLoc);
    const rightFromEast = eastPositions.includes(rightStartLoc);
    const rightFromWest = westPositions.includes(rightStartLoc);

    if (leftFromEast && rightFromWest) {
      // Left approaching from east → RIGHT, right from west → LEFT
      return targetMotion.hand === "left"
        ? { x: distance, y: 0 }
        : { x: -distance, y: 0 };
    } else if (leftFromWest && rightFromEast) {
      // Left approaching from west → LEFT, right from east → RIGHT
      return targetMotion.hand === "left"
        ? { x: -distance, y: 0 }
        : { x: distance, y: 0 };
    } else {
      // Default: left LEFT, right RIGHT
      return targetMotion.hand === "left"
        ? { x: -distance, y: 0 }
        : { x: distance, y: 0 };
    }
  }

  // Gate 3: Hybrid orientation skip (PropPlacer lines 231-250)
  // Check each prop's end orientation independently.
  // If one is radial and one is nonRadial → return {0,0}.
  // This check is SYMMETRIC (unlike OrientationChecker used later for maps).
  const leftEndOri = leftMotion.endOrientation;
  const rightEndOri = rightMotion.endOrientation;

  const leftIsRadial = isRadialOrientation(leftEndOri);
  const rightIsRadial = isRadialOrientation(rightEndOri);
  const leftIsNonRadial = isNonRadialOrientation(leftEndOri);
  const rightIsNonRadial = isNonRadialOrientation(rightEndOri);

  const hybridOrientation =
    (rightIsRadial && leftIsNonRadial) || (rightIsNonRadial && leftIsRadial);

  if (hybridOrientation) {
    return { x: 0, y: 0 };
  }

  // Pre-compute orientation relationships for gates 4-6
  const bothRadial = rightIsRadial && leftIsRadial;
  const bothNonRadial = rightIsNonRadial && leftIsNonRadial;
  const sameTypeButDifferentOrientation =
    (bothRadial && rightEndOri?.toLowerCase() !== leftEndOri?.toLowerCase()) ||
    (bothNonRadial && rightEndOri?.toLowerCase() !== leftEndOri?.toLowerCase());

  // Gate 4: Buugeng family nesting (PropPlacer lines 274-290)
  // If both props are buugeng family AND have opposite chirality → return {0,0}
  const bothAreBuugengFamily =
    isBuugengFamilyProp(actualLeftPropType) &&
    isBuugengFamilyProp(actualRightPropType);

  if (bothAreBuugengFamily) {
    const leftChirality = input.leftBuugengFlipped ?? false;
    const rightChirality = input.rightBuugengFlipped ?? false;
    const oppositeChirality = leftChirality !== rightChirality; // XOR

    if (oppositeChirality) {
      return { x: 0, y: 0 };
    }
  }

  // Gate 5: Unilateral prop skip (PropPlacer lines 292-303)
  // Same orientation TYPE but different specific orientations AND unilateral
  // → return {0,0}
  const actualPropType =
    targetMotion.hand === "left" ? actualLeftPropType : actualRightPropType;

  if (sameTypeButDifferentOrientation && isUnilateralProp(actualPropType)) {
    return { x: 0, y: 0 };
  }

  // Gate 6: Trigeng skip (PropPlacer lines 308-310)
  // Same type different orientation AND prop type is "trigeng" → return {0,0}
  if (sameTypeButDifferentOrientation && actualPropType === "trigeng") {
    return { x: 0, y: 0 };
  }

  // Direction Calculation (BetaPropDirectionCalculator)
  // Uses the ASYMMETRIC OrientationChecker for map selection (known parity bug).
  const isRadial = isRadialForMapSelection(leftEndOri, rightEndOri);
  const direction = calculateDirection(input, targetMotion, isRadial);

  if (!direction) {
    return { x: 0, y: 0 };
  }

  const distance = getBetaOffsetSize(actualPropType, gridMode);
  return directionToOffset(direction, distance);
}
