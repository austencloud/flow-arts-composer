import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import type { Period } from "../domain/models/circular-models";

/**
 * Common interface for all LOOP executors
 *
 * Provides a consistent contract for executing Linked Orbital Offset Patterns
 * regardless of the specific transformation type (rotated, mirrored, swapped, etc.)
 *
 * NOTE: Some executors only support halved mode (mirrored, swapped, inverted)
 * and will ignore the period parameter, but it must still be provided for interface consistency.
 */
export interface ILOOPExecutor {
  /**
   * Execute the LOOP transformation on a partial sequence
   *
   * @param sequence - The partial sequence to complete (must include start placement at index 0)
   * @param period - Whether to use halved (180°) or quartered (90°) transformation
   *                    Note: Some executors only support halved and will ignore this parameter
   * @returns The complete circular sequence with all steps
   */
  executeLOOP(sequence: StepData[], period: Period): StepData[];
}
