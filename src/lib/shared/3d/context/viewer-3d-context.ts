/**
 * Viewer 3D Context
 *
 * Distributes viewer-3d state to descendant components via Svelte context.
 *
 * The sequence viewer publishes a `LazyViewer3D` instead of the state itself:
 * the state module brings three.js and the scene package, so it loads the
 * first time someone opens 3D. Components that only render inside a 3D pane
 * keep calling `getViewer3DContext()`; those panes mount after `load()`.
 */

import { getContext, setContext } from "svelte";
import type { createViewer3DState } from "../state/viewer-3d-state.svelte";
export type { PopoverId } from "../state/viewer-3d-state.svelte";

const KEY = Symbol("viewer-3d");
export type Viewer3DState = ReturnType<typeof createViewer3DState>;

export interface LazyViewer3D {
  readonly kind: "lazy-viewer-3d";
  /** Null until `load()` has built the state. */
  readonly current: Viewer3DState | null;
  readonly webgl2Available: boolean;
  load(): Promise<Viewer3DState>;
}

export function setViewer3DContext(state: Viewer3DState | LazyViewer3D) {
  const source: LazyViewer3D =
    "kind" in state && state.kind === "lazy-viewer-3d"
      ? state
      : {
          kind: "lazy-viewer-3d",
          current: state as Viewer3DState,
          webgl2Available: (state as Viewer3DState).webgl2Available,
          load: () => Promise.resolve(state as Viewer3DState),
        };
  setContext(KEY, source);
}

/** For components that only mount once 3D is open. */
export function getViewer3DContext(): Viewer3DState {
  return getContext<LazyViewer3D | undefined>(KEY)?.current as Viewer3DState;
}

/**
 * Attempt to get the viewer3D context. Returns null if the context
 * hasn't been set (e.g. Avatar3D rendered inside museum or realm) or the
 * viewer has not loaded 3D yet.
 */
export function tryGetViewer3DContext(): Viewer3DState | null {
  try {
    return getContext<LazyViewer3D | undefined>(KEY)?.current ?? null;
  } catch {
    return null;
  }
}

/**
 * The stable handle, for surfaces that render before 3D opens: they read
 * `current` reactively and call `load()` when they need the state.
 */
export function getViewer3DSource(): LazyViewer3D | null {
  return getContext<LazyViewer3D | undefined>(KEY) ?? null;
}
