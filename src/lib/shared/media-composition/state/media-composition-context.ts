import { getContext, setContext } from "svelte";
import type { MediaCompositionState } from "$lib/shared/media-composition/state/media-composition-state.svelte";

const MEDIA_COMPOSITION_CONTEXT = Symbol("media-composition");

export function setMediaCompositionContext(state: MediaCompositionState): void {
  setContext(MEDIA_COMPOSITION_CONTEXT, state);
}

export function getMediaCompositionContext(): MediaCompositionState {
  const state = getContext<MediaCompositionState>(MEDIA_COMPOSITION_CONTEXT);
  if (!state) throw new Error("Media composition context is not available");
  return state;
}

/** The composition, when a host set one; the tutorial builder does not. */
export function tryGetMediaCompositionContext():
  | MediaCompositionState
  | undefined {
  return getContext<MediaCompositionState | undefined>(
    MEDIA_COMPOSITION_CONTEXT
  );
}
