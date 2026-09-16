/**
 * Beat-Pictograph Conversion Utilities
 *
 * Helper functions to convert between StepData and enhanced PictographData
 * during the transition period. These utilities ensure smooth migration
 * while maintaining backward compatibility.
 */

import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import { createStepData } from "$lib/shared/foundation/domain/factories/create-step-data";
import { createPictographData } from "../factories/create-pictograph-data";
import type { PictographData } from "../models/pictograph-data";

/**
 * Convert StepData to enhanced PictographData
 * Combines the pictograph data with beat context properties
 */
export function beatDataToPictographData(
  stepData: StepData,
  isSelected: boolean = false
): PictographData {
  // Since StepData extends PictographData, we can just return the stepData as PictographData
  // The beat context properties will be available but not enforced by the PictographData type
  return {
    ...stepData,
    isSelected,
  } as PictographData;
}

/**
 * Extract core PictographData from enhanced PictographData
 * Removes beat context properties to get pure pictograph data
 */
export function extractCorePictographData(
  enhancedData: PictographData
): PictographData {
  return createPictographData({
    id: enhancedData.id,
    letter: enhancedData.letter ?? null,
    startPlacement: enhancedData.startPlacement ?? null,
    endPlacement: enhancedData.endPlacement ?? null,
    motions: enhancedData.motions,
    // Explicitly exclude beat context properties
  });
}

/**
 * Convert enhanced PictographData back to StepData structure
 * Useful for maintaining compatibility with existing StepData-based services
 */
export function pictographDataToStepData(
  enhancedData: PictographData,
  stepId?: string
): StepData {
  // Since StepData extends PictographData, we can spread the pictograph data
  // and add the beat context properties
  const enhancedDataWithBeatContext = enhancedData as PictographData & {
    stepNumber?: number;
    duration?: number;
    leftReversal?: boolean;
    rightReversal?: boolean;
    isBlank?: boolean;
  };

  // The factory fills any missing hand with an invisible placeholder so the
  // both-required canonical Step shape holds even for one-hand pictographs.
  return createStepData({
    ...enhancedData, // Spread all PictographData properties
    id: stepId || enhancedData.id,
    stepNumber: enhancedDataWithBeatContext.stepNumber ?? 1,
    duration: enhancedDataWithBeatContext.duration ?? 1.0,
    leftReversal: enhancedDataWithBeatContext.leftReversal ?? false,
    rightReversal: enhancedDataWithBeatContext.rightReversal ?? false,
    isBlank: enhancedDataWithBeatContext.isBlank ?? false,
  });
}

/**
 * Check if PictographData has beat context properties
 * Useful for determining if data came from a beat context
 */
export function hasStepContext(data: PictographData): boolean {
  const dataWithStepContext = data as PictographData & {
    stepNumber?: number;
    duration?: number;
    leftReversal?: boolean;
    rightReversal?: boolean;
    isBlank?: boolean;
  };

  return (
    dataWithStepContext.stepNumber !== undefined ||
    dataWithStepContext.duration !== undefined ||
    dataWithStepContext.leftReversal !== undefined ||
    dataWithStepContext.rightReversal !== undefined ||
    dataWithStepContext.isBlank !== undefined
  );
}

/**
 * Create enhanced PictographData for standalone use
 * Ensures beat context properties are undefined for non-beat usage
 */
export function createStandalonePictographData(
  data: Partial<PictographData>
): PictographData {
  return createPictographData({
    id: data.id ?? "",
    letter: data.letter ?? null,
    startPlacement: data.startPlacement ?? null,
    endPlacement: data.endPlacement ?? null,
    motions: data.motions ?? {},
  });
}
