/**
 * Path Shape Handler
 * Handles per-step path shape overrides (arc/linear/concave).
 * Per-hand, not per-step — blue and red can have different overrides.
 */

import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { ICreateModuleState } from "../../types/create-module-types";
import { createComponentLogger } from "$lib/shared/utils/debug-logger";
import { getStepDataFromState, START_PLACEMENT_BEAT_NUMBER } from "./step-data-helpers";
import type { HandSide } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";

const logger = createComponentLogger("PathShapeHandler");

export type PathShapeValue = "arc" | "linear" | "concave";

/**
 * Set path shape override for a specific hand in a step.
 */
export function setPathShape(
  stepNumber: number,
  color: HandSide,
  shape: PathShapeValue,
  createModuleState: ICreateModuleState
): void {
  if (stepNumber === START_PLACEMENT_BEAT_NUMBER) {
    logger.warn("Cannot set path shape on start placement");
    return;
  }

  const stepData = getStepDataFromState(stepNumber, createModuleState);
  if (!stepData?.motions) {
    logger.warn("Cannot set path shape - no step data available");
    return;
  }

  const currentMotion = stepData.motions[color];
  if (!currentMotion) {
    logger.warn(`No motion data for ${color}`);
    return;
  }

  if (currentMotion.pathShape === shape) return;

  const updatedStepData = {
    ...stepData,
    motions: {
      ...stepData.motions,
      [color]: { ...currentMotion, pathShape: shape },
    },
  };

  const currentSequence: SequenceData | null =
    createModuleState.sequenceState.currentSequence;
  if (!currentSequence) {
    logger.warn("Cannot update step - no current sequence");
    return;
  }

  const arrayIndex = stepNumber - 1;
  const updatedSteps = [...currentSequence.steps];
  updatedSteps[arrayIndex] = updatedStepData;

  logger.log(`Set beat ${stepNumber} ${color} pathShape to ${shape}`);
  // D4 skip: pathShape is the drawn curve style (arc/linear/concave) of an
  // existing motion, not motion structure itself — no certificate invalidation.
  createModuleState.sequenceState.setCurrentSequence({
    ...currentSequence,
    steps: updatedSteps,
  });
}

/**
 * Clear path shape override, reverting to global setting.
 */
export function clearPathShape(
  stepNumber: number,
  color: HandSide,
  createModuleState: ICreateModuleState
): void {
  if (stepNumber === START_PLACEMENT_BEAT_NUMBER) return;

  const stepData = getStepDataFromState(stepNumber, createModuleState);
  if (!stepData?.motions) return;

  const currentMotion = stepData.motions[color];
  if (!currentMotion) return;

  if (currentMotion.pathShape === undefined) return;

  const updatedStepData = {
    ...stepData,
    motions: {
      ...stepData.motions,
      [color]: { ...currentMotion, pathShape: undefined },
    },
  };

  const currentSequence: SequenceData | null =
    createModuleState.sequenceState.currentSequence;
  if (!currentSequence) return;

  const arrayIndex = stepNumber - 1;
  const updatedSteps = [...currentSequence.steps];
  updatedSteps[arrayIndex] = updatedStepData;

  logger.log(`Cleared beat ${stepNumber} ${color} pathShape override`);
  // D4 skip: pathShape is the drawn curve style, not motion structure — see
  // setPathShape above for the same reasoning.
  createModuleState.sequenceState.setCurrentSequence({
    ...currentSequence,
    steps: updatedSteps,
  });
}

/**
 * Get the current path shape override for a hand (undefined = using global).
 */
export function getPathShape(
  stepNumber: number,
  color: HandSide,
  createModuleState: ICreateModuleState
): PathShapeValue | undefined {
  const stepData = getStepDataFromState(stepNumber, createModuleState);
  return stepData?.motions?.[color]?.pathShape;
}
