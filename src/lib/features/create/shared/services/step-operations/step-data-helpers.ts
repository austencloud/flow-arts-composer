/**
 * Beat Data Helpers
 * Shared utilities for beat operations - retrieval, constants, and common operations.
 */

import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import type { ICreateModuleState } from "../../types/create-module-types";
import { deriveWordFromBeats } from "$lib/shared/foundation/services/word-deriver";

/** Beat 0 = start placement, steps 1+ are in the sequence */
export const START_PLACEMENT_BEAT_NUMBER = 0;

/**
 * Get step data from the live sequence state
 * @returns Beat data or null/undefined if not found
 */
export function getStepDataFromState(
  stepNumber: number,
  createModuleState: ICreateModuleState
): StepData | null | undefined {
  if (stepNumber === START_PLACEMENT_BEAT_NUMBER) {
    return createModuleState.sequenceState
      .selectedStartPlacement as unknown as StepData | null;
  }

  const arrayIndex = stepNumber - 1;
  const sequence: SequenceData | null =
    createModuleState.sequenceState.currentSequence;
  return sequence?.steps[arrayIndex];
}

/**
 * Update the sequence word based on current beat letters
 */
export function updateSequenceWord(
  createModuleState: ICreateModuleState
): void {
  const sequence = createModuleState.sequenceState.currentSequence;
  if (!sequence?.steps) return;

  const word = deriveWordFromBeats(sequence.steps);

  const updatedSequence: SequenceData = {
    ...sequence,
    word,
  };

  // D4 skip: only recomputes the `word` display string from existing step
  // letters — not a motion mutation itself. Its only caller
  // (rotation-direction-handler's recalculateLetterForBeat) already invalidated
  // the certificate via the preceding (already-wrapped) `updateStep`/
  // `setCurrentSequence` call in the same tick, so `withLoopCertificateCleared`
  // would be a no-op here regardless.
  createModuleState.sequenceState.setCurrentSequence(updatedSequence);
}
