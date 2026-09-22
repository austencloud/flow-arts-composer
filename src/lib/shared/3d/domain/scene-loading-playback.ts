export interface SceneLoadingPlaybackTransition {
  held: boolean;
  syncTo: boolean | null;
}

/**
 * Hold the shared clock behind the first-load curtain, then restore it once.
 * A live outgoing scene keeps its clock during replacement preparation.
 * `syncTo` is desired state, not a user toggle, so hosts can keep it out of the
 * intent counter while retaining a truthful semantic playback event.
 */
export function sceneLoadingPlaybackTransition(input: {
  sceneReady: boolean;
  hasLiveScene?: boolean;
  isPlaying: boolean;
  held: boolean;
}): SceneLoadingPlaybackTransition {
  const canPlay = input.sceneReady || input.hasLiveScene === true;
  if (canPlay && input.held) {
    return { held: false, syncTo: true };
  }
  if (!canPlay && input.isPlaying && !input.held) {
    return { held: true, syncTo: false };
  }
  return { held: input.held, syncTo: null };
}
