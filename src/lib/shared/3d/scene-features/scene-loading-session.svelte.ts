/**
 * The 3D viewer's load as one self-timing bar, from the moment the viewer is
 * asked for until the scene runs smoothly.
 *
 * Opening the viewer shows two surfaces in turn: the viewer host's
 * placeholder while the 3D code downloads ("Opening 3D"), then
 * SceneLoadingCurtain while the scene loads, compiles and settles. Both
 * attach their capsule to the same session, so the bar carries on across the
 * hand-over instead of starting again from zero.
 *
 * A host that has a placeholder calls `provideSceneLoadingSession()`; the
 * curtain uses that session or, mounted on its own, opens one itself.
 */
import { getContext, onDestroy, setContext } from "svelte";
import {
  createLoadingSession,
  type LoadingSession,
} from "#lib/shared/loading/loading-session.svelte.js";

/**
 * open      the viewer was asked for (its code may still be downloading)
 * canvas    the 3D canvas mounted; the scene starts loading
 * load-*    the scene's assets (and cast, when it waits for them) crossed a
 *           quarter of the way
 * loaded    everything the first reveal needs has arrived
 * warm-40   shader compile is under way
 * compiled  shaders compiled; the frame gate is checking for smooth frames
 * smooth    the scene runs smoothly and the curtain lifts
 */
export const SCENE_LOADING_RANKS = [
  "open",
  "canvas",
  "load-25",
  "load-50",
  "load-75",
  "loaded",
  "warm-40",
  "compiled",
  "smooth",
] as const;

/**
 * A first visit's timing (ms from open): the dev server's
 * /sequence/[id]?render=3d measured 2026-10-15 in the agent Chrome. Each
 * completed load replaces it with its own.
 */
export const SCENE_LOADING_DEFAULT_PROFILE: Record<string, number> = {
  open: 0,
  canvas: 4000,
  "load-25": 8400,
  "load-50": 8450,
  "load-75": 10100,
  loaded: 14200,
  "warm-40": 14250,
  compiled: 14300,
  smooth: 14400,
};

const SCENE_LOADING_KEY = "3d-stage";

export interface SceneLoadingSlot {
  /** The current load's session, opened on first use (and again after one
   * completes). Browser only. */
  open(): LoadingSession;
  /** The open session, if any (reactive). */
  readonly current: LoadingSession | null;
}

const CONTEXT_KEY = Symbol("scene-loading-session");

function createSceneLoadingSlot(): SceneLoadingSlot & { abandon(): void } {
  let session = $state<LoadingSession | null>(null);
  return {
    open() {
      // A finished load stays finished: a canvas that mounts again (the
      // viewer was closed and reopened) is a new load.
      if (!session || session.done) {
        session = createLoadingSession({
          key: SCENE_LOADING_KEY,
          ranks: SCENE_LOADING_RANKS,
          defaultProfile: SCENE_LOADING_DEFAULT_PROFILE,
        });
      }
      return session;
    },
    get current() {
      return session;
    },
    abandon() {
      if (session && !session.done) session.abandon();
    },
  };
}

/**
 * For a viewer host that shows a placeholder before the 3D canvas mounts.
 * The host opens the session when 3D is asked for and its placeholder shows
 * `current`. The load is abandoned (nothing stored) if the host leaves before
 * it completes.
 */
export function provideSceneLoadingSession(): SceneLoadingSlot {
  const slot = createSceneLoadingSlot();
  setContext(CONTEXT_KEY, slot);
  onDestroy(() => slot.abandon());
  return slot;
}

/** The host's slot, or one owned by the calling component. */
export function useSceneLoadingSession(): SceneLoadingSlot {
  const provided = getContext<SceneLoadingSlot | undefined>(CONTEXT_KEY);
  if (provided) return provided;
  const slot = createSceneLoadingSlot();
  onDestroy(() => slot.abandon());
  return slot;
}
