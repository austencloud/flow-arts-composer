export type OptionControlsPresentation = "hidden" | "inline" | "disclosed";

interface OptionControlsPresentationInput {
  hasControls: boolean;
  fullInlineEligible: boolean;
  containerHeight: number;
  canShowTurnRows: boolean;
  /** The surface around the picker wants the settings behind their button. */
  preferTucked?: boolean;
}

// The compact 4×4 grid remains usable at 320px tall. Everything above that is
// available chrome: 88px for Options + Level, another 136px when both turn rows
// exist, and 16px so focus rings and the grid never touch the header seam.
const MIN_OPTION_SURFACE_HEIGHT = 320;
const COMPACT_HEADER_HEIGHT = 88;
const COMPACT_TURN_ROWS_HEIGHT = 136;
const INLINE_LAYOUT_BUFFER = 16;

export function minimumInlineControlsHeight(canShowTurnRows: boolean): number {
  return (
    MIN_OPTION_SURFACE_HEIGHT +
    COMPACT_HEADER_HEIGHT +
    INLINE_LAYOUT_BUFFER +
    (canShowTurnRows ? COMPACT_TURN_ROWS_HEIGHT : 0)
  );
}

export function selectOptionControlsPresentation({
  hasControls,
  fullInlineEligible,
  containerHeight,
  canShowTurnRows,
  preferTucked = false,
}: OptionControlsPresentationInput): OptionControlsPresentation {
  if (!hasControls) return "hidden";
  if (preferTucked) return "disclosed";
  if (fullInlineEligible) return "inline";

  return containerHeight >= minimumInlineControlsHeight(canShowTurnRows)
    ? "inline"
    : "disclosed";
}
