import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { HandLabeling } from "$lib/shared/video-collaboration/domain/hand-labeling";
import type { HandLabeledSequenceResolver } from "$lib/shared/sequence-viewer/services/hand-labeled-sequence";
import { createPostSequenceView } from "$lib/shared/media-composition/services/post-sequence-view.svelte";

export function createPostSequenceViewHarness(
  initial: SequenceData,
  resolveLabeling: HandLabeledSequenceResolver,
  reflect: (source: SequenceData) => Promise<SequenceData>
) {
  let source = $state.raw(initial);
  let labeling = $state<HandLabeling | null>("mirror-me");
  let mirrored = $state(false);
  let view!: ReturnType<typeof createPostSequenceView>;
  const dispose = $effect.root(() => {
    view = createPostSequenceView(
      {
        getSequence: () => source,
        getLabeling: () => labeling,
        getMirrored: () => mirrored,
      },
      resolveLabeling,
      reflect
    );
  });
  return {
    view,
    setSource(next: SequenceData) {
      source = next;
    },
    setLabeling(next: HandLabeling | null) {
      labeling = next;
    },
    setMirrored(next: boolean) {
      mirrored = next;
    },
    dispose,
  };
}
