import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { HandLabeling } from "$lib/shared/video-collaboration/domain/hand-labeling";
import type { HandLabeledSequenceResolver } from "$lib/shared/sequence-viewer/services/hand-labeled-sequence";
import {
  createHandLabeledCard,
  type HandLabeledCard,
} from "$lib/shared/sequence-viewer/services/hand-labeled-card.svelte";

/**
 * Runs `createHandLabeledCard` inside an effect root with reactive inputs the
 * test can change, mirroring how a component would own it.
 */
export function createHandLabeledCardHarness(
  initialSource: SequenceData,
  initialLabeling: HandLabeling | null,
  resolve: HandLabeledSequenceResolver
): {
  card: HandLabeledCard;
  setSource: (next: SequenceData) => void;
  setLabeling: (next: HandLabeling | null) => void;
  dispose: () => void;
} {
  let source = $state.raw(initialSource);
  let labeling = $state(initialLabeling);
  let card!: HandLabeledCard;
  const dispose = $effect.root(() => {
    card = createHandLabeledCard(
      { getSequence: () => source, getLabeling: () => labeling },
      resolve
    );
  });
  return {
    card,
    setSource: (next) => {
      source = next;
    },
    setLabeling: (next) => {
      labeling = next;
    },
    dispose,
  };
}
