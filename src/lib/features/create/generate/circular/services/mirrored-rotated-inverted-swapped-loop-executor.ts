/**
 * Mirrored Rotated Inverted Swapped LOOP Executor
 *
 * Executes the mirrored-rotated-inverted-swapped LOOP (Linked Orbital Offset Pattern) by composing
 * FOUR LOOP operations sequentially:
 * 1. ROTATED: Apply strict rotation with user-selected slice size (halved or quartered)
 * 2. MIRRORED + SWAPPED + INVERTED: Apply all three transformations together
 *    - MIRRORED: Mirror locations vertically
 *    - SWAPPED: Blue does what Red did, Red does what Blue did
 *    - INVERTED: Flip letters (A↔B), flip motion types (PRO↔ANTI)
 *    - **Rotation Direction**: PRESERVED (all three transformations together keep rotation the same)
 *
 * Examples:
 *
 * HALVED mode (16-count sequence):
 * - Generate 4 letters (16 ÷ 4)
 * - Rotation (halved) → 8 letters (4 × 2, returns to home)
 * - Mirrored+Swapped+Inverted → 16 letters (8 × 2, with all transformations)
 *
 * QUARTERED mode (16-count sequence):
 * - Generate 2 letters (16 ÷ 8)
 * - Rotation (quartered) → 8 letters (2 × 4, returns to home)
 * - Mirrored+Swapped+Inverted → 16 letters (8 × 2, with all transformations)
 *
 * IMPORTANT: Supports both halved and quartered slice sizes
 * IMPORTANT: End placement for generation must match the rotation requirement
 * IMPORTANT: After rotation, sequence returns to home, which is valid for mirrored-swapped-inverted
 */

import { Period } from "../domain/models/circular-models";
import type { ILOOPExecutor } from "./ILOOPExecutor";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";

export class MirroredRotatedInvertedSwappedLOOPExecutor implements ILOOPExecutor {
  constructor(
    private readonly strictRotatedExecutor: ILOOPExecutor,
    private readonly mirroredSwappedInvertedExecutor: ILOOPExecutor
  ) {}

  /**
   * Execute the mirrored-rotated-inverted-swapped LOOP by composing rotation + mirrored+swapped+inverted
   *
   * @param sequence - The partial sequence to complete (must include start placement at index 0)
   * @param period - The slice size for rotation (halved or quartered)
   * @returns The complete circular sequence with all steps
   */
  executeLOOP(sequence: StepData[], period: Period): StepData[] {
    // Step 1: Apply ROTATED with user-selected slice size
    // HALVED: doubles the sequence (e.g., 4 steps → 8 steps)
    // QUARTERED: quadruples the sequence (e.g., 2 steps → 8 steps)
    // Returns to home placement in both cases
    const rotatedSequence = this.strictRotatedExecutor.executeLOOP(
      sequence,
      period
    );

    // Step 2: Apply MIRRORED + SWAPPED + INVERTED to the rotated sequence
    // This doubles the sequence using all three transformations:
    // - Swaps hand roles (Blue ↔ Red)
    // - Flips letters (A ↔ B)
    // - Flips motion types (PRO ↔ ANTI)
    // - Mirrors locations vertically
    // - **Rotation directions PRESERVED** (SWAP + INVERTED + MIRRORED together preserve rotation)
    // For example: 8 steps → 16 steps final
    const finalSequence = this.mirroredSwappedInvertedExecutor.executeLOOP(
      rotatedSequence,
      Period.HALVED // Not actually used by this executor, but passed for consistency
    );

    return finalSequence;
  }
}

import { strictRotatedLOOPExecutor } from "./strict-rotated-loop-executor";
import { mirroredSwappedInvertedLOOPExecutor } from "./mirrored-swapped-inverted-loop-executor";

export const mirroredRotatedInvertedSwappedLOOPExecutor = new MirroredRotatedInvertedSwappedLOOPExecutor(
  strictRotatedLOOPExecutor,
  mirroredSwappedInvertedLOOPExecutor
);
