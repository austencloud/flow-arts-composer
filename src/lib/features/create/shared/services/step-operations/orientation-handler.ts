/**
 * Orientation Handler
 * Handles beat orientation updates and propagation through the sequence.
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
import type { HandSide } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { calculateEndOrientation } from "$lib/shared/pictograph/prop/services/orientation-calculator";
import { createComponentLogger } from "$lib/shared/utils/debug-logger";
import {
  getStepDataFromState,
  START_PLACEMENT_BEAT_NUMBER,
} from "./step-data-helpers";
import {
  withLoopCertificateCleared,
  invalidateLoopDisplayCache,
} from "$lib/shared/create/services/loop-certificate";

const logger = createComponentLogger("OrientationHandler");

/**
 * Update orientation for a specific prop color in a beat
 */
export function updateStepOrientation(
  stepNumber: number,
  color: string,
  orientation: string,
  createModuleState: ICreateModuleState
): void {
  const stepData = getStepDataFromState(stepNumber, createModuleState);

  if (!stepData?.motions) {
    logger.warn("Cannot update orientation - no step data available");
    return;
  }

  const colorKey = color as HandSide;
  const currentMotion: MotionData | undefined = stepData.motions[colorKey];
  if (!currentMotion) {
    logger.warn(`No motion data for ${color}`);
    return;
  }

  // Recalculate endOrientation for this beat based on its turns/motion type

  const tempMotionData = createMotionData({
    ...currentMotion,
    startOrientation: orientation as MotionData["startOrientation"],
  });

  const newEndOrientation = calculateEndOrientation(
    tempMotionData,
    colorKey
  );

  // Create updated step data with new startOrientation and recalculated endOrientation
  const updatedStepData: StepData = {
    ...stepData,
    motions: {
      ...stepData.motions,
      [colorKey]: {
        ...currentMotion,
        startOrientation: orientation as MotionData["startOrientation"],
        endOrientation: newEndOrientation,
      },
    },
  };

  // Get current sequence and start placement for propagation calculation
  const currentSequence: SequenceData | null =
    createModuleState.sequenceState.currentSequence;
  const startPlacement: StartPlacementData | null = createModuleState.sequenceState
    .selectedStartPlacement ?? null;

  // For start placement (beat 0), we can update even without a sequence
  // For regular steps, we need a sequence to update
  if (!currentSequence && stepNumber !== START_PLACEMENT_BEAT_NUMBER) {
    logger.warn("Cannot update beat orientation - no current sequence");
    return;
  }

  // Handle start placement update when no sequence exists yet
  if (stepNumber === START_PLACEMENT_BEAT_NUMBER && !currentSequence) {
    const updatedStartPlacement = startPlacement
      ? createStartPlacementData({
          ...startPlacement,
          motions: updatedStepData.motions,
        })
      : null;

    if (updatedStartPlacement) {
      createModuleState.sequenceState.setSelectedStartPlacement(updatedStartPlacement);
      logger.log(
        `Updated start placement ${color} orientation to ${orientation} (no sequence yet)`
      );
    }
    return;
  }

  // At this point, currentSequence is guaranteed non-null (early returns handled above)
  const sequence = currentSequence!;

  // Build the updated sequence with the beat update + propagated orientations
  let updatedSequence: SequenceData = sequence;
  let updatedStartPlacement: StartPlacementData | null = startPlacement;

  if (stepNumber === START_PLACEMENT_BEAT_NUMBER) {
    // Create updated start placement data with new orientation
    updatedStartPlacement = startPlacement
      ? createStartPlacementData({
          ...startPlacement,
          motions: updatedStepData.motions,
        })
      : null;
    logger.log(
      `Updated start placement ${color} orientation to ${orientation}, endOrientation to ${newEndOrientation}`
    );

    const propagatedSteps = calculatePropagatedSteps(
      stepNumber,
      color,
      sequence,
      updatedStartPlacement
    );

    updatedSequence = {
      ...sequence,
      steps: propagatedSteps,
      // Include updated start placement in the sequence so it propagates to selection state
      startPlacement: updatedStartPlacement ?? undefined,
      startingPlacement: updatedStartPlacement ?? undefined,
    };

    // CRITICAL: Also update selectedStartPlacement so the UI reflects the change
    if (updatedStartPlacement) {
      createModuleState.sequenceState.setSelectedStartPlacement(updatedStartPlacement);
    }
  } else {
    const arrayIndex = stepNumber - 1;
    const updatedSteps = [...sequence.steps];
    updatedSteps[arrayIndex] = updatedStepData;

    logger.log(
      `Updated beat ${stepNumber} ${color} orientation to ${orientation}, endOrientation to ${newEndOrientation}`
    );

    const propagatedSteps = calculatePropagatedSteps(
      stepNumber,
      color,
      { ...sequence, steps: updatedSteps },
      startPlacement
    );

    updatedSequence = {
      ...sequence,
      steps: propagatedSteps,
    };
  }

  createModuleState.sequenceState.setCurrentSequence(
    withLoopCertificateCleared(updatedSequence)
  );
  invalidateLoopDisplayCache();
}

