/**
 * Batch Edit Handler
 * Handles applying changes to multiple selected steps at once.
 */

import type {
  ICreateModuleState,
  BatchEditChanges,
} from "../../types/create-module-types";
import { UndoOperationType } from "../undo-manager";
import { createComponentLogger } from "#lib/shared/utils/debug-logger.js";
import {
  withLoopCertificateCleared,
  invalidateLoopDisplayCache,
} from "#lib/shared/create/services/loop-certificate.js";

const logger = createComponentLogger("BatchEdit");

export function applyBatchChanges(
  changes: BatchEditChanges,
  createModuleState: ICreateModuleState
): void {
  const selectedStepNumbers =
    createModuleState.sequenceState.selectedStepNumbers;

  if (selectedStepNumbers.size === 0) {
    logger.warn("No steps selected for batch edit");
    return;
  }

  logger.log(
    `Applying batch changes to ${selectedStepNumbers.size} steps`,
    changes
  );

  // Push undo snapshot before batch edit
  createModuleState.pushUndoSnapshot(UndoOperationType.BATCH_EDIT, {
    stepNumbers: Array.from(selectedStepNumbers),
    changes,
    description: `Batch edit ${selectedStepNumbers.size} steps`,
  });

  const currentSequence = createModuleState.sequenceState.currentSequence;
  if (!currentSequence) {
    logger.warn("No active sequence to apply batch changes");
    return;
  }

  const updatedSteps = currentSequence.steps.map((step) => {
    if (!selectedStepNumbers.has(step.stepNumber)) return step;

    const nextMotions =
      changes.motions && step.motions
        ? { ...step.motions, ...changes.motions }
        : step.motions;

    return {
      ...step,
      ...changes,
      motions: nextMotions,
    };
  });

  // D4: BatchEditChanges = Partial<StepData>, so a batch edit can carry
  // `motions` (turns, rotationDirection, etc.) across many steps at once —
  // a beat-level motion mutation, so invalidate the certificate.
  createModuleState.sequenceState.setCurrentSequence(
    withLoopCertificateCleared({
      ...currentSequence,
      steps: updatedSteps,
    })
  );
  invalidateLoopDisplayCache();

  logger.success(`Applied batch changes to ${selectedStepNumbers.size} steps`);
}
