/**
 * Partial Sequence Generator (Stub)
 *
 * Generates partial sequences constrained to end at a specific placement,
 * which is the prerequisite for LOOP execution. The partial sequence is
 * the "seed" that gets transformed (rotated, mirrored, etc.) by the
 * LOOP executors.
 *
 * This is a complex service in the app that depends on:
 * - ILetterQueryHandler (loads all pictograph variations)
 * - IPictographFilter (filters by continuity, rotation, etc.)
 * - IStepConverter (converts pictograph data to StepData)
 * - ITurnManager (allocates and sets turns)
 * - IOrientationCalculator (updates orientations)
 * - IArrowPositioningOrchestrator (calculates arrow placements)
 * - ILOOPParameterProvider (allocates turns, determines rotation directions)
 *
 * Full implementation will be wired in Chunk 4 when the unified builder
 * integrates this with the constrained builder. For now, the interface
 * and shape are preserved so downstream code can reference it.
 *
 * Ported interface from app's PartialSequenceGenerator.ts.
 */

import type { SequenceStep } from "../../core/types/sequence-engine-types.js";
import type { Period } from "../loop-types.js";

/**
 * Options for partial sequence generation.
 * Mirrors the subset of GenerationOptions the app uses.
 */
export interface PartialSequenceOptions {
  /** Target total steps for the full LOOP (before slicing) */
  length: number;
  /** Grid mode for placement lookups */
  gridMode: "box" | "diamond";
  /** Turn intensity (1-3) */
  turnIntensity?: number;
  /** Difficulty level (1-3) */
  difficulty?: number;
  /** Prop continuity setting */
  propContinuity?: "continuous" | "non-continuous";
  /** LOOP type being generated (affects word length calculation) */
  loopType?: string;
}

/**
 * Interface for partial sequence generation.
 *
 * Implementations generate a sequence of steps that starts at startPos
 * and ends at endPos (or any placement if endPos is null). The result
 * includes a start-placement step (stepNumber 0) followed by the generated steps.
 */
export interface IPartialSequenceGenerator {
  generatePartialSequence(
    startPos: string,
    endPos: string | null,
    period: Period,
    options: PartialSequenceOptions
  ): Promise<SequenceStep[]>;
}

/**
 * Stub implementation that throws an error explaining the dependency.
 * Will be replaced with a real implementation in Chunk 4 when the
 * unified builder is created.
 */
export class PartialSequenceGenerator implements IPartialSequenceGenerator {
  async generatePartialSequence(
    _startPos: string,
    _endPos: string | null,
    _period: Period,
    _options: PartialSequenceOptions
  ): Promise<SequenceStep[]> {
    throw new Error(
      "PartialSequenceGenerator is a stub. " +
        "Full implementation requires integration with the constrained builder (Chunk 4). " +
        "Use the app's PartialSequenceGenerator for now."
    );
  }
}

export const partialSequenceGenerator = new PartialSequenceGenerator();
