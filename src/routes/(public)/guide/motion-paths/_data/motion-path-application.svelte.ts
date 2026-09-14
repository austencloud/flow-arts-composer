import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { AnimationPathPolicy } from "$lib/shared/animation-engine/state/animation-visibility-state.svelte";
import { applySequencePathPreview } from "$lib/shared/sequence-viewer/services/sequence-path-policy";

/** This lesson's Save and Restore work on an in-memory example. */
export function createMotionPathApplication(source: SequenceData) {
  const baseline = applySequencePathPreview(source, {
    pathShape: "arc",
    motionAwarePaths: false,
  })!;
  let saved = $state.raw(baseline);
  let draft = $state.raw(baseline);
  let revision = $state(0);
  return {
    get sequence() {
      return { ...draft, id: `${source.id}-application-${revision}` };
    },
    get changed() {
      return draft !== saved;
    },
    apply(policy: AnimationPathPolicy, stepIndex?: number) {
      const preview = applySequencePathPreview(draft, policy)!;
      if (stepIndex === undefined) {
        draft = preview;
      } else {
        if (!draft.steps[stepIndex]) return;
        draft = {
          ...draft,
          steps: draft.steps.map((step, index) =>
            index === stepIndex ? preview.steps[index]! : step
          ),
        };
      }
      revision += 1;
    },
    save() {
      saved = draft;
    },
    restore() {
      draft = saved;
      revision += 1;
    },
    reset() {
      draft = baseline;
      saved = baseline;
      revision += 1;
    },
  };
}
