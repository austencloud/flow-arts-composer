import { getContext, setContext } from "svelte";
import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";

export interface OptionAuditionContext {
  /**
   * Opens a transient animation preview. Returning false leaves the ordinary
   * tap interaction untouched.
   */
  start(option: PictographData): boolean;
  /** Closes only the transient preview owned by the active hold. */
  end(): void;
}

const OPTION_AUDITION_CONTEXT_KEY = Symbol("option-audition");

export function setOptionAuditionContext(context: OptionAuditionContext): void {
  setContext(OPTION_AUDITION_CONTEXT_KEY, context);
}

export function tryGetOptionAuditionContext():
  | OptionAuditionContext
  | undefined {
  return getContext<OptionAuditionContext | undefined>(
    OPTION_AUDITION_CONTEXT_KEY
  );
}
