import { createViewer3DState } from "#lib/shared/3d/state/viewer-3d-state.svelte.js";
import { COMPOSER_3D_DEMO_SEED } from "../../src/routes/(public)/composer/_components/composer-3d-demo-state";

export function createComposerViewerStateForTest() {
  let state!: ReturnType<typeof createViewer3DState>;
  const disposeRoot = $effect.root(() => {
    state = createViewer3DState(COMPOSER_3D_DEMO_SEED);
  });

  return {
    state,
    dispose: () => {
      state.dispose();
      disposeRoot();
    },
  };
}
