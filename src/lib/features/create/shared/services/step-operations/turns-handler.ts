/**
 * Turns Handler
 * Handles beat turns updates including float conversion and rotation direction auto-assignment.
 */

import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import type { StartPlacementData } from "$lib/shared/foundation/domain/models/start-placement-data";
import { createStartPlacementData } from "$lib/shared/create/factories/create-start-placement-data";
import type { ICreateModuleState } from "../../types/create-module-types";
import {
  createMotionData,
  isVisibleMotion,
  type MotionData,
} from "$lib/shared/pictograph/shared/domain/models/motion-data";
import type {
  HandSide} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import {
  MotionType,
  RotationDirection,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { reversalDetector } from "$lib/shared/create/services/reversal-detector";
import { calculateEndOrientation } from "$lib/shared/pictograph/prop/services/orientation-calculator";
import { createComponentLogger } from "$lib/shared/utils/debug-logger";
import {
  getStepDataFromState,
  START_PLACEMENT_BEAT_NUMBER,
} from "./step-data-helpers";
import { calculatePropagatedSteps } from "./orientation-handler";
import {
  withLoopCertificateCleared,
  invalidateLoopDisplayCache,
} from "$lib/shared/create/services/loop-certificate";

const logger = createComponentLogger("TurnsHandler");

/**
 * Update turns for a specific prop color in a beat
 * Handles float conversion and auto-rotation direction assignment
 */
export function updateStepTurns(
  stepNumber: number,
  color: string,
  turnAmount: number | "fl",
  createModuleState: ICreateModuleState
): void {
  const stepData = getStepDataFromState(stepNumber, createModuleState);

  if (!stepData?.motions) {
    logger.warn("Cannot update turns - no step data available");
    return;
  }

  const currentMotion: MotionData | undefined =
    stepData.motions[color as HandSide];
  if (!currentMotion) {
    logger.warn(`No motion data for ${color}`);
    return;
  }

  const currentTurns = currentMotion.turns;

  // Detect float conversion scenarios
  const isConvertingToFloat = currentTurns !== "fl" && turnAmount === "fl";
  const isConvertingFromFloat = currentTurns === "fl" && turnAmount !== "fl";

  // Initialize updated motion properties
  let updatedMotionType = currentMotion.motionType;
  let updatedRotationDirection = currentMotion.rotationDirection;
  let updatedPrefloatMotionType = currentMotion.prefloatMotionType;
  let updatedPrefloatRotationDirection =
    currentMotion.prefloatRotationDirection;

  // Handle float conversion
  if (isConvertingToFloat) {
    updatedPrefloatMotionType = currentMotion.motionType;
    updatedPrefloatRotationDirection = currentMotion.rotationDirection;
    updatedMotionType = MotionType.FLOAT;
    updatedRotationDirection = RotationDirection.NO_ROTATION;
    logger.log(
      `Converting to float: storing prefloat state (motionType=${updatedPrefloatMotionType}, rotationDirection=${updatedPrefloatRotationDirection})`
    );
  } else if (isConvertingFromFloat) {
    if (currentMotion.prefloatMotionType) {
      updatedMotionType = currentMotion.prefloatMotionType;
    }
    if (currentMotion.prefloatRotationDirection) {
      updatedRotationDirection = currentMotion.prefloatRotationDirection;
    }
    logger.log(
      `Converting from float: restoring motion state (motionType=${updatedMotionType}, rotationDirection=${updatedRotationDirection})`
    );
  } else {
    // CRITICAL: Auto-assign rotation direction for DASH/STATIC motions (legacy behavior)
    // This matches legacy json_turns_updater.py lines 43-47 and 67-70
    const isDashOrStatic =
      updatedMotionType === MotionType.DASH ||
      updatedMotionType === MotionType.STATIC;

    if (isDashOrStatic) {
      if (
        typeof turnAmount === "number" &&
        turnAmount > 0 &&
        currentMotion.rotationDirection === RotationDirection.NO_ROTATION
      ) {
        const steps = createModuleState.sequenceState.currentSequence?.steps;
        updatedRotationDirection = steps
          ? findPreviousRotationDirection(steps, stepNumber, color as HandSide)
          : RotationDirection.CLOCKWISE;
        logger.log(
          `Auto-assigned ${updatedRotationDirection} rotation to ${updatedMotionType} motion with ${turnAmount} turns`
        );
      } else if (turnAmount === 0) {
        updatedRotationDirection = RotationDirection.NO_ROTATION;
      }
    }
  }

  // Recalculate endOrientation based on new turn amount and updated rotation direction
  const tempMotionData = createMotionData({
    ...currentMotion,
    turns: turnAmount,
    rotationDirection: updatedRotationDirection,
    motionType: updatedMotionType,
  });
  const newEndOrientation = calculateEndOrientation(
    tempMotionData,
    color as HandSide
  );

  // Create updated step data
  const updatedStepData = {
    ...stepData,
    motions: {
      ...stepData.motions,
      [color]: {
        ...currentMotion,
        turns: turnAmount,
        motionType: updatedMotionType,
        rotationDirection: updatedRotationDirection,
        prefloatMotionType: updatedPrefloatMotionType,
        prefloatRotationDirection: updatedPrefloatRotationDirection,
        endOrientation: newEndOrientation,
      },
    },
  };

  // Get current sequence and start placement for propagation calculation
  const currentSequence: SequenceData | null =
    createModuleState.sequenceState.currentSequence;
  const startPlacement: StartPlacementData | null = createModuleState.sequenceState
    .selectedStartPlacement ?? null;

  if (!currentSequence) {
    logger.warn("Cannot update beat - no current sequence");
    return;
  }

  // Build the updated sequence with the beat update + propagated orientations
  let updatedSequence = currentSequence;
  let updatedStartPlacement: StartPlacementData | null = startPlacement;

  if (stepNumber === START_PLACEMENT_BEAT_NUMBER) {
    // Create updated start placement with new motions
    updatedStartPlacement = startPlacement
      ? createStartPlacementData({
          ...startPlacement,
          motions: updatedStepData.motions,
        })
      : null;
    logger.log(
      `Updated start placement ${color} turns to ${turnAmount} (rotationDirection: ${updatedRotationDirection}, endOrientation: ${newEndOrientation})`
    );

    const propagatedSteps = calculatePropagatedSteps(
      stepNumber,
      color,
      currentSequence,
      updatedStartPlacement
    );

    updatedSequence = {
      ...currentSequence,
      steps: propagatedSteps,
    };
  } else {
    const arrayIndex = stepNumber - 1;
    const updatedSteps = [...currentSequence.steps];
    updatedSteps[arrayIndex] = updatedStepData;

    logger.log(
      `Updated beat ${stepNumber} ${color} turns to ${turnAmount} (rotationDirection: ${updatedRotationDirection}, endOrientation: ${newEndOrientation})`
    );

    const propagatedSteps = calculatePropagatedSteps(
      stepNumber,
      color,
      { ...currentSequence, steps: updatedSteps },
      startPlacement
    );

    updatedSequence = {
      ...currentSequence,
      steps: propagatedSteps,
    };
  }

  // Process reversals to update reversal indicators after turns change
  // Turns changes can affect reversals when rotation direction changes (e.g., 0 to >0 turns)
  try {
    updatedSequence = reversalDetector.processReversals(updatedSequence);
  } catch {
    // Reversal service is optional - continue without reversal processing
  }

  createModuleState.sequenceState.setCurrentSequence(
    withLoopCertificateCleared(updatedSequence)
  );
  invalidateLoopDisplayCache();
}

export function findPreviousRotationDirection(
  steps: readonly StepData[],
  stepNumber: number,
  color: HandSide
): RotationDirection {
  for (let i = stepNumber - 2; i >= 0; i--) {
    const motion = steps[i]?.motions?.[color];
    // Invisible placeholder = hand not really there (both-required Step shape).
    if (isVisibleMotion(motion) && motion.rotationDirection !== RotationDirection.NO_ROTATION) {
      return motion.rotationDirection;
    }
  }
  return RotationDirection.CLOCKWISE;
}
