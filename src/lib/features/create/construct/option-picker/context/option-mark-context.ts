import { getContext, setContext } from "svelte";
import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";

/** The small round mark a tab puts on some of the steps in the list. */
export interface OptionMarkLook {
  /** Font Awesome icon class. */
  icon: string;
  color: string;
  /** What reads on top of the colour. */
  on: string;
  /** What the mark means, said after the step's own name. */
  label: string;
}

/** Lets the tab around the step list point out some of its steps. */
export interface OptionMarkContext {
  /** The mark in use, or null when no step is special just now. */
  readonly mark: OptionMarkLook | null;
  isMarked(option: PictographData): boolean;
  /** Told each time the list has finished loading its steps. */
  onListed(options: readonly PictographData[]): void;
}

const OPTION_MARK_CONTEXT_KEY = Symbol("option-mark");

export function setOptionMarkContext(context: OptionMarkContext): void {
  setContext(OPTION_MARK_CONTEXT_KEY, context);
}

export function tryGetOptionMarkContext(): OptionMarkContext | undefined {
  return getContext<OptionMarkContext | undefined>(OPTION_MARK_CONTEXT_KEY);
}
