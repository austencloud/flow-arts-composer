export const ENVIRONMENT_COVER_DURATION_MS = 200;
export const ENVIRONMENT_REVEAL_DURATION_MS = 280;
export const ENVIRONMENT_VEIL_MAX_OPACITY = 0.88;

export type EnvironmentTransitionPhase =
  | "idle"
  | "covering"
  | "gap"
  | "waiting"
  | "revealing"
  /** The next world loads hidden while the shown one stays (environment-handoff). */
  | "preparing";

export interface EnvironmentTransitionState<Key extends string> {
  mountedKey: Key | null;
  requestedKey: Key;
  phase: EnvironmentTransitionPhase;
  visibility: number;
  gapFramesRemaining: number;
}

export interface EnvironmentTransitionObservation<Key extends string> {
  requestedKey: Key;
  mountedKey: Key | null;
  phase: EnvironmentTransitionPhase;
  settled: boolean;
}

export interface EnvironmentTransitionTiming {
  coverDurationMs: number;
  revealDurationMs: number;
}

export const DEFAULT_ENVIRONMENT_TRANSITION_TIMING: EnvironmentTransitionTiming =
  {
    coverDurationMs: ENVIRONMENT_COVER_DURATION_MS,
    revealDurationMs: ENVIRONMENT_REVEAL_DURATION_MS,
  };

export function createEnvironmentTransitionState<Key extends string>(
  initialKey: Key
): EnvironmentTransitionState<Key> {
  return {
    mountedKey: initialKey,
    requestedKey: initialKey,
    phase: "idle",
    visibility: 1,
    gapFramesRemaining: 0,
  };
}

export function requestEnvironment<Key extends string>(
  state: EnvironmentTransitionState<Key>,
  requestedKey: Key
): EnvironmentTransitionState<Key> {
  // Scene controls can publish their current value again while the lights are
  // going down. Treat that as a true no-op. Returning a fresh covering state
  // here can keep reactive callers writing the same request forever.
  if (requestedKey === state.requestedKey) {
    return state;
  }

  if (requestedKey === state.mountedKey) {
    return {
      ...state,
      requestedKey,
      phase: state.visibility >= 1 ? "idle" : "revealing",
    };
  }

  if (state.mountedKey === null) {
    return { ...state, requestedKey };
  }

  return {
    ...state,
    requestedKey,
    phase: "covering",
  };
}

/**
 * Switch a retained world without exposing the ordinary empty-frame gap.
 * The caller must already own an opaque visual cover and keep it in place
 * until the returned waiting state settles.
 */
export function switchEnvironmentBehindHost<Key extends string>(
  state: EnvironmentTransitionState<Key>,
  requestedKey: Key
): EnvironmentTransitionState<Key> {
  if (
    requestedKey === state.mountedKey &&
    requestedKey === state.requestedKey
  ) {
    return state;
  }

  return {
    mountedKey: requestedKey,
    requestedKey,
    phase: "waiting",
    visibility: 1,
    gapFramesRemaining: 0,
  };
}

export function advanceEnvironmentTransition<Key extends string>(
  state: EnvironmentTransitionState<Key>,
  deltaMs: number,
  mountedEnvironmentSettled: boolean,
  timing: EnvironmentTransitionTiming = DEFAULT_ENVIRONMENT_TRANSITION_TIMING
): EnvironmentTransitionState<Key> {
  const safeDeltaMs = Math.max(0, deltaMs);

  switch (state.phase) {
    case "idle":
    case "preparing":
      return state;

    case "covering": {
      const nextVisibility =
        timing.coverDurationMs <= 0
          ? 0
          : Math.max(
              0,
              state.visibility - safeDeltaMs / timing.coverDurationMs
            );
      if (nextVisibility > 0) {
        return { ...state, visibility: nextVisibility };
      }
      return {
        ...state,
        mountedKey: null,
        phase: "gap",
        visibility: 0,
        gapFramesRemaining: 1,
      };
    }

    case "gap":
      if (state.gapFramesRemaining > 0) {
        return {
          ...state,
          gapFramesRemaining: state.gapFramesRemaining - 1,
        };
      }
      return {
        ...state,
        mountedKey: state.requestedKey,
        phase: "waiting",
        visibility: 0,
      };

    case "waiting":
      return mountedEnvironmentSettled
        ? { ...state, phase: "revealing" }
        : state;

    case "revealing": {
      if (state.mountedKey !== state.requestedKey) {
        return { ...state, phase: "covering" };
      }
      const nextVisibility =
        timing.revealDurationMs <= 0
          ? 1
          : Math.min(
              1,
              state.visibility + safeDeltaMs / timing.revealDurationMs
            );
      if (nextVisibility < 1) {
        return { ...state, visibility: nextVisibility };
      }
      return { ...state, phase: "idle", visibility: 1 };
    }
  }
}

export function getEnvironmentVeilOpacity(
  state: EnvironmentTransitionState<string>,
  maxOpacity: number = ENVIRONMENT_VEIL_MAX_OPACITY
): number {
  const visibility = Math.max(0, Math.min(1, state.visibility));
  const coverProgress = 1 - visibility;
  const easedProgress = coverProgress * coverProgress * (3 - 2 * coverProgress);
  return Math.max(0, Math.min(1, maxOpacity)) * easedProgress;
}
