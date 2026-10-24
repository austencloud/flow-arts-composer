import { getContext, setContext } from "svelte";
import type { BrowseHeaderState } from "#lib/shared/browse/state/browse-header-state.svelte.js";

const BROWSE_HEADER_CONTEXT = Symbol("browse-header");

export function setBrowseHeaderContext(
  header: BrowseHeaderState
): BrowseHeaderState {
  setContext(BROWSE_HEADER_CONTEXT, header);
  return header;
}

/**
 * Null outside the Browse module (a test route, a picker inside a modal). A
 * screen with no header keeps its own title row and back control.
 */
export function tryGetBrowseHeaderContext(): BrowseHeaderState | null {
  return getContext<BrowseHeaderState>(BROWSE_HEADER_CONTEXT) ?? null;
}
