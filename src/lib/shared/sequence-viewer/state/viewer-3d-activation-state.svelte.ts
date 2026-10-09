import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { createViewer3DState } from "$lib/shared/3d/state/viewer-3d-state.svelte";
import type { createViewerState } from "./viewer-state.svelte";
import { untrack } from "svelte";
import { sequence3DContentSignature } from "$lib/shared/3d/state/refresh-opened-sequence";

type Viewer3DState = ReturnType<typeof createViewer3DState>;
type ViewerState = ReturnType<typeof createViewerState>;

interface Viewer3DActivationInputs {
  viewer3DState: Viewer3DState;
  viewerState: ViewerState;
  getSequence: () => SequenceData | null;
  getInitialRenderMode: () => "2d" | "3d" | undefined;
  onUrlParamChange: ((key: string, value: string) => void) | undefined;
}

interface Viewer3DActivationDependencies {
  viewportFits3D: () => boolean;
}

export function createViewer3DActivationState(
  inputs: Viewer3DActivationInputs,
  dependencies: Viewer3DActivationDependencies
) {
  let openedSequence: SequenceData | null = null;
  let openedContent = "";
  $effect(() => {
    inputs.onUrlParamChange?.(
      "render",
      inputs.viewer3DState.renderMode === "3d" ? "3d" : ""
    );
  });

  $effect(() => {
    const sequence = inputs.getSequence();
    if (!sequence || !inputs.viewer3DState.webgl2Available) return;

    const shouldBe3D =
      (inputs.viewerState.wants3D || inputs.getInitialRenderMode() === "3d") &&
      dependencies.viewportFits3D();
    const is3D = inputs.viewer3DState.renderMode === "3d";
    const performersReady =
      inputs.viewer3DState.performerManager.performers.length > 0;
    const content = sequence3DContentSignature(sequence);

    if (shouldBe3D && (!is3D || !performersReady)) {
      inputs.viewer3DState.enter3D(sequence);
      openedSequence = sequence;
      openedContent = content;
    } else if (shouldBe3D) {
      const previous =
        openedSequence ?? inputs.viewer3DState.currentSequenceData;
      if (!previous) {
        untrack(() => inputs.viewer3DState.enter3D(sequence));
      } else if (
        sequence3DContentSignature(previous) !== content ||
        (openedContent && openedContent !== content)
      ) {
        untrack(() =>
          inputs.viewer3DState.refreshOpenedSequence(previous, sequence)
        );
      }
      openedSequence = sequence;
      openedContent = content;
    } else if (!shouldBe3D && is3D) {
      inputs.viewer3DState.exit3D();
      openedSequence = null;
      openedContent = "";
    }
  });

  return {};
}
