/**
 * Beta Swap Handler
 * Toggles the betaSwapped flag on a step, flipping which hand gets which
 * side of the beta offset when both hands end at the same grid location.
 */

import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { ICreateModuleState } from "../../types/create-module-types";
import { createComponentLogger } from "$lib/shared/utils/debug-logger";
import { getStepDataFromState, START_PLACEMENT_BEAT_NUMBER } from "./step-data-helpers";

const logger = createComponentLogger("BetaSwapHandler");

export function toggleBetaSwap(
  stepNumber: number,
  createModuleState: ICreateModuleState
): void {
  if (stepNumber === START_PLACEMENT_BEAT_NUMBER) {
    logger.warn("Cannot toggle beta swap for start placement");
    return;
  }

  const stepData = getStepDataFromState(stepNumber, createModuleState);

  if (!stepData) {
    logger.warn("Cannot toggle beta swap - no step data available");
    return;
  }

  const updatedStepData = {
    ...stepData,
    betaSwapped: !stepData.betaSwapped,
  };

  const currentSequence: SequenceData | null =
    createModuleState.sequenceState.currentSequence;

  if (!currentSequence) {
    logger.warn("Cannot toggle beta swap - no current sequence");
    return;
  }

  const arrayIndex = stepNumber - 1;
  const updatedSteps = [...currentSequence.steps];
  updatedSteps[arrayIndex] = updatedStepData;

  const updatedSequence: SequenceData = {
    ...currentSequence,
    steps: updatedSteps,
  };

  logger.log(`Toggled beta swap on step ${stepNumber} to ${!stepData.betaSwapped}`);

  // D4 skip: betaSwapped only flips which hand renders on which side of a
  // beta-offset overlap — a rendering disambiguation flag, not motion
  // structure — no certificate invalidation needed.
  createModuleState.sequenceState.setCurrentSequence(updatedSequence);
}
