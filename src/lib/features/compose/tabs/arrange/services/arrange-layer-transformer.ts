/**
 * arrange-layer-transformer - Applies geometric transforms to sequences
 *
 * Wraps the shared SequenceTransformer to apply rotate, mirror, flip,
 * swapHands, invert, and rewind transforms to arrange grid layers.
 */

import type { TransformResult } from "./types";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { TransformType } from "#lib/shared/animation-engine/domain/compose-types.js";
import { sequenceTransformer } from "#lib/features/create/shared/services/sequence-transforms/sequence-transformer.js";

export async function applyTransform(
  sequence: SequenceData,
  transformType: TransformType
): Promise<TransformResult> {
  try {
    let transformed: SequenceData = sequence;

    switch (transformType) {
      case "rotate45L":
        transformed = await sequenceTransformer.rotateSequence(sequence, -1);
        break;
      case "rotate45R":
        transformed = await sequenceTransformer.rotateSequence(sequence, 1);
        break;
      case "shiftStart":
        // Shift starting beat: rotate steps so beat 1 moves to the end
        if (sequence.steps.length > 1) {
          const [first, ...rest] = sequence.steps;
          transformed = { ...sequence, steps: [...rest, first!] };
        } else {
          transformed = sequence;
        }
        break;
      case "rotate90":
        transformed = await sequenceTransformer.rotateSequence(sequence, 2);
        break;
      case "rotate180":
        transformed = await sequenceTransformer.rotateSequence(sequence, 4);
        break;
      case "rotate270":
        transformed = await sequenceTransformer.rotateSequence(sequence, 6);
        break;
      case "mirror":
        transformed = await sequenceTransformer.mirrorSequence(sequence);
        break;
      case "flip":
        transformed = await sequenceTransformer.flipSequence(sequence);
        break;
      case "swapHands":
        transformed = sequenceTransformer.swapHands(sequence);
        break;
      case "invert":
        transformed = await sequenceTransformer.invertSequence(sequence);
        break;
      case "rewind":
        transformed = await sequenceTransformer.rewindSequence(sequence);
        break;
    }

    return { success: true, transformed };
  } catch (err) {
    console.error("Transform failed:", err);
    return { success: false, error: "Transform failed" };
  }
}
