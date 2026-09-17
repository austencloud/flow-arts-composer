/**
 * Does a derived Linked sequence actually carry the mode its rule promises?
 *
 * Every rule except Rewind is pointwise, so it always does (proven by
 * fuse-tnd-rule.dataframe.test.ts). Rewind pairs follower beat i with driver
 * beat n-1-i, which only keeps the mode when the driver has the internal
 * symmetry the generator builds in. A hand-edited driver can break it, and
 * this is how the panel finds out which beat.
 */
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { deriveTnDFromPictograph } from "$lib/shared/pictograph/shared/domain/utils/tnd-deriver";
import type { FuseTnDMode } from "./fuse-tnd-rule";

export interface FuseTnDCheck {
  expected: FuseTnDMode;
  /** First beat (1-based) whose derived mode differs, or null when all match. */
  firstMismatchBeat: number | null;
  /** Beats (1-based) where the deriver returned null: dash, static, hidden hand. */
  undefinedBeats: number[];
}

export function checkFuseTnD(
  sequence: SequenceData,
  expected: FuseTnDMode
): FuseTnDCheck {
  const undefinedBeats: number[] = [];
  let firstMismatchBeat: number | null = null;

  for (const [index, step] of sequence.steps.entries()) {
    const beat = index + 1;
    // TnDMode's enum values are the same two-letter codes as VtgMode.
    const mode = deriveTnDFromPictograph(step).tndMode as FuseTnDMode | null;
    if (mode === null) {
      undefinedBeats.push(beat);
      continue;
    }
    if (mode !== expected && firstMismatchBeat === null) {
      firstMismatchBeat = beat;
    }
  }

  return { expected, firstMismatchBeat, undefinedBeats };
}
