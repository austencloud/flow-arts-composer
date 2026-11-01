import type {
  LazyViewer3D,
  Viewer3DState,
} from "#lib/shared/3d/context/viewer-3d-context.js";
import type { Viewer3DStateOptions } from "#lib/shared/3d/state/viewer-3d-state.svelte.js";
import { isWebGL2Available } from "#lib/shared/3d/capabilities/webgl-capabilities.js";

type PropFinishState = typeof import("@austencloud/scene-3d").propFinishState;

/**
 * The viewer's 3D state, built the first time someone opens 3D.
 *
 * The state module brings three.js and the scene package (about 1.5 MB), and
 * most people who scan a link never leave 2D. The state's own effects need an
 * owner, and the viewer's component scope is gone by the time the import
 * lands, so it gets an effect root that `dispose()` tears down.
 */
export function createLazyViewer3DState(
  getOptions: () => Viewer3DStateOptions
): LazyViewer3D & {
  readonly propFinishState: PropFinishState | null;
  dispose(): void;
} {
  let current = $state<Viewer3DState | null>(null);
  let propFinishState = $state<PropFinishState | null>(null);
  let pending: Promise<Viewer3DState> | null = null;
  let destroyRoot: (() => void) | null = null;
  let disposed = false;
  const webgl2Available = isWebGL2Available();

  function load(): Promise<Viewer3DState> {
    pending ??= Promise.all([
      import("#lib/shared/3d/state/viewer-3d-state.svelte.js"),
      import("@austencloud/scene-3d"),
    ]).then(([stateModule, scene]) => {
      // A viewer closed mid-download builds nothing; whoever asked is gone too.
      if (disposed) return new Promise<never>(() => {});
      let built!: Viewer3DState;
      destroyRoot = $effect.root(() => {
        built = stateModule.createViewer3DState(undefined, getOptions());
      });
      propFinishState = scene.propFinishState;
      current = built;
      return built;
    });
    return pending;
  }

  return {
    kind: "lazy-viewer-3d",
    get current() {
      return current;
    },
    get propFinishState() {
      return propFinishState;
    },
    webgl2Available,
    load,
    dispose() {
      disposed = true;
      current?.dispose();
      destroyRoot?.();
    },
  };
}
