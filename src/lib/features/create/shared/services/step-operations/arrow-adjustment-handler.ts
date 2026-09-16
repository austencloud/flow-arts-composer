/**
 * Arrow Adjustment Handler
 * Persists manual arrow position adjustments to the sequence state.
 */

import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import { createStartPlacementData } from "$lib/shared/create/factories/create-start-placement-data";
import type { ICreateModuleState } from "../../types/create-module-types";
import type { HandSide } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { createComponentLogger } from "$lib/shared/utils/debug-logger";
import { getStepDataFromState, START_PLACEMENT_BEAT_NUMBER } from "./step-data-helpers";
import { UndoOperationType } from "../undo-manager";

const logger = createComponentLogger("ArrowAdjustmentHandler");

/**
 * Persist arrow adjustment to sequence state
 * Updates the manualAdjustmentX/Y values on the motion's arrowPlacementData
 */
export function updateArrowAdjustment(
  stepNumber: number,
  color: string,
  adjustmentX: number,
  adjustmentY: number,
  createModuleState: ICreateModuleState
): void {
  const stepData = getStepDataFromState(stepNumber, createModuleState);

  if (!stepData?.motions) {
    logger.warn("Cannot update arrow adjustment - no step data available");
    return;
  }

  const colorKey = color as HandSide;
  const currentMotion = stepData.motions[colorKey];
  if (!currentMotion) {
    logger.warn(`No motion data for ${color}`);
    return;
  }

  // Create updated step data with new manual adjustments
  const updatedStepData: StepData = {
    ...stepData,
    motions: {
      ...stepData.motions,
      [colorKey]: {
        ...currentMotion,
        arrowPlacementData: {
          ...currentMotion.arrowPlacementData,
          manualAdjustmentX: adjustmentX,
          manualAdjustmentY: adjustmentY,
        },
      },
    },
  };

  // Get current sequence for update
  const currentSequence = createModuleState.sequenceState.currentSequence;

  if (!currentSequence) {
    logger.warn("Cannot update arrow adjustment - no current sequence");
    return;
  }

  if (stepNumber === START_PLACEMENT_BEAT_NUMBER) {
    // Update start placement
    const startPlacement = createModuleState.sequenceState.selectedStartPlacement;
    const updatedStartPlacement = startPlacement
      ? createStartPlacementData({
          ...startPlacement,
          motions: updatedStepData.motions,
        })
      : null;

    const updatedSequence = {
      ...currentSequence,
      startPlacement: updatedStartPlacement ?? undefined,
      startingPlacement: updatedStartPlacement ?? undefined,
    };

    // D4 skip: manualAdjustmentX/Y are visual arrow-placement offsets, not
    // motion structure — no certificate invalidation needed.
    createModuleState.sequenceState.setCurrentSequence(updatedSequence);
    logger.success(
      `Updated start placement ${color} arrow adjustment to (${adjustmentX}, ${adjustmentY})`
    );
  } else {
    // Update beat in sequence
    const arrayIndex = stepNumber - 1;
    const updatedSteps = [...currentSequence.steps];
    updatedSteps[arrayIndex] = updatedStepData;

    const updatedSequence = {
      ...currentSequence,
      steps: updatedSteps,
    };

    // D4 skip: manualAdjustmentX/Y are visual arrow-placement offsets, not
    // motion structure — no certificate invalidation needed.
    createModuleState.sequenceState.setCurrentSequence(updatedSequence);
    logger.success(
      `Updated beat ${stepNumber} ${color} arrow adjustment to (${adjustmentX}, ${adjustmentY})`
    );
  }
}

/**
 * Persist complete step data with arrow adjustments
 * Used when the adjustment panel closes to save all accumulated changes
 */
export function persistBeatWithAdjustments(
  stepNumber: number,
  updatedStepData: StepData,
  createModuleState: ICreateModuleState
): void {
  const currentSequence = createModuleState.sequenceState.currentSequence;

  if (!currentSequence) {
    logger.warn("Cannot persist beat - no current sequence");
    return;
  }

  // Push undo snapshot before applying changes
  createModuleState.pushUndoSnapshot(UndoOperationType.MODIFY_BEAT_PROPERTIES, {
    stepIndex: stepNumber,
    description: `Adjust arrow positions for step ${stepNumber === START_PLACEMENT_BEAT_NUMBER ? "start placement" : stepNumber}`,
  });

  if (stepNumber === START_PLACEMENT_BEAT_NUMBER) {
    // Update start placement - get the existing start placement data to preserve its properties
    const existingStartPlacement = createModuleState.sequenceState.selectedStartPlacement;
    if (!existingStartPlacement) {
      logger.warn("Cannot persist start placement - no existing start placement");
      return;
    }

    const updatedStartPlacement = createStartPlacementData({
      ...existingStartPlacement,
      motions: updatedStepData.motions,
    });

    const updatedSequence = {
      ...currentSequence,
      startPlacement: updatedStartPlacement,
      startingPlacement: updatedStartPlacement,
    };

    // D4 skip: persists accumulated manual arrow-placement offsets, not
    // motion structure — no certificate invalidation needed.
    createModuleState.sequenceState.setCurrentSequence(updatedSequence);
    logger.success(`Persisted start placement arrow adjustments`);
  } else {
    // Update beat in sequence
    const arrayIndex = stepNumber - 1;
    const updatedSteps = [...currentSequence.steps];
    updatedSteps[arrayIndex] = updatedStepData;

    const updatedSequence = {
      ...currentSequence,
      steps: updatedSteps,
    };

    // D4 skip: persists accumulated manual arrow-placement offsets, not
    // motion structure — no certificate invalidation needed.
    createModuleState.sequenceState.setCurrentSequence(updatedSequence);
    logger.success(`Persisted beat ${stepNumber} arrow adjustments`);
  }
}
