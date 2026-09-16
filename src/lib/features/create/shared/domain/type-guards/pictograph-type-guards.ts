/**
 * Type Guards for Pictograph Data
 *
 * Utilities to distinguish between StepData and StartPlacementData at runtime.
 * These enable TypeScript to narrow union types and enforce type safety.
 */

import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import type { StartPlacementData } from "$lib/shared/foundation/domain/models/start-placement-data";
import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";

/**
 * Union type for all pictograph-based data structures
 */
export type StepOrStartPlacement = StepData | StartPlacementData;

/**
 * Type guard: Check if data is StartPlacementData
 *
 * Checks for the presence of isStartPlacement discriminator OR stepNumber === 0 (legacy)
 */
export function isStartPlacement(
  data: PictographData | StepData | StartPlacementData | unknown
): data is StartPlacementData {
  if (!data || typeof data !== "object") {
    return false;
  }

  const obj = data as Record<string, unknown>;

  // Primary check: Type discriminator field
  if (obj.isStartPlacement === true) {
    return true;
  }

  // Fallback check: Legacy stepNumber === 0 pattern
  // This supports old data before migration is complete
  if ("stepNumber" in obj && obj.stepNumber === 0) {
    return true;
  }

  return false;
}

/**
 * Type guard: Check if data is StepData
 *
 * Checks for stepNumber >= 1 (the isStep discriminator was retired — steps
 * are identified structurally by stepNumber).
 */
export function isStep(
  data: PictographData | StepData | StartPlacementData | unknown
): data is StepData {
  if (!data || typeof data !== "object") {
    return false;
  }

  const obj = data as Record<string, unknown>;

  if (
    "stepNumber" in obj &&
    typeof obj.stepNumber === "number" &&
    obj.stepNumber >= 1
  ) {
    return true;
  }

  return false;
}

/**
 * Type guard: Check if data is either a beat or start placement
 *
 * Useful for validating that data is one of our known types
 */
export function isStepOrStartPlacement(
  data: unknown
): data is StepOrStartPlacement {
  return isStartPlacement(data) || isStep(data);
}

/**
 * Assertion: Throw if data is not StartPlacementData
 */
export function assertIsStartPlacement(
  data: unknown
): asserts data is StartPlacementData {
  if (!isStartPlacement(data)) {
    throw new Error(
      `Expected StartPlacementData but got ${typeof data}. Data: ${JSON.stringify(data)}`
    );
  }
}

/**
 * Assertion: Throw if data is not StepData
 */
export function assertIsBeat(data: unknown): asserts data is StepData {
  if (!isStep(data)) {
    throw new Error(
      `Expected StepData but got ${typeof data}. Data: ${JSON.stringify(data)}`
    );
  }
}
