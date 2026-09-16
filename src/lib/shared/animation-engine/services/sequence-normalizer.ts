/**
 * Sequence Normalization Service
 *
 * Handles normalization of sequence data for consistent consumption by UI components.
 * Always returns StartPlacementData (never StepData) for start positions.
 */

import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import type { StartPlacementData } from "$lib/shared/foundation/domain/models/start-placement-data";

export interface NormalizedSequenceData {
  /**
   * Steps array with stepNumber >= 1 (excludes start position)
   */
  steps: readonly StepData[];

  /**
   * Start position (always StartPlacementData, never StepData)
   */
  startPlacement: StartPlacementData | null;
}
import { createStartPlacementData } from "$lib/shared/create/factories/create-start-placement-data";

/**
 * Normalize sequence data by separating start position from steps array.
 *
 * Handles three storage patterns:
 * 1. startPlacement field (modern, uses StartPlacementData)
 * 2. startingPlacement field (legacy, may need conversion)
 * 3. Mixed in steps array (oldest, stepNumber: 0)
 *
 * Always returns StartPlacementData, converting legacy StepData if needed.
 */
export function separateStepsFromStartPlacement(
  sequence: SequenceData
): NormalizedSequenceData {
  // Pattern 1: Modern approach - separate startPlacement field (already StartPlacementData)
  if (sequence.startPlacement) {
    return {
      steps: sequence.steps || [],
      startPlacement: sequence.startPlacement,
    };
  }

  // Pattern 2: Legacy approach - startingPlacement field (may need conversion)
  if (sequence.startingPlacement) {
    return {
      steps: sequence.steps || [],
      startPlacement: sequence.startingPlacement,
    };
  }

  // Pattern 3: Oldest approach - beat 0 is mixed in the steps array
  const allSteps = sequence.steps || [];

  // Find legacy start position (stepNumber === 0)
  const legacyStartPos = allSteps.find(
    (step) => step.stepNumber === 0
  ) as StepData | undefined;

  // Filter out start position from steps array (keep only actual steps)
  const steps = allSteps.filter((step) => step.stepNumber !== 0);

  // Convert legacy StepData to StartPlacementData if found
  const startPlacement: StartPlacementData | null = legacyStartPos
    ? convertStepToStartPlacement(legacyStartPos)
    : null;

  return {
    steps,
    startPlacement,
  };
}

/**
 * Convert legacy StepData (stepNumber: 0) to proper StartPlacementData
 */
function convertStepToStartPlacement(step: StepData): StartPlacementData {
  return createStartPlacementData({
    id: step.id || `start-${Date.now()}`,
    letter: step.letter ?? null,
    gridPlacement: step.endPlacement ?? step.startPlacement ?? null,
    motions: step.motions,
  });
}
