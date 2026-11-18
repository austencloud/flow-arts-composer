/**
 * How the workspace word label fits its slot. Pure: no DOM.
 *
 * The label is one row of units (letters and group dots), an optional
 * ellipsis, then the menu chevron, all sized in em. The caller measures each
 * piece at the label's normal size and passes the widths in px:
 *
 * - `unitWidths`: each display unit, in order.
 * - `gap`: the row's gap between neighbouring items. The chevron and the
 *   ellipsis are items too.
 * - `ellipsisWidth`: the "..." the label shows for a cut word.
 * - `trailingWidth`: the chevron with its margin.
 * - `fixedWidth`: what does not scale with the font (the button's padding and
 *   border).
 * - `available`: the slot's width.
 * - `minScale`: the smallest font scale allowed (the 12px letter floor over
 *   the label's font size). Capped at 1.
 * - `endsInEllipsis`: the word already ends in the ellipsis (a long word cut
 *   to its first letters), so the ellipsis is always shown and never doubled.
 * - `separators`: units that may not be the last one before the ellipsis (the
 *   group dots), so a cut word never ends in a hanging dot.
 *
 * The answer:
 *
 * 1. The whole row fits at normal size: scale 1, every unit.
 * 2. Otherwise the exact scale that fits, when it is at least `minScale`.
 * 3. Otherwise `minScale`, and the largest count of leading units that fits
 *    with the ellipsis and the chevron. Never fewer than one, even when one
 *    does not fit, because a label with no letter says nothing.
 *
 * Unmeasured input (no units, a missing or non-positive width, no room)
 * returns scale 1 and every unit: the label shows as it would with no fit at
 * all, and the next measurement corrects it.
 */

export interface WordLabelFitInput {
  unitWidths: readonly number[];
  gap: number;
  ellipsisWidth: number;
  trailingWidth: number;
  fixedWidth: number;
  available: number;
  minScale: number;
  endsInEllipsis?: boolean;
  separators?: readonly boolean[];
}

export interface WordLabelFit {
  /** Font scale for the visible row, 0 < scale <= 1. */
  scale: number;
  /** How many leading units show. */
  visibleCount: number;
  /** True when units were cut and the ellipsis stands for them. */
  truncated: boolean;
}

// Rounding the scale down a hair keeps sub-pixel rounding in the browser from
// pushing a row that fits exactly one pixel over its slot.
const SCALE_STEP = 1000;

function isMeasured(width: number): boolean {
  return Number.isFinite(width) && width > 0;
}

export function fitWordLabel(input: WordLabelFitInput): WordLabelFit {
  const {
    unitWidths,
    ellipsisWidth,
    trailingWidth,
    available,
    endsInEllipsis = false,
    separators,
  } = input;
  const count = unitWidths.length;
  const whole: WordLabelFit = {
    scale: 1,
    visibleCount: count,
    truncated: false,
  };

  if (count === 0 || !isMeasured(available)) return whole;
  if (!unitWidths.every(isMeasured)) return whole;

  const gap = Number.isFinite(input.gap) && input.gap > 0 ? input.gap : 0;
  const fixed =
    Number.isFinite(input.fixedWidth) && input.fixedWidth > 0
      ? input.fixedWidth
      : 0;
  const ellipsis = isMeasured(ellipsisWidth) ? ellipsisWidth : 0;
  const trailing = isMeasured(trailingWidth) ? trailingWidth : 0;
  const minScale =
    Number.isFinite(input.minScale) && input.minScale > 0
      ? Math.min(1, input.minScale)
      : 1;

  // Width at normal size of the first `shown` units, with or without the
  // ellipsis, plus the chevron and every gap between them.
  const prefix = [0];
  for (const width of unitWidths)
    prefix.push(prefix[prefix.length - 1]! + width);
  const rowWidth = (shown: number, withEllipsis: boolean): number => {
    const items =
      shown + (withEllipsis && ellipsis > 0 ? 1 : 0) + (trailing > 0 ? 1 : 0);
    return (
      prefix[shown]! +
      (withEllipsis ? ellipsis : 0) +
      trailing +
      gap * Math.max(0, items - 1)
    );
  };

  const room = available - fixed;
  const full = rowWidth(count, endsInEllipsis);
  if (room >= full) return whole;

  if (room > 0) {
    const exact = Math.floor((room / full) * SCALE_STEP) / SCALE_STEP;
    if (exact >= minScale) {
      return { scale: exact, visibleCount: count, truncated: false };
    }
  }

  // At the floor: the most leading units that still fit beside the ellipsis.
  // A cut word always shows the ellipsis, once.
  let shown = 1;
  for (let k = count - 1; k >= 1; k--) {
    if (separators?.[k - 1]) continue;
    if (fixed + minScale * rowWidth(k, true) <= available) {
      shown = k;
      break;
    }
  }
  return { scale: minScale, visibleCount: shown, truncated: true };
}
