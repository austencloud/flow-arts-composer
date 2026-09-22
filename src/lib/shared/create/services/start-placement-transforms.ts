/**
 * Start Placement Transforms
 *
 * Pure functions that transform StartPlacementData objects.
 * Similar to beat transforms but without beat-specific fields.
 *
 * Supports targetHand parameter to transform only specific hand(s):
 * - "left": Only transform left motion
 * - "right": Only transform right motion
 * - "both": Transform both motions (default, original behavior)
 */

import type { StartPlacementData } from "$lib/shared/foundation/domain/models/start-placement-data";
import { createStartPlacementData } from "$lib/shared/create/factories/create-start-placement-data";
import type { GridPlacement } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { HandSide } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { isVisibleMotion } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import { createMotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import { calculateEndOrientation } from "$lib/shared/pictograph/prop/services/orientation-calculator";
import { getGridPlacementFromLocations } from "$lib/shared/pictograph/grid/services/grid-placement-deriver";
import {
  VERTICAL_MIRROR_PLACEMENT_MAP,
  HORIZONTAL_MIRROR_PLACEMENT_MAP,
  SWAPPED_PLACEMENT_MAP,
} from "$lib/shared/create/domain/strict-loop-placement-maps";
import {
  mirrorMotion,
  flipMotion,
  rotateMotion,
  reassignMotionHand,
} from "$lib/shared/create/services/motion-transforms";
import {
  invertMotionType,
  reverseRotationDirection,
} from "$lib/shared/create/services/rotation-helpers";
import type { TargetHand } from "$lib/shared/create/state/panel-coordination-state.svelte";
import { Letter } from "$lib/shared/foundation/domain/models/letter";

/**
 * Derive the static letter (α, β, γ, ζ, η) from a grid placement.
 * Start placements always have static letters based on location. Zeta and
 * eta are the skewed-frame starts a single-hand 45° rotation lands on.
 */
function deriveLetterFromGridPlacement(
  placement: GridPlacement | null | undefined
): Letter {
  if (!placement) return Letter.ALPHA;
  const placementStr = placement.toString().toLowerCase();
  if (placementStr.startsWith("beta")) return Letter.BETA;
  if (placementStr.startsWith("gamma")) return Letter.GAMMA;
  if (placementStr.startsWith("zeta")) return Letter.ZETA;
  if (placementStr.startsWith("eta")) return Letter.ETA;
  return Letter.ALPHA;
}

/**
 * Derive grid placement from motion locations.
 * Used after single-hand transforms to find the new combined placement.
 */
function deriveGridPlacementFromMotions(
  startPos: StartPlacementData
): GridPlacement | null {
  const leftMotion = startPos.motions[HandSide.LEFT];
  const rightMotion = startPos.motions[HandSide.RIGHT];

  // Invisible placeholder = hand not really there (both-required Step shape).
  if (isVisibleMotion(leftMotion) && isVisibleMotion(rightMotion)) {
    return getGridPlacementFromLocations(
      leftMotion.startLocation,
      rightMotion.startLocation
    );
  }
  return startPos.gridPlacement ?? null;
}

/**
 * Mirror a start placement across the vertical axis (E ↔ W).
 * @param targetHand - Which hand(s) to transform. Defaults to "both".
 */
export function mirrorStartPlacement(
  startPos: StartPlacementData,
  targetHand: TargetHand = "both"
): StartPlacementData {
  const mirroredMotions = { ...startPos.motions };
  const leftMotion = startPos.motions[HandSide.LEFT];
  const rightMotion = startPos.motions[HandSide.RIGHT];

  // Transform specified hand(s)
  if ((targetHand === "left" || targetHand === "both") && leftMotion) {
    mirroredMotions[HandSide.LEFT] = mirrorMotion(leftMotion);
  }
  if ((targetHand === "right" || targetHand === "both") && rightMotion) {
    mirroredMotions[HandSide.RIGHT] = mirrorMotion(rightMotion);
  }

  // For single-hand transforms, derive new grid placement from motion locations
  // For "both", use the lookup table
  let newGridPlacement: GridPlacement | null;
  if (targetHand === "both") {
    newGridPlacement = startPos.gridPlacement
      ? VERTICAL_MIRROR_PLACEMENT_MAP[startPos.gridPlacement]
      : null;
  } else {
    const tempStartPos = createStartPlacementData({
      ...startPos,
      motions: mirroredMotions,
    });
    newGridPlacement = deriveGridPlacementFromMotions(tempStartPos);
  }

  // Derive letter from new grid placement
  const newLetter = deriveLetterFromGridPlacement(newGridPlacement);

  return createStartPlacementData({
    ...startPos,
    motions: mirroredMotions,
    gridPlacement: newGridPlacement,
    startPlacement: newGridPlacement,
    letter: newLetter,
  });
}

/**
 * Flip a start placement across the horizontal axis (N ↔ S).
 * @param targetHand - Which hand(s) to transform. Defaults to "both".
 */
export function flipStartPlacement(
  startPos: StartPlacementData,
  targetHand: TargetHand = "both"
): StartPlacementData {
  const flippedMotions = { ...startPos.motions };
  const leftMotion = startPos.motions[HandSide.LEFT];
  const rightMotion = startPos.motions[HandSide.RIGHT];

  // Transform specified hand(s)
  if ((targetHand === "left" || targetHand === "both") && leftMotion) {
    flippedMotions[HandSide.LEFT] = flipMotion(leftMotion);
  }
  if ((targetHand === "right" || targetHand === "both") && rightMotion) {
    flippedMotions[HandSide.RIGHT] = flipMotion(rightMotion);
  }

  // For single-hand transforms, derive new grid placement from motion locations
  // For "both", use the lookup table
  let newGridPlacement: GridPlacement | null;
  if (targetHand === "both") {
    newGridPlacement = startPos.gridPlacement
      ? HORIZONTAL_MIRROR_PLACEMENT_MAP[startPos.gridPlacement]
      : null;
  } else {
    const tempStartPos = createStartPlacementData({
      ...startPos,
      motions: flippedMotions,
    });
    newGridPlacement = deriveGridPlacementFromMotions(tempStartPos);
  }

  // Derive letter from new grid placement
  const newLetter = deriveLetterFromGridPlacement(newGridPlacement);

  return createStartPlacementData({
    ...startPos,
    motions: flippedMotions,
    gridPlacement: newGridPlacement,
    startPlacement: newGridPlacement,
    letter: newLetter,
  });
}

/**
 * Rotate a start placement by 45° steps.
 * Derives new gridPlacement from rotated motion locations.
 * @param targetHand - Which hand(s) to transform. Defaults to "both".
 */
export function rotateStartPlacement(
  startPos: StartPlacementData,
  rotationAmount: number,
  targetHand: TargetHand = "both"
): StartPlacementData {
  const rotatedMotions = { ...startPos.motions };
  const origLeftMotion = startPos.motions[HandSide.LEFT];
  const origRightMotion = startPos.motions[HandSide.RIGHT];

  // Transform specified hand(s)
  if ((targetHand === "left" || targetHand === "both") && origLeftMotion) {
    rotatedMotions[HandSide.LEFT] = rotateMotion(
      origLeftMotion,
      rotationAmount
    );
  }
  if ((targetHand === "right" || targetHand === "both") && origRightMotion) {
    rotatedMotions[HandSide.RIGHT] = rotateMotion(
      origRightMotion,
      rotationAmount
    );
  }

  // Derive new gridPlacement from rotated motion locations
  // This correctly handles the DIAMOND ↔ BOX mode transitions
  let rotatedGridPlacement: GridPlacement | null = startPos.gridPlacement ?? null;
  const leftMotion = rotatedMotions[HandSide.LEFT];
  const rightMotion = rotatedMotions[HandSide.RIGHT];

  if (isVisibleMotion(leftMotion) && isVisibleMotion(rightMotion)) {
    rotatedGridPlacement = getGridPlacementFromLocations(
      leftMotion.startLocation,
      rightMotion.startLocation
    );
  }

  // Derive letter from new grid placement
  const newLetter = deriveLetterFromGridPlacement(rotatedGridPlacement);

  return createStartPlacementData({
    ...startPos,
    motions: rotatedMotions,
    gridPlacement: rotatedGridPlacement,
    startPlacement: rotatedGridPlacement,
    letter: newLetter,
  });
}

/**
 * Swap hand roles in a start placement (left ↔ right).
 */
export function handSwapStartPlacement(
  startPos: StartPlacementData
): StartPlacementData {
  const origLeft = startPos.motions[HandSide.LEFT];
  const origRight = startPos.motions[HandSide.RIGHT];
  const swappedMotions = {
    [HandSide.LEFT]: origRight
      ? reassignMotionHand(origRight, HandSide.LEFT)
      : undefined,
    [HandSide.RIGHT]: origLeft
      ? reassignMotionHand(origLeft, HandSide.RIGHT)
      : undefined,
  };

  const newGridPlacement = startPos.gridPlacement
    ? SWAPPED_PLACEMENT_MAP[startPos.gridPlacement]
    : null;

  return createStartPlacementData({
    ...startPos,
    motions: swappedMotions,
    gridPlacement: newGridPlacement,
    startPlacement: newGridPlacement,
  });
}

/**
 * Invert a start placement's motion types and rotation directions.
 * Recalculates endOrientation based on the new motion.
 * @param targetHand - Which hand(s) to transform. Defaults to "both".
 */
export function invertStartPlacement(
  startPos: StartPlacementData,
  targetHand: TargetHand = "both"
): StartPlacementData {
  const invertedMotions = { ...startPos.motions };
  const startLeftMotion = startPos.motions[HandSide.LEFT];
  const startRightMotion = startPos.motions[HandSide.RIGHT];

  // Transform specified hand(s)
  if ((targetHand === "left" || targetHand === "both") && startLeftMotion) {
    const leftMotion = startLeftMotion;
    const invertedLeftMotion = createMotionData({
      ...leftMotion,
      motionType: invertMotionType(leftMotion.motionType),
      rotationDirection: reverseRotationDirection(leftMotion.rotationDirection),
    });
    const newEndOrientation = calculateEndOrientation(
      invertedLeftMotion,
      HandSide.LEFT
    );
    invertedMotions[HandSide.LEFT] = {
      ...invertedLeftMotion,
      endOrientation: newEndOrientation,
    };
  }

  if ((targetHand === "right" || targetHand === "both") && startRightMotion) {
    const rightMotion = startRightMotion;
    const invertedRightMotion = createMotionData({
      ...rightMotion,
      motionType: invertMotionType(rightMotion.motionType),
      rotationDirection: reverseRotationDirection(
        rightMotion.rotationDirection
      ),
    });
    const newEndOrientation = calculateEndOrientation(
      invertedRightMotion,
      HandSide.RIGHT
    );
    invertedMotions[HandSide.RIGHT] = {
      ...invertedRightMotion,
      endOrientation: newEndOrientation,
    };
  }

  const newGridPlacement: GridPlacement | null = startPos.gridPlacement ?? null;

  // Derive letter from grid placement
  const newLetter = deriveLetterFromGridPlacement(newGridPlacement);

  return createStartPlacementData({
    ...startPos,
    motions: invertedMotions,
    gridPlacement: newGridPlacement,
    startPlacement: newGridPlacement,
    letter: newLetter,
  });
}
