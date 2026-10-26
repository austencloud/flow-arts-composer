import { getContext, setContext } from "svelte";
import type {
  EmanateParams,
  EmanateRect,
} from "#lib/shared/transitions/emanate.js";

/**
 * The option sheet's opening window. From the sheet's first paint until the
 * `emanate` arrival has run its course, a card that mounts comes from the
 * landed start cell. A card that mounts later (the option set grew after a
 * pick, a swipe panel mounted on first visit) takes the plain `arrive`: the
 * landing is over.
 */
export interface OptionSheetOpening {
  /** True while the opening arrival is still running. */
  readonly opening: boolean;
  /** The landed start cell's box, or null with no workspace or no drawn cell. */
  origin(): EmanateRect | null;
  /** The sheet's box. */
  bounds(): EmanateRect | null;
}

const OPTION_SHEET_OPENING_CONTEXT_KEY = Symbol("option-sheet-opening");

export function setOptionSheetOpeningContext(
  context: OptionSheetOpening
): void {
  setContext(OPTION_SHEET_OPENING_CONTEXT_KEY, context);
}

export function tryGetOptionSheetOpeningContext():
  | OptionSheetOpening
  | undefined {
  return getContext<OptionSheetOpening | undefined>(
    OPTION_SHEET_OPENING_CONTEXT_KEY
  );
}

/**
 * `emanate` parameters for the card at `index`. The origin is passed only while
 * the sheet is opening; outside that window, or outside an option sheet, the
 * card falls back to `arrive` keyed by `index`. Read when the intro starts.
 */
export function optionCardEmanate(
  sheet: OptionSheetOpening | undefined,
  index: number
): EmanateParams {
  if (!sheet?.opening) return { index };
  return { origin: sheet.origin, bounds: sheet.bounds, index };
}
