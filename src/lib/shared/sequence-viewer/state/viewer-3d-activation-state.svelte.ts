import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { createViewer3DState } from "#lib/shared/3d/state/viewer-3d-state.svelte.js";
import type { createViewerState } from "./viewer-state.svelte";
import { untrack } from "svelte";
import { sequence3DContentSignature } from "#lib/shared/3d/state/refresh-opened-sequence.js";

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
  // A link's `render=3d` asks for 3D on the surface it opened, read once. The
  // effect below writes `render` back into the URL whenever 3D is on, so
  // reading the live param would keep 3D on forever: leaving 3D for 2D left
  // the renderer running, and the 2D view took the 3D recording layout with
  // no Effects panel. Choosing another surface ends the link's request.
  let linkAsks3D = untrack(() => inputs.getInitialRenderMode() === "3d");
  const openedMode = untrack(() => inputs.viewerState.viewerMode);
  $effect(() => {
    inputs.onUrlParamChange?.(
      "render",
      inputs.viewer3DState.renderMode === "3d" ? "3d" : ""
    );
  });

  $effect(() => {
    const sequence = inputs.getSequence();
    if (!sequence || !inputs.viewer3DState.webgl2Available) return;

    if (inputs.viewerState.viewerMode !== openedMode) linkAsks3D = false;
    const shouldBe3D =
      (inputs.viewerState.wants3D || linkAsks3D) &&
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
