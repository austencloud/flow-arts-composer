/**
 * Context distribution for the community map band.
 *
 * The band is mounted through `LazyMount`, whose `props` bag is
 * `Record<string, unknown>` — passing the state through it would erase every
 * type on the way in and hand the band an `unknown` to cast. Context keeps the
 * types and lets the host own creation, which is where the services live.
 *
 * The host creates the state; the band and the invitation slot consume it.
 */

import { getContext, setContext } from "svelte";
import type { CommunityMapState } from "../state/community-map-state.svelte";

export interface CommunityMapContext {
  state: CommunityMapState;
  /**
   * Read as a getter rather than a value: the host derives it from an
   * environment variable that is baked at build time, and reading it through
   * the context keeps the band from importing `$app/env/public` itself and
   * dragging a second source of truth for "is the map configured" into the
   * feature.
   */
  getApiKey: () => string;
}

const KEY = Symbol("community-map");

export function setCommunityMapContext(context: CommunityMapContext): void {
  setContext(KEY, context);
}

export function getCommunityMapContext(): CommunityMapContext {
  const context = getContext<CommunityMapContext | undefined>(KEY);
  if (!context) {
    throw new Error(
      "Community map context is missing. The host must call setCommunityMapContext() before mounting the band.",
    );
  }
  return context;
}
