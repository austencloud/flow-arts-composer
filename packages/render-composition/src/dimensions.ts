/**
 * Shared layout dimensions for choreo card rendering.
 *
 * Both the interactive ChoreoCard (Svelte CSS) and the export ImageComposer
 * (canvas) MUST use these constants. Having two copies is how the footer
 * sizing bug happened — never duplicate these values.
 */

// ── Height ratios (fraction of cell/step size) ──────────────────────────

/** Header height = 1/3 of cell size */
export const HEADER_HEIGHT_DIVISOR = 3;

/** Footer height = 1/7 of cell size */
export const FOOTER_HEIGHT_DIVISOR = 7;

/**
 * For grids narrower than 3 columns, header/footer become disproportionately
 * large relative to card width. This factor scales them down to stay compact.
 * At 3+ columns the factor is 1 (no scaling).
 */
export const NARROW_GRID_THRESHOLD = 3;


/** Difficulty badge diameter as fraction of header height */
export const BADGE_SIZE_SCALE = 0.6;

/**
 * Indicator diameter used on the 5:7 Choreo Card front. The physical deck
 * header is 90px tall, so 8/15 resolves to the approved 48px badge/icon size.
 */
export const CARD_FRONT_INDICATOR_SIZE_SCALE = 8 / 15;

/** Padding around badge as fraction of header height */
export const BADGE_PADDING_SCALE = 0.12;

/** Badge level number font size as fraction of badge size (1/1.75 from canvas renderer) */
export const BADGE_NUMBER_FONT_SCALE = 1 / 1.75;

/** Badge border width divisor (borderWidth = max(1, badgeSize / this)) */
export const BADGE_BORDER_WIDTH_DIVISOR = 50;

/** Word/title font size as fraction of header height */
export const HEADER_WORD_FONT_SCALE = 0.66;

/** Minimum word font size as fraction of header height (for long words) */
export const HEADER_WORD_FONT_MIN_SCALE = 0.35;

/**
 * Clear space between the centered word and whichever header indicator reaches
 * farther inward. The same inset is reserved on both sides so a wide LOOP
 * strip can shrink the word without pulling it off center.
 *
 * A quarter of the header height: 20px on the 80px header of a four-column
 * card, which is about half a LOOP icon of clear space. At 0.08 the gap was
 * 6px, so a long eight-count word shrank just enough to clear the level badge
 * and the LOOP strip and sat pressed against both, which made dense words feel
 * louder than they are. Short words never reach the inset, so they are
 * unchanged; the longest words shrink about 4% more than before.
 */
export const HEADER_WORD_BREATHING_GAP_SCALE = 0.25;


/** LOOP icon size as fraction of badge size */
export const LOOP_ICON_SIZE_SCALE = 1.0;

/** Gap between LOOP icons as fraction of icon size */
export const LOOP_ICON_GAP_SCALE = 0.15;

/** Rightward inset of the icon strip center as fraction of icon size */
export const LOOP_ICON_STRIP_OFFSET_SCALE = 0.2;

/**
 * Overlay-separator dot diameter as fraction of icon size. Matches the word
 * display's group-dot ratio (TKAWordGlyph.svelte DOT_SIZE_RATIO / WordHeader's
 * DOT_SIZE_SCALE) so the "faded dot between segments" grammar reads the same
 * everywhere it appears.
 */
export const LOOP_ICON_DOT_SIZE_SCALE = 0.15;

/** Overlay-separator dot opacity. Matches the word display's group-dot. */
export const LOOP_ICON_DOT_OPACITY = 0.4;


/** Font size as fraction of footer height */
export const FOOTER_FONT_SCALE = 0.55;

/** Horizontal margin as fraction of footer height */
export const FOOTER_MARGIN_SCALE = 0.3;

/** Vertical center of text as fraction of footer height (from top of footer) */
export const FOOTER_TEXT_Y_SCALE = 0.55;

/** Minimum gap between footer items as fraction of footer height */
export const FOOTER_GAP_SCALE = 0.2;


/**
 * Step number font ratio relative to cell size.
 * Derived from the canvas renderer's viewBox: NUMBER_FONT_SIZE / VIEW_BOX_SIZE = 100/950.
 */
export const STEP_NUMBER_FONT_RATIO = 100 / 950;

/** "Start"/"End" label font ratio relative to cell size (slightly smaller than numbers) */
export const STEP_LABEL_FONT_RATIO = 80 / 950;

/** Step number position offset ratio (from top-left of cell) */
export const STEP_NUMBER_OFFSET_RATIO = 50 / 950;

/** Max step number font size in px (CSS clamp for interactive card) */
export const STEP_NUMBER_FONT_MAX = 28;


/**
 * header/footer heights shrink proportionally so they don't dominate.
 */
export function narrowGridScale(columns: number): number {
  return columns >= NARROW_GRID_THRESHOLD ? 1 : columns / NARROW_GRID_THRESHOLD;
}

export function calculateHeaderHeight(
  stepSize: number,
  columns?: number
): number {
  const scale = columns != null ? narrowGridScale(columns) : 1;
  return Math.floor((stepSize * scale) / HEADER_HEIGHT_DIVISOR);
}

export function calculateFooterHeight(
  stepSize: number,
  columns?: number
): number {
  const scale = columns != null ? narrowGridScale(columns) : 1;
  return Math.floor((stepSize * scale) / FOOTER_HEIGHT_DIVISOR);
}
