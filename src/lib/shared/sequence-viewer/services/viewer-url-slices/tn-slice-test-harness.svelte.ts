/**
 * Effect-root harness for `tn-slice.test.ts`.
 *
 * `TunnelViewController` registers `$effect`s in its constructor (persistence,
 * spotlight-drop, and the layer-rebuild pipeline), so it throws `effect_orphan`
 * without a root, and `$effect.root` only compiles inside `.svelte`/`.svelte.ts`
 * files — the plain `.ts` test cannot host it. Shape matches
 * `t3-slice-test-harness.svelte.ts`; this one lives beside its test for the
 * same reason (a `.svelte.test.ts` rename would move the file into the browser
 * component project — see the vitest config's exclude).
 */
import {
  TunnelViewController,
  type TunnelControllerSources,
} from "#lib/shared/sequence-viewer/tunnel/tunnel-view-controller.svelte.js";

export interface RootedTunnelViewController {
  controller: TunnelViewController;
  dispose(): void;
}

/** Builds a tunnel view controller inside its own effect root. */
export function createRootedTunnelViewController(
  sources: TunnelControllerSources
): RootedTunnelViewController {
  let controller!: TunnelViewController;
  const dispose = $effect.root(() => {
    controller = new TunnelViewController(sources);
  });
  return { controller, dispose };
}
