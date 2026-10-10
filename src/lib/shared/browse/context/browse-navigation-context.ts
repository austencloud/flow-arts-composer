import { getContext, setContext } from "svelte";
import type { BrowseNavigationState } from "#lib/shared/browse/state/browse-navigation-state.svelte.js";

const BROWSE_NAVIGATION_CONTEXT = Symbol("browse-navigation");

export function setBrowseNavigationContext(
  navigation: BrowseNavigationState
): BrowseNavigationState {
  setContext(BROWSE_NAVIGATION_CONTEXT, navigation);
  return navigation;
}

export function getBrowseNavigationContext(): BrowseNavigationState {
  const navigation = tryGetBrowseNavigationContext();
  if (!navigation) {
    throw new Error("Browse navigation context is not available");
  }
  return navigation;
}

/**
 * The same context for components that legitimately mount outside the Browse
 * module — the shared sequence picker composes gallery filtering inside a
 * modal, where there is no Browse screen to route to. Those components degrade
 * the navigation action rather than crashing their host.
 */
export function tryGetBrowseNavigationContext(): BrowseNavigationState | null {
  return getContext<BrowseNavigationState>(BROWSE_NAVIGATION_CONTEXT) ?? null;
}
