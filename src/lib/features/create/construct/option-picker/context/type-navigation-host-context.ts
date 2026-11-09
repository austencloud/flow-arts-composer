import { getContext, setContext } from "svelte";

/**
 * A surface that hosts the option picker can ask for the letter-type tabs
 * (1, 2, 3, 4-6 and the guide button) to stand in the picker's left rail
 * instead of a row across its top. The Composer's Construct card uses this
 * once it is stacked, so the grid gets the tabs' row back and its action row
 * keeps the app's own arrangement (clear, Play, undo/redo).
 *
 * The getter is read reactively: return false and the tabs go back to their
 * usual row (or to the rail when the picker's own size calls for it).
 */
export interface TypeNavigationHost {
  preferRail(): boolean;
}

const TYPE_NAVIGATION_HOST_KEY = Symbol("option-type-navigation-host");

export function setTypeNavigationHostContext(host: TypeNavigationHost): void {
  setContext(TYPE_NAVIGATION_HOST_KEY, host);
}

export function tryGetTypeNavigationHostContext():
  | TypeNavigationHost
  | undefined {
  return getContext<TypeNavigationHost | undefined>(TYPE_NAVIGATION_HOST_KEY);
}
