import { untrack } from "svelte";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { HandLabeling } from "$lib/shared/video-collaboration/domain/hand-labeling";
import type { PostSequenceAction } from "$lib/shared/media-composition/domain/post-project";
import {
  applySequenceActions,
  type PostSequenceTransforms,
} from "$lib/shared/media-composition/domain/post-sequence-actions";
import {
  createHandLabeledCard,
  type HandLabeledCard,
} from "$lib/shared/sequence-viewer/services/hand-labeled-card.svelte";
import {
  sequenceForHandLabeling,
  type HandLabeledSequenceResolver,
} from "$lib/shared/sequence-viewer/services/hand-labeled-sequence";
import {
  flipSequence,
  mirrorSequence,
  rotateSequence,
  swapHands,
} from "$lib/shared/create/services/sequence-transformer";

interface PostSequenceView extends HandLabeledCard {
  /** A failure to change the current resolved sequence. */
  readonly error: string | null;
}

/** The Composer's own transforms; a quarter turn is two of its 45° steps. */
const COMPOSER_TRANSFORMS: PostSequenceTransforms = {
  mirror: (sequence) => mirrorSequence(sequence),
  flip: (sequence) => flipSequence(sequence),
  rotate: (sequence, quarterTurns) =>
    rotateSequence(sequence, quarterTurns * 2),
  swap: swapHands,
};

/** What a result was made from; `null` when the labeled sequence is drawn as is. */
function changeKey(
  actions: readonly PostSequenceAction[],
  mirrored: boolean
): string | null {
  if (!actions.length && !mirrored) return null;
  return `${actions.join(" ")}|${mirrored ? "mirrored" : ""}`;
}

/**
 * The post's generated animation, moves, and cards use one resolved sequence:
 * the hand-labeled sequence, then the post's own presses (mirror, flip, turn,
 * swap) in order, then the full-post mirror. The full-post mirror reflects
 * that already labeled geometry; it never swaps the hand identities or their
 * colors a second time. While a new change is prepared the previous drawing
 * of the same sequence stays up, and `pending` holds export back.
 */
export function createPostSequenceView(
  inputs: {
    getSequence(): SequenceData;
    getLabeling(): HandLabeling | null;
    getMirrored(): boolean;
    getActions?(): readonly PostSequenceAction[];
  },
  resolveLabeling: HandLabeledSequenceResolver = sequenceForHandLabeling,
  reflect: (sequence: SequenceData) => Promise<SequenceData> = mirrorSequence,
  transforms: PostSequenceTransforms = COMPOSER_TRANSFORMS
): PostSequenceView {
  const labeled = createHandLabeledCard(inputs, resolveLabeling);
  const cache = new WeakMap<SequenceData, Map<string, Promise<SequenceData>>>();
  let shown = $state.raw<{
    source: SequenceData;
    key: string;
    sequence: SequenceData;
  } | null>(null);
  let failed = $state.raw<{
    source: SequenceData;
    key: string;
    message: string;
  } | null>(null);

  const currentKey = () =>
    changeKey(inputs.getActions?.() ?? [], inputs.getMirrored());

  $effect(() => {
    const actions = [...(inputs.getActions?.() ?? [])];
    const mirrored = inputs.getMirrored();
    const key = changeKey(actions, mirrored);
    const source = labeled.sequence;
    if (key === null || labeled.pending) return;
    const drawn = untrack(() => shown);
    if (drawn?.source === source && drawn.key === key) return;
    let results = cache.get(source);
    if (!results) {
      results = new Map();
      cache.set(source, results);
    }
    let pending = results.get(key);
    if (!pending) {
      const held = results;
      pending = applySequenceActions(source, actions, transforms).then(
        (changed) => (mirrored ? reflect(changed) : changed)
      );
      held.set(key, pending);
      pending.catch(() => held.delete(key));
    }
    let cancelled = false;
    pending
      .then((sequence) => {
        if (!cancelled) {
          shown = { source, key, sequence };
          failed = null;
        }
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        failed = {
          source,
          key,
          message:
            error instanceof Error
              ? error.message
              : "Could not change the notation.",
        };
        console.error("[post-sequence-view] Could not change notation:", error);
      });
    return () => {
      cancelled = true;
    };
  });

  return {
    get sequence() {
      const source = labeled.sequence;
      if (currentKey() === null) return source;
      return shown?.source === source ? shown.sequence : source;
    },
    get labeling() {
      return labeled.labeling;
    },
    get pending() {
      if (labeled.pending) return true;
      const key = currentKey();
      if (key === null) return false;
      const source = labeled.sequence;
      const ready = shown?.source === source && shown.key === key;
      const broke = failed?.source === source && failed.key === key;
      return !ready && !broke;
    },
    get error() {
      const key = currentKey();
      if (key === null) return null;
      const source = labeled.sequence;
      return failed?.source === source && failed.key === key
        ? failed.message
        : null;
    },
  };
}
