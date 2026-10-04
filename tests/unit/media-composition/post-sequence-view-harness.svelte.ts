import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { HandLabeling } from "$lib/shared/video-collaboration/domain/hand-labeling";
import type { HandLabeledSequenceResolver } from "$lib/shared/sequence-viewer/services/hand-labeled-sequence";
import type { PostSequenceAction } from "$lib/shared/media-composition/domain/post-project";
import type { PostSequenceTransforms } from "$lib/shared/media-composition/domain/post-sequence-actions";
import { createPostSequenceView } from "$lib/shared/media-composition/services/post-sequence-view.svelte";

export function createPostSequenceViewHarness(
  initial: SequenceData,
  resolveLabeling: HandLabeledSequenceResolver,
  reflect: (source: SequenceData) => Promise<SequenceData>,
  transforms?: PostSequenceTransforms
) {
  let source = $state.raw(initial);
  let labeling = $state<HandLabeling | null>("mirror-me");
  let mirrored = $state(false);
  let actions = $state.raw<PostSequenceAction[]>([]);
  let view!: ReturnType<typeof createPostSequenceView>;
  const dispose = $effect.root(() => {
    view = createPostSequenceView(
      {
        getSequence: () => source,
        getLabeling: () => labeling,
        getMirrored: () => mirrored,
        getActions: () => actions,
      },
      resolveLabeling,
      reflect,
      transforms
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
    setActions(next: PostSequenceAction[]) {
      actions = next;
    },
    dispose,
  };
}
