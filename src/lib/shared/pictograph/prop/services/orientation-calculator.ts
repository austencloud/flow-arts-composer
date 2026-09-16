/**
 * Orientation Calculator — plain function module.
 *
 * Delegates end-orientation math to the canonical calculator in
 * render/core/calculations/orientation.ts and provides pure functions
 * for propagating orientations across beats.
 */

import {
  calculateEndOrientation as calculateEndOrientationCore,
  type OrientationInput,
} from "../../../render/core/calculations/orientation";
import {
  HandSide,
  MotionType,
  Orientation,
  RotationDirection,
} from "../../shared/domain/enums/pictograph-enums";
import {
  createMotionData,
  type MotionData,
} from "../../shared/domain/models/motion-data";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import type { StartPlacementData } from "$lib/shared/foundation/domain/models/start-placement-data";
import { GridLocation } from "../../grid/domain/enums/grid-enums";
import { PropType } from "../domain/enums/prop-type";

/**
 * Calculate end orientation by delegating to the canonical calculator.
 */
export function calculateEndOrientation(
  motion: MotionData,
  _hand: HandSide
): Orientation {
  const input: OrientationInput = {
    motionType: motion.motionType as string,
    turns: motion.turns,
    rotationDirection: motion.rotationDirection as string,
    startLocation: motion.startLocation as string,
    endLocation: motion.endLocation as string,
    startOrientation: motion.startOrientation as string,
  };

  const result = calculateEndOrientationCore(input);

  if (result === null || result === undefined) {
    throw new Error(
      "Calculated end orientation cannot be None. " +
        "Please check the input data and orientation calculator."
    );
  }

  // Safe cast: canonical orientation string literals match enum runtime values
  return result as unknown as Orientation;
}

/**
 * Update start orientations — propagates previous beat's end orientations
 * to the next beat's start orientations.
 */
export function updateStartOrientations(
  nextStep: StepData,
  lastStep: StepData | StartPlacementData
): StepData {
  if (nextStep.isBlank || ("isBlank" in lastStep && lastStep.isBlank)) {
    throw new Error("Both steps must have motion data (not be blank)");
  }

  const lastLeftMotion = lastStep.motions[HandSide.LEFT];
  const lastRightMotion = lastStep.motions[HandSide.RIGHT];

  if (
    !lastLeftMotion ||
    !lastRightMotion ||
    !lastLeftMotion.endOrientation ||
    !lastRightMotion.endOrientation
  ) {
    throw new Error(
      "End orientations cannot be None. Ensure the previous beat has valid orientations."
    );
  }

  const updatedMotions = { ...nextStep.motions };

  if (updatedMotions.left) {
    updatedMotions.left = {
      ...updatedMotions.left,
      startOrientation: lastLeftMotion.endOrientation,
    };
  }

  if (updatedMotions.right) {
    updatedMotions.right = {
      ...updatedMotions.right,
      startOrientation: lastRightMotion.endOrientation,
    };
  }

  return {
    ...nextStep,
    motions: updatedMotions,
  };
}

/**
 * Update end orientations — calculates end orientations for both
 * left- and right-hand motions in a beat.
 */
export function updateEndOrientations(beat: StepData): StepData {
  if (beat.isBlank) {
    throw new Error("Beat must have motion data (not be blank)");
  }

  const updatedMotions = { ...beat.motions };

  const leftMotion = beat.motions[HandSide.LEFT];
  if (leftMotion) {
    const leftMotionData: MotionData = createMotionData({
      motionType: leftMotion.motionType || MotionType.STATIC,
      rotationDirection:
        leftMotion.rotationDirection || RotationDirection.NO_ROTATION,
      startLocation: leftMotion.startLocation || GridLocation.NORTH,
      endLocation: leftMotion.endLocation || GridLocation.NORTH,
      turns: leftMotion.turns || 0,
      startOrientation: leftMotion.startOrientation || Orientation.IN,
      endOrientation: leftMotion.endOrientation || Orientation.IN,
      isVisible: leftMotion.isVisible ?? true,
      hand: HandSide.LEFT,
      propType: PropType.STAFF,
      arrowLocation: leftMotion.startLocation || GridLocation.NORTH,
    });

    updatedMotions.left = {
      ...leftMotion,
      endOrientation: calculateEndOrientation(leftMotionData, HandSide.LEFT),
    };
  }

  const rightMotion = beat.motions[HandSide.RIGHT];
  if (rightMotion) {
    const rightMotionData: MotionData = createMotionData({
      motionType: rightMotion.motionType || MotionType.STATIC,
      rotationDirection:
        rightMotion.rotationDirection || RotationDirection.NO_ROTATION,
      startLocation: rightMotion.startLocation || GridLocation.NORTH,
      endLocation: rightMotion.endLocation || GridLocation.NORTH,
      turns: rightMotion.turns || 0,
      startOrientation: rightMotion.startOrientation || Orientation.IN,
      endOrientation: rightMotion.endOrientation || Orientation.IN,
      isVisible: rightMotion.isVisible ?? true,
      hand: HandSide.RIGHT,
      propType: PropType.STAFF,
      arrowLocation: rightMotion.startLocation || GridLocation.NORTH,
    });

    updatedMotions.right = {
      ...rightMotion,
      endOrientation: calculateEndOrientation(rightMotionData, HandSide.RIGHT),
    };
  }

  return {
    ...beat,
    motions: updatedMotions,
  };
}
