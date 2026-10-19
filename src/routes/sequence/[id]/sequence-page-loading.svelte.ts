/**
 * The sequence page's load as one self-timing bar, from the moment the route
 * starts until the sequence is on screen.
 *
 * Two surfaces show it in turn: the route's placeholder while the viewer's
 * code downloads, then SequenceViewerPage's own while it resolves the
 * sequence. Both attach the same session, so the bar carries on across the
 * swap instead of starting again.
 */
import {
  provideLoadingSlot,
  useLoadingSlot,
  type LoadingSessionSpec,
  type LoadingSlot,
} from "#lib/shared/loading/loading-session.svelte.js";

/**
 * open      the route started (the viewer's code may still be downloading)
 * viewer    the viewer page mounted and started resolving the sequence
 * resolved  the sequence is ready and the viewer replaces the bar
 */
export const SEQUENCE_PAGE_LOADING_RANKS = [
  "open",
  "viewer",
  "resolved",
] as const;

/** A first visit's timing (ms from open). Each completed load replaces it. */
export const SEQUENCE_PAGE_LOADING_DEFAULT_PROFILE: Record<string, number> = {
  open: 0,
  viewer: 1800,
  resolved: 2600,
};

const SEQUENCE_PAGE_LOADING: LoadingSessionSpec = {
  key: "sequence-page",
  ranks: SEQUENCE_PAGE_LOADING_RANKS,
  defaultProfile: SEQUENCE_PAGE_LOADING_DEFAULT_PROFILE,
};

const CONTEXT_KEY = Symbol("sequence-page-loading");

/** For the route, which shows a placeholder before the viewer page mounts. */
export function provideSequencePageLoading(): LoadingSlot {
  return provideLoadingSlot(CONTEXT_KEY, SEQUENCE_PAGE_LOADING);
}

/** The route's slot, or one owned by the caller (the embed has no route). */
export function useSequencePageLoading(): LoadingSlot {
  return useLoadingSlot(CONTEXT_KEY, SEQUENCE_PAGE_LOADING);
}
