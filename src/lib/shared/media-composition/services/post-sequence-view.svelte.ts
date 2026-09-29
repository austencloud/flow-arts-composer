import { untrack } from "svelte";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { HandLabeling } from "$lib/shared/video-collaboration/domain/hand-labeling";
import {
  createHandLabeledCard,
  type HandLabeledCard,
} from "$lib/shared/sequence-viewer/services/hand-labeled-card.svelte";
import {
  sequenceForHandLabeling,
  type HandLabeledSequenceResolver,
} from "$lib/shared/sequence-viewer/services/hand-labeled-sequence";
import { mirrorSequence } from "$lib/shared/create/services/sequence-transformer";

interface PostSequenceView extends HandLabeledCard {
  /** A mirror failure for the current resolved sequence. */
  readonly error: string | null;
}

/**
 * The post's generated animation, moves, and cards use one resolved sequence.
 * A full-post mirror reflects that already labeled geometry; it never swaps
 * the hand identities or their colors a second time.
 */
export function createPostSequenceView(
  inputs: {
    getSequence(): SequenceData;
    getLabeling(): HandLabeling | null;
    getMirrored(): boolean;
  },
  resolveLabeling: HandLabeledSequenceResolver = sequenceForHandLabeling,
  reflect: (sequence: SequenceData) => Promise<SequenceData> = mirrorSequence
): PostSequenceView {
  const labeled = createHandLabeledCard(inputs, resolveLabeling);
  const cache = new WeakMap<SequenceData, Promise<SequenceData>>();
  let reflected = $state.raw<{
    source: SequenceData;
    sequence: SequenceData;
  } | null>(null);
  let failed = $state.raw<{ source: SequenceData; message: string } | null>(
    null
  );

  $effect(() => {
    const enabled = inputs.getMirrored();
    const source = labeled.sequence;
    if (!enabled || labeled.pending) return;
    if (untrack(() => reflected)?.source === source) return;
    let pending = cache.get(source);
    if (!pending) {
      pending = reflect(source);
      cache.set(source, pending);
      pending.catch(() => cache.delete(source));
    }
    let cancelled = false;
    pending
      .then((sequence) => {
        if (!cancelled) {
          reflected = { source, sequence };
          failed = null;
        }
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        failed = {
          source,
          message:
            error instanceof Error
              ? error.message
              : "Could not mirror the notation.",
        };
        console.error("[post-sequence-view] Could not mirror notation:", error);
      });
    return () => {
      cancelled = true;
    };
  });

  return {
    get sequence() {
      const source = labeled.sequence;
      return inputs.getMirrored() && reflected?.source === source
        ? reflected.sequence
        : source;
    },
    get labeling() {
      return labeled.labeling;
    },
    get pending() {
      if (labeled.pending) return true;
      if (!inputs.getMirrored()) return false;
      const source = labeled.sequence;
      return reflected?.source !== source && failed?.source !== source;
    },
    get error() {
      if (!inputs.getMirrored()) return null;
      const source = labeled.sequence;
      return failed?.source === source ? failed.message : null;
    },
  };
}
