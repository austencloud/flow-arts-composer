import { untrack } from "svelte";
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

interface Request {
  source: SequenceData;
  labeling: HandLabeling;
}

function answers(
  pair: Request | null,
  source: SequenceData,
  labeling: HandLabeling
): boolean {
  return pair !== null && pair.source === source && pair.labeling === labeling;
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
  // Raw: the pair is compared by object identity against the source, and a deep
  // proxy would never be identical to the sequence the caller handed in.
  let held = $state.raw<Held | null>(null);
  // The request whose resolve rejected. It settles `pending` so the control
  // that asked is not left disabled; the next request retries the resolver.
  let failed = $state.raw<Request | null>(null);
  $effect(() => {
    const source = inputs.getSequence();
    const labeling = inputs.getLabeling();
    // Untracked: the effect writes `held`, and each resolve assigns a fresh
    // pair. Tracking it would re-run the effect after every resolve, forever.
    const current = untrack(() => held);
    if (!labeling) {
      held = null;
      return;
    }
    if (answers(current, source, labeling)) return;
    if (current && current.source !== source) held = null;
    failed = null;
    let cancelled = false;
    resolve(source, labeling)
      .then((sequence) => {
        if (!cancelled) held = { source, labeling, sequence };
      })
      .catch((error) => {
        if (!cancelled) failed = { source, labeling };
        console.error(
          "[hand-labeled-card] Could not label the notation:",
          error
        );
      });
    return () => {
      cancelled = true;
    };
  });
  const pending = $derived.by(() => {
    const labeling = inputs.getLabeling();
    if (!labeling) return false;
    const source = inputs.getSequence();
    return (
      !answers(held, source, labeling) && !answers(failed, source, labeling)
    );
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
