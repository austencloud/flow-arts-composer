import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import {
  flipSequence,
  mirrorSequence,
  swapHands,
} from "#lib/shared/create/services/sequence-transformer.js";

/**
 * How a tunnel partner's sequence differs from the front performer's. A
 * partner facing the other way does the front sequence mirrored, flipped and
 * with hands swapped: 4UMY's partner is B7Y4.
 */
export interface PerformerTransform {
  mirror?: boolean;
  flip?: boolean;
  swap?: boolean;
}

export function hasPerformerTransform(transform: PerformerTransform): boolean {
  return Boolean(transform.mirror || transform.flip || transform.swap);
}

/** The sequence a partner performs, given the front performer's. */
export async function performerSequence(
  sequence: SequenceData,
  transform: PerformerTransform
): Promise<SequenceData> {
  let next = sequence;
  if (transform.mirror) next = await mirrorSequence(next);
  if (transform.flip) next = await flipSequence(next);
  if (transform.swap) next = swapHands(next);
  return next;
}
