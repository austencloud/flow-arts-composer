/**
 * Mirrored Rotated LOOP Executor
 *
 * Executes the mirrored-rotated LOOP (Linked Orbital Offset Pattern) by composing
 * two LOOP operations sequentially:
 * 1. ROTATED: Apply strict rotation with user-selected slice size (halved or quartered)
 * 2. MIRRORED: Apply vertical mirroring to double the sequence again
 *
 * Examples:
 *
 * HALVED mode (16-count sequence):
 * - Generate 4 letters (16 ÷ 4)
 * - Rotation (halved) → 8 letters (4 × 2, returns to home)
 * - Mirroring → 16 letters (8 × 2)
 *
 * QUARTERED mode (16-count sequence):
 * - Generate 2 letters (16 ÷ 8)
 * - Rotation (quartered) → 8 letters (2 × 4, returns to home)
 * - Mirroring → 16 letters (8 × 2)
 *
 * IMPORTANT: Supports both halved and quartered slice sizes
 * IMPORTANT: End placement for generation must match the rotation requirement
 */

import { Period } from "../domain/models/circular-models";
import type { ILOOPExecutor } from "./ILOOPExecutor";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import type { GridPlacement } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { VERTICAL_MIRROR_PLACEMENT_MAP } from "../domain/constants/strict-loop-placement-maps";

export class MirroredRotatedLOOPExecutor implements ILOOPExecutor {
  constructor(
    private readonly strictRotatedExecutor: ILOOPExecutor,
    private readonly strictMirroredExecutor: ILOOPExecutor
  ) {}

  /**
   * Execute the mirrored-rotated LOOP by composing rotation + mirroring
   *
   * @param sequence - The partial sequence to complete (must include start placement at index 0)
   * @param period - The slice size for rotation (halved or quartered)
   * @returns The complete circular sequence with all steps
   */
  executeLOOP(sequence: StepData[], period: Period): StepData[] {
    // Validate: mirrored-rotated composition only works when the start placement
    // is on the vertical axis (self-mirroring). After rotation returns to home,
    // the mirrored executor requires end == vertical_mirror(start). This is only
    // true when vertical_mirror(start) == start.
    const startPos = sequence[0]?.startPlacement;
    if (startPos) {
      const mirroredPos = VERTICAL_MIRROR_PLACEMENT_MAP[startPos as GridPlacement];
      if (mirroredPos && mirroredPos !== startPos) {
        throw new Error(
          `Mirrored-rotated LOOP requires a start placement on the vertical axis ` +
          `(where vertical_mirror(pos) == pos). Got ${startPos} which mirrors to ${mirroredPos}. ` +
          `Compatible placements: alpha1, alpha5, beta1, beta5.`
        );
      }
    }

    // Step 1: Apply ROTATED with user-selected slice size
    // HALVED: doubles the sequence (e.g., 4 steps → 8 steps)
    // QUARTERED: quadruples the sequence (e.g., 2 steps → 8 steps)
    // Returns to home placement in both cases
    const rotatedSequence = this.strictRotatedExecutor.executeLOOP(
      sequence,
      period
    );

    // Step 2: Apply MIRRORED to the rotated sequence
    // This always doubles the sequence using vertical mirroring
    // For example: 8 steps → 16 steps final
    const finalSequence = this.strictMirroredExecutor.executeLOOP(
      rotatedSequence,
      Period.HALVED // Not actually used by mirrored executor, but passed for consistency
    );

    return finalSequence;
  }
}

// ============================================================================
// DIRECT SINGLETON EXPORT
// ============================================================================
import { strictRotatedLOOPExecutor } from "./strict-rotated-loop-executor";
import { strictMirroredLOOPExecutor } from "./strict-mirrored-loop-executor";

export const mirroredRotatedLOOPExecutor = new MirroredRotatedLOOPExecutor(
  strictRotatedLOOPExecutor,
  strictMirroredLOOPExecutor
);
