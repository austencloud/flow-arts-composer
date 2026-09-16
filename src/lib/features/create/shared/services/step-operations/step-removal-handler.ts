/**
 * Beat Removal Handler
 * Handles beat removal logic including clearing entire sequence when start placement is removed.
 */

import type { ICreateModuleState } from "../../types/create-module-types";
import { UndoOperationType } from "../undo-manager";
import { createComponentLogger } from "$lib/shared/utils/debug-logger";

const logger = createComponentLogger("StepRemoval");

/**
 * Remove a beat and all subsequent steps from the sequence
 */
export function removeStep(
  stepIndex: number,
  createModuleState: ICreateModuleState
): void {
  // Special case: a negative index means the start placement, and removing it
  // clears the entire sequence (steps can't exist without one). Keyed on the
  // passed index, NOT the current selection — a caller deleting step N while
  // the start placement happens to be selected must remove step N, not wipe
  // the sequence.
  if (stepIndex < 0) {
    logger.log("Removing start placement - clearing entire sequence");

    createModuleState.pushUndoSnapshot(UndoOperationType.CLEAR_SEQUENCE, {
      description: "Clear sequence (removed start placement)",
    });

    void createModuleState.sequenceState.clearSequenceCompletely();
    createModuleState.setActiveToolPanel("construct");
    return;
  }

  // Calculate how many steps will be removed (beat at index + all subsequent)
  const currentSequence = createModuleState.sequenceState.currentSequence;
  const stepsToRemove = currentSequence
    ? currentSequence.steps.length - stepIndex
    : 0;

  logger.log(
    `Removing beat ${stepIndex} and ${stepsToRemove - 1} subsequent steps`
  );

  // Push undo snapshot before removal
  createModuleState.pushUndoSnapshot(UndoOperationType.REMOVE_BEATS, {
    stepIndex,
    stepsRemoved: stepsToRemove,
    description: `Remove step ${stepIndex} and ${stepsToRemove - 1} subsequent steps`,
  });

  // Remove the beat and all subsequent steps with staggered animation
  createModuleState.sequenceState.removeStepAndSubsequentWithAnimation(
    stepIndex,
    () => {
      // After animation completes, select appropriate beat
      if (stepIndex > 0) {
        // Select the previous beat (array index stepIndex-1 has stepNumber stepIndex)
        createModuleState.sequenceState.selectStep(stepIndex);
      } else {
        // If removing beat 0 (first beat after start), select start placement
        createModuleState.sequenceState.selectStartPlacementForEditing();
      }
    }
  );
}
