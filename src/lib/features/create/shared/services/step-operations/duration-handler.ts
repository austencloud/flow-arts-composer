/**
 * Duration Handler
 * Handles beat duration updates for the musical subdivision system.
 * Duration is a beat-level property (not per-color like turns).
 */

import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { ICreateModuleState } from "../../types/create-module-types";
import { createComponentLogger } from "$lib/shared/utils/debug-logger";
import { getStepDataFromState, START_PLACEMENT_BEAT_NUMBER } from "./step-data-helpers";
import {
  withLoopCertificateCleared,
  invalidateLoopDisplayCache,
} from "$lib/shared/create/services/loop-certificate";

const logger = createComponentLogger("DurationHandler");

/** Minimum duration (1 beat) - a pictograph is fundamentally square, can only stretch wider */
export const MIN_DURATION = 1.0;

/** Maximum duration supported by duration patterns and proportional timing */
export const MAX_DURATION = 10.0;

/** Fine step size (0.1 beat) */
export const DURATION_STEP_FINE = 0.1;

/** Coarse step size (½ beat) */
export const DURATION_STEP_COARSE = 0.5;

/** Minimum precision for duration rounding (hundredths) */
export const DURATION_PRECISION = 0.01;

/**
 * Update duration for a beat
 * @param stepNumber - The beat number (1-based, 0 = start placement which doesn't have duration)
 * @param newDuration - The new duration value (will be clamped to valid range)
 * @param createModuleState - The create module state for accessing/updating sequence
 */
export function updateStepDuration(
  stepNumber: number,
  newDuration: number,
  createModuleState: ICreateModuleState
): void {
  // Start placement doesn't have duration
  if (stepNumber === START_PLACEMENT_BEAT_NUMBER) {
    logger.warn("Cannot update duration for start placement");
    return;
  }

  const stepData = getStepDataFromState(stepNumber, createModuleState);

  if (!stepData) {
    logger.warn("Cannot update duration - no step data available");
    return;
  }

  // Clamp to valid range
  const clampedDuration = Math.max(MIN_DURATION, Math.min(MAX_DURATION, newDuration));

  // Round to nearest hundredth to avoid floating point noise
  const roundedDuration = Math.round(clampedDuration / DURATION_PRECISION) * DURATION_PRECISION;

  // Skip if no change
  if (stepData.duration === roundedDuration) {
    return;
  }

  const updatedStepData = {
    ...stepData,
    duration: roundedDuration,
  };

  // Get current sequence
  const currentSequence: SequenceData | null =
    createModuleState.sequenceState.currentSequence;

  if (!currentSequence) {
    logger.warn("Cannot update beat - no current sequence");
    return;
  }

  // Update the beat in the sequence
  const arrayIndex = stepNumber - 1;
  const updatedSteps = [...currentSequence.steps];
  updatedSteps[arrayIndex] = updatedStepData;

  const updatedSequence: SequenceData = {
    ...currentSequence,
    steps: updatedSteps,
  };

  logger.log(`Updated beat ${stepNumber} duration to ${roundedDuration}`);

  createModuleState.sequenceState.setCurrentSequence(
    withLoopCertificateCleared(updatedSequence)
  );
  invalidateLoopDisplayCache();
}
