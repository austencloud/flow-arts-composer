import {
  SCENE_ENVIRONMENTS,
  type SceneEnvironmentId,
} from "./scene-environment";

/**
 * What the scene picker needs to know about a scene switch: which scene is
 * actually on screen, and whether the last one asked for failed to arrive.
 *
 * The viewer's `environmentId` changes the moment a tile is tapped, but the
 * scene behind it can take seconds to build. Without this the tapped tile
 * looked finished at once while nothing changed, and people kept tapping it.
 */
export interface EnvironmentLoadState {
  /** False until a renderer reports transitions; untracked viewers never show a pending load. */
  tracking: boolean;
  /** The last environment a renderer reported fully on screen. */
  settled: SceneEnvironmentId;
  /** The environment whose load failed most recently, until the next choice. */
  failed: SceneEnvironmentId | null;
}

/** A renderer's view of a switch, in scene ids rather than renderer keys. */
export interface EnvironmentLoadObservation {
  requested: SceneEnvironmentId;
  mounted: SceneEnvironmentId | null;
  settled: boolean;
}

export function createEnvironmentLoadState(
  initial: SceneEnvironmentId
): EnvironmentLoadState {
  return { tracking: false, settled: initial, failed: null };
}

/** The scene still being built for `requested`, or null when nothing is loading. */
export function pendingEnvironment(
  state: EnvironmentLoadState,
  requested: SceneEnvironmentId
): SceneEnvironmentId | null {
  return state.tracking && requested !== state.settled ? requested : null;
}

/**
 * The tile that should read as active: the scene on screen while another one
 * loads, so the picker never claims a scene the viewer is not showing yet.
 */
export function displayedEnvironment(
  state: EnvironmentLoadState,
  requested: SceneEnvironmentId
): SceneEnvironmentId {
  return pendingEnvironment(state, requested) === null
    ? requested
    : state.settled;
}

/**
 * Fold one renderer observation into the load state. `current` is the
 * viewer's requested environment right now; an observation about an older
 * request (the user already picked something else) never reverts anything.
 *
 * A settled observation whose mounted scene differs from the requested one
 * means the replacement failed and the outgoing scene stayed up. The caller
 * should put the viewer back on `revertTo`.
 */
export function observeEnvironmentLoad(
  state: EnvironmentLoadState,
  current: SceneEnvironmentId,
  observation: EnvironmentLoadObservation
): { state: EnvironmentLoadState; revertTo: SceneEnvironmentId | null } {
  const tracked = state.tracking ? state : { ...state, tracking: true };
  if (!observation.settled || observation.mounted === null) {
    return { state: tracked, revertTo: null };
  }
  if (observation.mounted === observation.requested) {
    return tracked.settled === observation.mounted
      ? { state: tracked, revertTo: null }
      : {
          state: { ...tracked, settled: observation.mounted },
          revertTo: null,
        };
  }
  if (observation.requested !== current) {
    return {
      state: { ...tracked, settled: observation.mounted },
      revertTo: null,
    };
  }
  return {
    state: {
      ...tracked,
      settled: observation.mounted,
      failed: observation.requested,
    },
    revertTo: observation.mounted,
  };
}

export function sceneEnvironmentIdForRendererKey(
  key: string | null
): SceneEnvironmentId | null {
  if (key === null) return null;
  return (
    SCENE_ENVIRONMENTS.find(({ rendererKey }) => rendererKey === key)?.id ??
    null
  );
}
