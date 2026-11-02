import {
  createViewer3DState,
  type Viewer3DStateOptions,
} from "#lib/shared/3d/state/viewer-3d-state.svelte.js";

export function createPersistentViewerStateForTest(
  options?: Viewer3DStateOptions
): {
  state: ReturnType<typeof createViewer3DState>;
  dispose: () => void;
} {
  let state!: ReturnType<typeof createViewer3DState>;
  const dispose = $effect.root(() => {
    state = createViewer3DState(undefined, options);
  });
  return { state, dispose };
}
