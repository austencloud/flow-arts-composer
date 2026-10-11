import { createViewer3DState } from "#lib/shared/3d/state/viewer-3d-state.svelte.js";

export function createPersistentViewerStateForTest(): {
  state: ReturnType<typeof createViewer3DState>;
  dispose: () => void;
} {
  let state!: ReturnType<typeof createViewer3DState>;
  const dispose = $effect.root(() => {
    state = createViewer3DState();
  });
  return { state, dispose };
}
