/**
 * Motion Transforms
 *
 * Pure functions that transform a single MotionData object.
 * Each function returns a new MotionData without mutating the input.
 */

import type { MotionData } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
import { createMotionData } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
import type { GridLocation } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import {
  HandPath,
  type HandSide,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import {
  VERTICAL_MIRROR_LOCATION_MAP,
  HORIZONTAL_MIRROR_LOCATION_MAP,
} from "#lib/shared/create/domain/strict-loop-placement-maps.js";
import {
  reverseRotationDirection,
  invertMotionType,
  rotateLocation,
  getToggledGridMode,
} from "#lib/shared/create/services/rotation-helpers.js";

function reverseHandPath(
  path: HandPath | null | undefined
): HandPath | null | undefined {
  if (path === HandPath.CLOCKWISE) return HandPath.COUNTER_CLOCKWISE;
  if (path === HandPath.COUNTER_CLOCKWISE) return HandPath.CLOCKWISE;
  return path;
}

export function mirrorMotion(motion: MotionData): MotionData {
  return createMotionData({
    ...motion,
    startLocation: VERTICAL_MIRROR_LOCATION_MAP[motion.startLocation],
    endLocation: VERTICAL_MIRROR_LOCATION_MAP[motion.endLocation],
    arrowLocation: VERTICAL_MIRROR_LOCATION_MAP[motion.arrowLocation],
    rotationDirection: reverseRotationDirection(motion.rotationDirection),
    handPath: reverseHandPath(motion.handPath),
  });
}

export function flipMotion(motion: MotionData): MotionData {
  return createMotionData({
    ...motion,
    startLocation: HORIZONTAL_MIRROR_LOCATION_MAP[motion.startLocation],
    endLocation: HORIZONTAL_MIRROR_LOCATION_MAP[motion.endLocation],
    arrowLocation: HORIZONTAL_MIRROR_LOCATION_MAP[motion.arrowLocation],
    rotationDirection: reverseRotationDirection(motion.rotationDirection),
    handPath: reverseHandPath(motion.handPath),
  });
}

export function rotateMotion(
  motion: MotionData,
  rotationAmount: number
): MotionData {
  const currentGridMode = motion.gridMode ?? GridMode.DIAMOND;
  const newGridMode = getToggledGridMode(currentGridMode, rotationAmount);

  const {
    arrowPlacementData: _,
    propPlacementData: __,
    ...motionWithoutPlacement
  } = motion;

  return createMotionData({
    ...motionWithoutPlacement,
    startLocation: rotateLocation(
      motion.startLocation,
      rotationAmount
    ) as GridLocation,
    endLocation: rotateLocation(
      motion.endLocation,
      rotationAmount
    ) as GridLocation,
    arrowLocation: rotateLocation(
      motion.arrowLocation,
      rotationAmount
    ) as GridLocation,
    gridMode: newGridMode,
  });
}

export function reassignMotionHand(
  motion: MotionData,
  targetHand: HandSide
): MotionData {
  return createMotionData({
    ...motion,
    hand: targetHand,
  });
}

export function invertMotion(motion: MotionData): MotionData {
  return createMotionData({
    ...motion,
    motionType: invertMotionType(motion.motionType),
    rotationDirection: reverseRotationDirection(motion.rotationDirection),
  });
}

export function rewindMotion(motion: MotionData): MotionData {
  return createMotionData({
    ...motion,
    startLocation: motion.endLocation,
    endLocation: motion.startLocation,
    startOrientation: motion.endOrientation,
    endOrientation: motion.startOrientation,
    rotationDirection: reverseRotationDirection(motion.rotationDirection),
  });
}
