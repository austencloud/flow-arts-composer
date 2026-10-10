import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { HandLabeling } from "#lib/shared/video-collaboration/domain/hand-labeling.js";
import type { HandLabeledSequenceResolver } from "#lib/shared/sequence-viewer/services/hand-labeled-sequence.js";
import type { PostSequenceAction } from "#lib/shared/media-composition/domain/post-project.js";
import type { PostSequenceTransforms } from "#lib/shared/media-composition/domain/post-sequence-actions.js";
import { createPostSequenceView } from "#lib/shared/media-composition/services/post-sequence-view.svelte.js";

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
