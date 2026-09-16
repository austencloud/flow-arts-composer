/**
 * Mirrored Rotated Inverted LOOP Executor
 *
 * Executes the mirrored-rotated-inverted LOOP (Linked Orbital Offset Pattern) by composing
 * THREE LOOP operations sequentially:
 * 1. ROTATED: Apply strict rotation with user-selected slice size (halved or quartered)
 * 2. INVERTED MIRRORED: Apply vertical mirroring + inverted transformation
 *    - Letters are flipped (inverted effect)
 *    - Motion types are flipped (PRO ↔ ANTI) (inverted effect)
 *    - Locations are mirrored vertically (mirrored effect)
 *    - **Rotation directions STAY THE SAME** (both transformations flip rotation, so they CANCEL OUT)
 *
 * Examples:
 *
 * HALVED mode (16-count sequence):
 * - Generate 4 letters (16 ÷ 4)
 * - Rotation (halved) → 8 letters (4 × 2, returns to home)
 * - Inverted Mirroring → 16 letters (8 × 2, with flipped motion types and letters)
 *
 * QUARTERED mode (16-count sequence):
 * - Generate 2 letters (16 ÷ 8)
 * - Rotation (quartered) → 8 letters (2 × 4, returns to home)
 * - Inverted Mirroring → 16 letters (8 × 2, with flipped motion types and letters)
 *
 * IMPORTANT: Supports both halved and quartered slice sizes
 * IMPORTANT: End placement for generation must match the rotation requirement
 * IMPORTANT: After rotation, sequence returns to home, which is valid for inverted mirror
 */

import type { StepData } from "$lib/shared/foundation/domain/models/step-data";

import { Period } from "../domain/models/circular-models";
import type { ILOOPExecutor } from "./ILOOPExecutor";

export class MirroredRotatedInvertedLOOPExecutor implements ILOOPExecutor {
  constructor(
    private readonly strictRotatedExecutor: ILOOPExecutor,
    private readonly mirroredInvertedExecutor: ILOOPExecutor
  ) {}

  /**
   * Execute the mirrored-rotated-inverted LOOP by composing rotation + inverted mirroring
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

    // Step 2: Apply MIRRORED_INVERTED to the rotated sequence
    // This doubles the sequence using inverted mirroring:
    // - Flips letters (A ↔ B)
    // - Flips motion types (PRO ↔ ANTI)
    // - Mirrors locations vertically
    // - Keeps rotation directions (both flips cancel out)
    // For example: 8 steps → 16 steps final
    const finalSequence = this.mirroredInvertedExecutor.executeLOOP(
      rotatedSequence,
      Period.HALVED // Not actually used by inverted executor, but passed for consistency
    );

    return finalSequence;
  }
}
