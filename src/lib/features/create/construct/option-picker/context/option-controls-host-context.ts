import { getContext, setContext } from "svelte";

/**
 * A surface that hosts the option picker can ask it to keep its settings (the
 * spin filter, Level and turns) behind their button at every size, and to drop
 * the type heading its tabs already give. The LOOP tab uses this: its own
 * header says what to do next, so the list below it starts with the steps.
 *
 * The getter is read reactively: return false and the picker chooses by its
 * own size again.
 */
export interface OptionControlsHost {
  preferTucked(): boolean;
}

const OPTION_CONTROLS_HOST_KEY = Symbol("option-controls-host");

export function setOptionControlsHostContext(host: OptionControlsHost): void {
  setContext(OPTION_CONTROLS_HOST_KEY, host);
}

export function tryGetOptionControlsHostContext():
  | OptionControlsHost
  | undefined {
  return getContext<OptionControlsHost | undefined>(OPTION_CONTROLS_HOST_KEY);
}
