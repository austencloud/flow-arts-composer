/**
 * Step Converter — converts PictographData to StepData and StartPlacementData.
 */

import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
import type { MotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import type { StartPlacementData } from "$lib/shared/foundation/domain/models/start-placement-data";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import type { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { GridLocation } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { createMotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import {
  MotionType,
  RotationDirection,
  Orientation,
  HandSide,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { createStepData } from "$lib/shared/foundation/domain/factories/create-step-data";
import { createStartPlacementData } from "$lib/shared/foundation/domain/factories/create-start-placement-data";

/**
 * Convert PictographData to StepData.
 */
export function convertToStep(
  pictograph: PictographData,
  stepNumber: number,
  gridMode: GridMode
): StepData {
  const motions = ensureMotionsWithGridMode(pictograph, gridMode);

  return createStepData({
    ...pictograph,
    stepNumber: stepNumber,
    duration: 1.0,
    leftReversal: false,
    rightReversal: false,
    isBlank: false,
    motions,
  });
}

/**
 * Convert PictographData to StartPlacementData.
 */
export function convertToStartPlacement(
  pictograph: PictographData,
  gridMode: GridMode
): StartPlacementData {
  const motions = ensureMotionsWithGridMode(pictograph, gridMode);

  return createStartPlacementData({
    ...pictograph,
    motions,
    gridPlacement: pictograph.startPlacement,
  });
}

function ensureMotionsWithGridMode(
  pictograph: PictographData,
  gridMode: GridMode
): Record<string, MotionData> {
  const defaultMotion: MotionData = createMotionData({
    motionType: MotionType.STATIC,
    rotationDirection: RotationDirection.NO_ROTATION,
    startLocation: GridLocation.NORTH,
    endLocation: GridLocation.NORTH,
    turns: 0,
    startOrientation: Orientation.IN,
    endOrientation: Orientation.IN,
    gridMode: gridMode,
  });

  const leftMotion = pictograph.motions[HandSide.LEFT];
  const rightMotion = pictograph.motions[HandSide.RIGHT];

  return {
    [HandSide.LEFT]: leftMotion
      ? { ...leftMotion, gridMode }
      : defaultMotion,
    [HandSide.RIGHT]: rightMotion
      ? { ...rightMotion, gridMode }
      : defaultMotion,
  };
}

/**
 * Drop-in replacement for the old singleton — keeps all constructor-injected
 * call-sites working without changes.
 */
export const stepConverter = {
  convertToStep,
  convertToStartPlacement,
};
