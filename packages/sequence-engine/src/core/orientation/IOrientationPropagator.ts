/**
 * Orientation Propagator Interface
 *
 * Handles propagation of prop orientations through a sequence.
 * Each step's start orientation must equal the previous step's end orientation.
 */

import type {
  SequenceStep,
  SequenceResult,
  Orientation,
} from "../types/sequence-engine-types.js";

/**
 * Interface for orientation calculation operations.
 */
export interface IOrientationCalculator {
  /**
   * Calculate the end orientation based on motion parameters.
   * @param motionType - The type of motion (pro, anti, static, float, dash)
   * @param turns - Number of turns (0, 0.5, 1, 1.5, 2, etc.) or "fl" for float
   * @param rotationDirection - "cw" or "ccw"
   * @param startLocation - Grid location where motion starts
   * @param endLocation - Grid location where motion ends
   * @param startOrientation - Starting orientation
   * @returns The calculated end orientation
   */
  calculateEndOrientation(
    motionType: string,
    turns: number | "fl",
    rotationDirection: string,
    startLocation: string,
    endLocation: string,
    startOrientation: Orientation
  ): Orientation;
}

/**
 * Interface for propagating orientations through a sequence.
 */
export interface IOrientationPropagator {
  /**
   * Propagate orientations for a single hand through all steps.
   * Each step's start orientation = previous step's end orientation.
   * @param steps - The sequence steps (including start placement at index 0)
   * @param hand - Which motion hand to propagate ("left" or "right")
   * @param initialOrientation - The starting orientation (from step 0's end orientation)
   * @returns Updated steps with correct orientations
   */
  propagateForColor(
    steps: SequenceStep[],
    hand: "left" | "right",
    initialOrientation: Orientation
  ): SequenceStep[];

  /**
   * Recalculate all prop orientations through the entire sequence.
   * Uses the start placement (step 0) orientations as the baseline.
   * @param result - The sequence result to fix orientations on
   * @returns Updated sequence result with corrected orientations
   */
  recalculateAll(result: SequenceResult): SequenceResult;
}
