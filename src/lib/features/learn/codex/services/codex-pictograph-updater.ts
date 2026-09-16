/**
 * Codex Pictograph Updater
 *
 * Transforms pictographs for the codex view:
 * - Rotate: 45° clockwise rotation, toggles grid mode
 * - Mirror: Vertical flip, reverses rotation directions
 * - Hand Swap: Swaps left and right motion data
 *
 * Uses the same transformation maps as SequenceTransformer
 */

import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
import type { MotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import {
  HandSide,
  RotationDirection,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { createMotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import { LOCATION_MAP_EIGHTH_CW } from "../../../create/generate/circular/domain/constants/circular-placement-maps";
import {
  VERTICAL_MIRROR_PLACEMENT_MAP,
  VERTICAL_MIRROR_LOCATION_MAP,
  SWAPPED_PLACEMENT_MAP,
} from "../../../create/generate/circular/domain/constants/strict-loop-placement-maps";
import type { CodexTransformationOperation } from "../domain/types/codex-types";

/**
 * Rotate all pictographs 45° clockwise
 * - Rotates all locations by 45°
 * - Toggles grid mode (DIAMOND ↔ BOX)
 */
export function rotateAllPictographs(
  pictographs: PictographData[]
): PictographData[] {
  return pictographs.map((p) => rotatePictograph(p));
}

/**
 * Mirror all pictographs vertically
 * - Mirrors all placements and locations
 * - Reverses rotation directions
 */
export function mirrorAllPictographs(
  pictographs: PictographData[]
): PictographData[] {
  return pictographs.map((p) => mirrorPictograph(p));
}

/**
 * Swap hands for all pictographs
 * - Swaps left and right motion data
 * - Updates placements based on swapped locations
 */
export function handSwapAllPictographs(
  pictographs: PictographData[]
): PictographData[] {
  return pictographs.map((p) => handSwapPictograph(p));
}

/**
 * Apply a named operation to all pictographs
 */
export function applyOperation(
  pictographs: PictographData[],
  operation: CodexTransformationOperation
): PictographData[] {
  switch (operation) {
    case "rotate":
      return rotateAllPictographs(pictographs);
    case "mirror":
      return mirrorAllPictographs(pictographs);
    case "handSwap":
      return handSwapAllPictographs(pictographs);
    default:
      console.warn(`Unknown operation: ${operation}`);
      return [...pictographs];
  }
}

/**
 * Rotate a single pictograph 45° clockwise
 */
function rotatePictograph(pictograph: PictographData): PictographData {
  const leftMotion = pictograph.motions[HandSide.LEFT];
  const rightMotion = pictograph.motions[HandSide.RIGHT];

  // Determine new grid mode (toggle DIAMOND ↔ BOX)
  const currentGridMode = leftMotion?.gridMode ?? GridMode.DIAMOND;
  const newGridMode =
    currentGridMode === GridMode.DIAMOND ? GridMode.BOX : GridMode.DIAMOND;

  const rotatedMotions: Partial<Record<HandSide, MotionData | undefined>> = {};

  // Rotate left motion
  if (leftMotion) {
    const {
      arrowPlacementData: _arrowPlacementData,
      propPlacementData: _propPlacementData,
      ...motionWithoutPlacement
    } = leftMotion;
    rotatedMotions[HandSide.LEFT] = createMotionData({
      ...motionWithoutPlacement,
      startLocation: LOCATION_MAP_EIGHTH_CW[leftMotion.startLocation],
      endLocation: LOCATION_MAP_EIGHTH_CW[leftMotion.endLocation],
      arrowLocation: LOCATION_MAP_EIGHTH_CW[leftMotion.arrowLocation],
      gridMode: newGridMode,
    });
  }

  // Rotate right motion
  if (rightMotion) {
    const {
      arrowPlacementData: _arrowPlacementData,
      propPlacementData: _propPlacementData,
      ...motionWithoutPlacement
    } = rightMotion;
    rotatedMotions[HandSide.RIGHT] = createMotionData({
      ...motionWithoutPlacement,
      startLocation: LOCATION_MAP_EIGHTH_CW[rightMotion.startLocation],
      endLocation: LOCATION_MAP_EIGHTH_CW[rightMotion.endLocation],
      arrowLocation: LOCATION_MAP_EIGHTH_CW[rightMotion.arrowLocation],
      gridMode: newGridMode,
    });
  }

  // Placements are derived from location pairs (left + right), so we keep them as-is
  // The pictograph renderer will use the rotated motion locations to position elements correctly
  // Placements like alpha1, beta3, gamma11 describe the combined state, not individual locations

  return {
    ...pictograph,
    motions: rotatedMotions,
    // Keep original placements - they describe the letter's start/end configuration
    startPlacement: pictograph.startPlacement,
    endPlacement: pictograph.endPlacement,
  };
}

/**
 * Mirror a single pictograph vertically
 */
function mirrorPictograph(pictograph: PictographData): PictographData {
  const leftMotion = pictograph.motions[HandSide.LEFT];
  const rightMotion = pictograph.motions[HandSide.RIGHT];

  const mirroredMotions: Partial<Record<HandSide, MotionData | undefined>> = {};

  // Mirror left motion
  if (leftMotion) {
    mirroredMotions[HandSide.LEFT] = {
      ...leftMotion,
      startLocation: VERTICAL_MIRROR_LOCATION_MAP[leftMotion.startLocation],
      endLocation: VERTICAL_MIRROR_LOCATION_MAP[leftMotion.endLocation],
      arrowLocation: VERTICAL_MIRROR_LOCATION_MAP[leftMotion.arrowLocation],
      rotationDirection: reverseRotationDirection(leftMotion.rotationDirection),
    };
  }

  // Mirror right motion
  if (rightMotion) {
    mirroredMotions[HandSide.RIGHT] = {
      ...rightMotion,
      startLocation: VERTICAL_MIRROR_LOCATION_MAP[rightMotion.startLocation],
      endLocation: VERTICAL_MIRROR_LOCATION_MAP[rightMotion.endLocation],
      arrowLocation: VERTICAL_MIRROR_LOCATION_MAP[rightMotion.arrowLocation],
      rotationDirection: reverseRotationDirection(
        rightMotion.rotationDirection
      ),
    };
  }

  // Mirror placements
  const mirroredStartPlacement = pictograph.startPlacement
    ? VERTICAL_MIRROR_PLACEMENT_MAP[pictograph.startPlacement]
    : pictograph.startPlacement;
  const mirroredEndPlacement = pictograph.endPlacement
    ? VERTICAL_MIRROR_PLACEMENT_MAP[pictograph.endPlacement]
    : pictograph.endPlacement;

  return {
    ...pictograph,
    motions: mirroredMotions,
    startPlacement: mirroredStartPlacement,
    endPlacement: mirroredEndPlacement,
  };
}

/**
 * Swap hands for a single pictograph
 */
function handSwapPictograph(pictograph: PictographData): PictographData {
  const leftMotion = pictograph.motions[HandSide.LEFT];
  const rightMotion = pictograph.motions[HandSide.RIGHT];

  // Swap the motions
  const swappedMotions: Partial<Record<HandSide, MotionData | undefined>> = {};

  if (rightMotion) {
    swappedMotions[HandSide.LEFT] = {
      ...rightMotion,
      hand: HandSide.LEFT,
    };
  }

  if (leftMotion) {
    swappedMotions[HandSide.RIGHT] = {
      ...leftMotion,
      hand: HandSide.RIGHT,
    };
  }

  // Swap placements using SWAPPED_PLACEMENT_MAP
  const swappedStartPlacement = pictograph.startPlacement
    ? SWAPPED_PLACEMENT_MAP[pictograph.startPlacement]
    : pictograph.startPlacement;
  const swappedEndPlacement = pictograph.endPlacement
    ? SWAPPED_PLACEMENT_MAP[pictograph.endPlacement]
    : pictograph.endPlacement;

  return {
    ...pictograph,
    motions: swappedMotions,
    startPlacement: swappedStartPlacement,
    endPlacement: swappedEndPlacement,
  };
}

/**
 * Reverse rotation direction (cw ↔ ccw)
 */
function reverseRotationDirection(
  direction: RotationDirection
): RotationDirection {
  if (direction === RotationDirection.CLOCKWISE) {
    return RotationDirection.COUNTER_CLOCKWISE;
  } else if (direction === RotationDirection.COUNTER_CLOCKWISE) {
    return RotationDirection.CLOCKWISE;
  }
  return direction; // NO_ROTATION stays the same
}