/**
 * Calculate propagated steps without calling setCurrentSequence
 * Returns the updated steps array with all propagations applied
 * DOES NOT mutate state - caller must call setCurrentSequence
 */
export function calculatePropagatedSteps(
  startingStepNumber: number,
  color: string,
  currentSequence: SequenceData,
  startPlacement: StartPlacementData | null
): StepData[] {
  if (!currentSequence?.steps || currentSequence.steps.length === 0) {
    logger.log("No sequence steps to propagate through");
    return [...currentSequence.steps];
  }

  // Get the starting beat's endOrientation
  let previousEndOrientation: MotionData["endOrientation"] | undefined;

  if (startingStepNumber === START_PLACEMENT_BEAT_NUMBER) {
    if (startPlacement?.motions) {
      const motion: MotionData | undefined =
        startPlacement.motions[color as HandSide];
      if (motion) {
        previousEndOrientation = motion.endOrientation;
      }
    }
  } else {
    const arrayIndex = startingStepNumber - 1;
    const startingBeat: StepData | undefined =
      currentSequence.steps[arrayIndex];
    if (startingBeat?.motions) {
      const motion: MotionData | undefined =
        startingBeat.motions[color as HandSide];
      if (motion) {
        previousEndOrientation = motion.endOrientation;
      }
    }
  }

  if (!previousEndOrientation) {
    logger.warn(
      `Cannot propagate - no endOrientation found for beat ${startingStepNumber} ${color}`
    );
    return [...currentSequence.steps];
  }

  // Propagate through subsequent steps
  const updatedSteps: StepData[] = [...currentSequence.steps];
  const propagationStartIndex =
    startingStepNumber === START_PLACEMENT_BEAT_NUMBER ? 0 : startingStepNumber;

  logger.log(
    `🔄 Propagating ${color} orientations starting from beat ${startingStepNumber} (endOrientation: ${previousEndOrientation})`
  );

  for (let i = propagationStartIndex; i < updatedSteps.length; i++) {
    const beat = updatedSteps[i];
    if (!beat) continue;

    // Runtime safety check - motions should always exist but validate to be safe
     
    if (!beat.motions) {
      logger.warn(`No motions data at beat ${i + 1}, stopping propagation`);
      break;
    }

    const beatMotion: MotionData | undefined =
      beat.motions[color as HandSide];
    // Invisible placeholder = hand not really there (both-required Step
    // shape): keep breaking the propagation chain at blank/one-hand beats.
    if (!isVisibleMotion(beatMotion)) {
      logger.warn(
        `No motion data for ${color} at beat ${i + 1}, stopping propagation`
      );
      break;
    }

    // Recalculate this beat's endOrientation
    const tempMotionData = createMotionData({
      ...beatMotion,
      startOrientation: previousEndOrientation,
    });

    const newEndOrientation = calculateEndOrientation(
      tempMotionData,
      color as HandSide
    );

    // Update this beat's startOrientation and endOrientation
    const updatedMotion: MotionData = {
      ...beatMotion,
      startOrientation: previousEndOrientation,
      endOrientation: newEndOrientation,
    };

    updatedSteps[i] = {
      ...beat,
      motions: {
        ...beat.motions,
        [color]: updatedMotion,
      },
    };

    logger.log(
      `  ✓ Beat ${i + 1}: startOri=${previousEndOrientation} → endOri=${newEndOrientation}`
    );

    previousEndOrientation = newEndOrientation;
  }

  logger.success(
    `✅ Calculated propagation for ${color} orientations through ${updatedSteps.length - propagationStartIndex} steps`
  );

  return updatedSteps;
}
