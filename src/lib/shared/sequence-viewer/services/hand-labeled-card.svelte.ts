import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { HandLabeling } from "$lib/shared/video-collaboration/domain/hand-labeling";
import {
  sequenceForHandLabeling,
  type HandLabeledSequenceResolver,
} from "./hand-labeled-sequence";

interface Held {
  source: SequenceData;
  labeling: HandLabeling;
  sequence: SequenceData;
}

export interface HandLabeledCard {
  /** What the card should draw: the resolved sequence, or the source until one lands. */
  readonly sequence: SequenceData;
  /** The labeling the drawn sequence was resolved under; null until the first resolve. Pass this to ChoreoCard, never the requested labeling. */
  readonly labeling: HandLabeling | null;
  readonly pending: boolean;
}

/**
 * Pairs a card's sequence with the labeling it was actually resolved under so
 * the footer legend can never describe geometry the card is not drawing.
 * Must be called during component init (it owns an $effect).
 * A labeling flip on the same source keeps the previous pair until the new one
 * resolves (no blank flash, one step stale but matched). A source change clears
 * the pair immediately (never draw another sequence's card).
 */
export function createHandLabeledCard(
  inputs: { getSequence(): SequenceData; getLabeling(): HandLabeling | null },
  resolve: HandLabeledSequenceResolver = sequenceForHandLabeling
): HandLabeledCard {
  let held = $state<Held | null>(null);
  let pending = $state(false);
  $effect(() => {
    const source = inputs.getSequence();
    const labeling = inputs.getLabeling();
    if (!labeling) {
      held = null;
      pending = false;
      return;
    }
    if (held && held.source !== source) held = null;
    let cancelled = false;
    pending = true;
    resolve(source, labeling)
      .then((sequence) => {
        if (!cancelled) held = { source, labeling, sequence };
      })
      .catch((error) => {
        console.error(
          "[hand-labeled-card] Could not label the notation:",
          error
        );
      })
      .finally(() => {
        if (!cancelled) pending = false;
      });
    return () => {
      cancelled = true;
    };
  });
  return {
    get sequence() {
      return held?.sequence ?? inputs.getSequence();
    },
    get labeling() {
      return held?.labeling ?? null;
    },
    get pending() {
      return pending;
    },
  };
}
