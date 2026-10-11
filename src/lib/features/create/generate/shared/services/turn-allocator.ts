/**
 * Turn Allocation Calculator Implementation
 *
 * Calculates turn distribution across steps.
 * Extracted from SequenceGenerationService for single responsibility.
 */
import type { TurnAllocation } from "#lib/shared/create/domain/generator-contract-types.js";
import type { LOOPParameterProvider } from "#lib/features/create/generate/shared/services/loop-parameter-provider.js";

export class TurnAllocator {
  constructor(private loopParams: LOOPParameterProvider) {}

  /**
   * Allocate turns for the sequence
   */
  async allocateTurns(
    stepsToGenerate: number,
    level: number,
    turnIntensity: number
  ): Promise<TurnAllocation> {
    return this.loopParams.allocateTurns(stepsToGenerate, level, turnIntensity);
  }
}

import { loopParameterProvider } from "./loop-parameter-provider";

export const turnAllocator = new TurnAllocator(loopParameterProvider);
