/**
 * Shared signal for the My Props drawer.
 *
 * The drawer must render at the document root (outside the sidebar) because
 * the sidebar's backdrop-filter creates a containing block that traps
 * position:fixed descendants. AccountPopover sets isOpen to true,
 * and MainInterface renders the drawer at the top level.
 */
import type { PropPreferenceState } from "#lib/shared/community/state/prop-preference-state.svelte.js";

let isOpen = $state(false);
let propState = $state<PropPreferenceState | null>(null);

export const myPropsDrawerState = {
  get isOpen() { return isOpen; },
  set isOpen(v: boolean) { isOpen = v; },
  get propState() { return propState; },
  set propState(v: PropPreferenceState | null) { propState = v; },

  open(state: PropPreferenceState) {
    propState = state;
    isOpen = true;
  },
  close() {
    isOpen = false;
  },
};
