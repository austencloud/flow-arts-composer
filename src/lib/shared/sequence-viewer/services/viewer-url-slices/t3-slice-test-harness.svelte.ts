/**
 * Effect-root harness for `t3-slice.test.ts`.
 *
 * `createViewer3DState` registers `$effect`s, so it throws `effect_orphan`
 * without a root, and `$effect.root` only compiles inside `.svelte`/`.svelte.ts`
 * files — the plain `.ts` test cannot host it. The sibling-harness shape matches
 * `tests/unit/3d-viewer/viewer3d-test-helpers.svelte.ts`; this one lives beside
 * the test because a `.svelte.test.ts` rename would move the file into the
 * browser component project (see the vitest config's exclude).
 */
import { createViewer3DState } from "#lib/shared/3d/state/viewer-3d-state.svelte.js";

export type Viewer3DState = ReturnType<typeof createViewer3DState>;
export type Viewer3DOptions = Parameters<typeof createViewer3DState>[1];

export interface RootedViewer3DState {
  state: Viewer3DState;
  dispose(): void;
}

/** Builds a viewer-3d state inside its own effect root. */
export function createRootedViewer3DState(
  options: Viewer3DOptions
): RootedViewer3DState {
  let state!: Viewer3DState;
  const dispose = $effect.root(() => {
    state = createViewer3DState(undefined, options);
  });
  return { state, dispose };
}
