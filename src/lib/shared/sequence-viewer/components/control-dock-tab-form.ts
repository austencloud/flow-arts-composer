/**
 * Which form the ControlDock's tab row takes, decided from whether the tab
 * names fit rather than from a width number.
 *
 *   "row"      one row, picture above name (the classic dock)
 *   "two-rows" picture beside name, the first half of the tabs on top (the
 *              larger half when the count is odd), the rest below with the
 *              trailing action at the end of the bottom row
 *   "icons"    one row of pictures only, for when two rows can't hold every
 *              name either
 *
 * Names are never cut or shortened, so a form only wins when every name is
 * whole in it. The geometry constants mirror ControlDock's CSS; change them
 * together.
 */

export type DockTabForm = "row" | "two-rows" | "icons";

/** Gap between tabs, and between the two rows. */
export const TAB_GAP = 4;
/** Gap between the tab strip and the trailing actions in the one-row form. */
export const ACTIONS_GAP = 6;
/** Tab border, each side. */
const TAB_BORDER = 1;
/** Side padding of a two-row tab: the name's clear room from its edge. */
const NAME_SIDE_ROOM = 4;
/**
 * Side padding of a one-row tab (the classic form keeps its own 2 px). A
 * name is whole when it fits inside that padding.
 */
const ROW_SIDE_PADDING = 2;
/** Picture-to-name gap in the two-row form. */
export const GLYPH_NAME_GAP = 4;
/**
 * The Effects tab's picture slot: the 29x20 chip of the effect that is on.
 * The slot keeps this width with the effect off (the wand) and with the tray
 * open (the chevron), so the tab never changes width and the row cannot flip
 * form when an effect is picked. Mirrors `.two-rows .cat-glyph` in
 * ControlDock.svelte (its `--glyph-w`).
 */
export const EFFECT_GLYPH_WIDTH = 29;
/** The shared touch-target floor; a one-row tab never goes narrower. */
const TOUCH_MIN = 44;
/** Trailing action width in the two-row form. */
export const TWO_ROW_TRAILING_WIDTH = 44;

export interface DockTabFormInput {
  /** Each name's natural width at the dock's name size, in tab order. */
  labelWidths: readonly number[];
  /** Each tab's picture slot width, in tab order. */
  glyphWidths: readonly number[];
  /** Inner width of the bar (dock width minus the bar's side padding). */
  barWidth: number;
  /**
   * Width the trailing actions take beside the tabs in the one-row form
   * (0 when the tabs have the row to themselves).
   */
  rowActionsWidth: number;
  /** Whether a trailing action rides at the end of the bottom row. */
  hasTrailing: boolean;
  /** Docks that stack their own actions row may not add a tab row too. */
  allowTwoRows: boolean;
}

/** How many tabs the top row of the two-row form holds. */
export function topRowCount(tabCount: number): number {
  return Math.ceil(tabCount / 2);
}

function sum(values: readonly number[]): number {
  return values.reduce((total, v) => total + v, 0);
}

function fitsOneRow(input: DockTabFormInput): boolean {
  const n = input.labelWidths.length;
  if (n === 0) return true;
  const strip =
    input.barWidth -
    (input.rowActionsWidth > 0 ? input.rowActionsWidth + ACTIONS_GAP : 0);
  // One-row tabs share the strip equally (flex: 1 0 44px), so the widest
  // name decides.
  const share = (strip - TAB_GAP * (n - 1)) / n;
  if (share < TOUCH_MIN) return false;
  const widest = Math.max(...input.labelWidths.map(Math.ceil));
  return widest + 2 * (ROW_SIDE_PADDING + TAB_BORDER) <= share;
}

/** A two-row tab is as wide as its own picture and name, plus room. */
function twoRowTabWidth(label: number, glyph: number): number {
  return (
    2 * (TAB_BORDER + NAME_SIDE_ROOM) +
    glyph +
    GLYPH_NAME_GAP +
    Math.ceil(label)
  );
}

function fitsTwoRows(input: DockTabFormInput): boolean {
  const n = input.labelWidths.length;
  if (n < 2) return false;
  const widths = input.labelWidths.map((w, i) =>
    twoRowTabWidth(w, input.glyphWidths[i] ?? 0)
  );
  const k = topRowCount(n);
  const top = widths.slice(0, k);
  const bottom = widths.slice(k);
  const topWidth = sum(top) + TAB_GAP * (top.length - 1);
  const bottomWidth =
    sum(bottom) +
    TAB_GAP * (bottom.length - 1) +
    (input.hasTrailing ? TAB_GAP + TWO_ROW_TRAILING_WIDTH : 0);
  return topWidth <= input.barWidth && bottomWidth <= input.barWidth;
}

export function chooseDockTabForm(input: DockTabFormInput): DockTabForm {
  if (fitsOneRow(input)) return "row";
  if (input.allowTwoRows && fitsTwoRows(input)) return "two-rows";
  return "icons";
}
