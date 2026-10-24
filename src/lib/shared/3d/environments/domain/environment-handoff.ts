import type { EnvironmentTransitionObservation } from "./environment-transition";

/**
 * A scene switch that never leaves the viewer without a world.
 *
 * The world on screen stays mounted, lit, and animating while the requested
 * one loads hidden beside it. Only when the newcomer is ready does it take
 * over, in one cut. A newcomer that fails is dropped and the shown world never
 * moved. The older cover-gap-reveal transition tore the shown world down before
 * the new assets arrived, which left seconds of a dark, unlit stage.
 */
export interface EnvironmentHandoffState<Key extends string> {
  /** The world on screen. */
  shownKey: Key;
  /** The world the viewer last asked for. */
  requestedKey: Key;
  /** The world loading hidden beside the shown one, if any. */
  preparingKey: Key | null;
}

export function createEnvironmentHandoff<Key extends string>(
  initialKey: Key
): EnvironmentHandoffState<Key> {
  return { shownKey: initialKey, requestedKey: initialKey, preparingKey: null };
}

/**
 * Ask for a world. Asking for the one on screen abandons any preparation;
 * asking for another retargets it.
 */
export function requestHandoff<Key extends string>(
  state: EnvironmentHandoffState<Key>,
  requestedKey: Key
): EnvironmentHandoffState<Key> {
  if (requestedKey === state.requestedKey) return state;
  return {
    shownKey: state.shownKey,
    requestedKey,
    preparingKey: requestedKey === state.shownKey ? null : requestedKey,
  };
}

/**
 * Fold the hidden world's readiness in. A failure ends preparation with the
 * shown world unchanged, so the request and the screen disagree on purpose:
 * that is how the scene picker learns the load failed.
 */
export function settleHandoff<Key extends string>(
  state: EnvironmentHandoffState<Key>,
  incoming: { ready: boolean; failed: boolean }
): EnvironmentHandoffState<Key> {
  if (state.preparingKey === null) return state;
  if (incoming.failed) return { ...state, preparingKey: null };
  if (!incoming.ready) return state;
  return {
    shownKey: state.preparingKey,
    requestedKey: state.requestedKey,
    preparingKey: null,
  };
}

/** Worlds to keep mounted, the shown one first. */
export function handoffWorlds<Key extends string>(
  state: EnvironmentHandoffState<Key>
): Key[] {
  return state.preparingKey === null
    ? [state.shownKey]
    : [state.shownKey, state.preparingKey];
}

export function observeHandoff<Key extends string>(
  state: EnvironmentHandoffState<Key>,
  shownWorldSettled: boolean
): EnvironmentTransitionObservation<Key> {
  const preparing = state.preparingKey !== null;
  return {
    requestedKey: state.requestedKey,
    mountedKey: state.shownKey,
    phase: preparing ? "preparing" : "idle",
    settled: !preparing && shownWorldSettled,
  };
}
