import { getContext, setContext } from "svelte";
import {
  emanate,
  type EmanateIntro,
  type EmanateParams,
  type EmanateRect,
  type EmanateWave,
} from "#lib/shared/transitions/emanate.js";
import { flyFade, motionDuration } from "#lib/shared/transitions/motion.js";
import { STAGGER } from "#lib/shared/transitions/transitions.js";

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
  /**
   * True when the layout stacks the workspace above the sheet (phones). The
   * layout's own flag: the sheet's box can still be the start picker's panel
   * when the cards mount, so it cannot tell the two layouts apart.
   */
  stacked(): boolean;
  /**
   * The sheet's box and the time since it opened, for the stacked wave that
   * carries the controls and the cards down the sheet together.
   */
  wave(): EmanateWave | null;
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
  return {
    origin: sheet.origin,
    bounds: sheet.bounds,
    stacked: () => sheet.stacked(),
    wave: sheet.wave,
    index,
  };
}

/**
 * Intro for one of the sheet's own controls (a row of the header, a level
 * pill, the type tabs). On a stacked sheet that is opening, the control takes
 * its place in the wave ahead of the cards below it. Side by side, a control
 * below the header follows the header's fade by one beat. Otherwise it does
 * nothing, so a control that mounts later (a settings panel opened, the
 * layout changed) keeps whatever motion its own component gives it.
 */
export function optionSheetControlIn(
  node: Element,
  {
    sheet,
    across = false,
    below = false,
  }: {
    sheet: OptionSheetOpening | undefined;
    across?: boolean;
    /** Sits below the header slot rather than inside it. */
    below?: boolean;
  }
): EmanateIntro {
  if (!sheet?.opening) return { duration: 0 };
  if (!sheet.stacked()) {
    // Side by side, the header slot fades in as one block. A control below
    // it (the type tabs) follows one beat later, so the sheet still reads
    // top to bottom: header, tabs, then the cards.
    return below
      ? flyFade(node, { y: 6, delay: motionDuration(STAGGER.relaxed) })
      : { duration: 0 };
  }
  return emanate(node, {
    stacked: () => true,
    wave: sheet.wave,
    across,
  });
}

/** True when the sheet's controls are arriving as part of its wave. */
export function optionSheetControlsInWave(
  sheet: OptionSheetOpening | undefined
): boolean {
  return Boolean(sheet?.opening && sheet.stacked());
}
