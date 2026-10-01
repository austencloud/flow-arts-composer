/** A scrollable catalog needs a useful window onto its choices, not room for
 * every choice at once. Other choosers still require their complete layout. */
export interface AppearanceScrollViewport {
  minColumns: number;
  visibleRows: number;
}

export function appearanceControlsFit(
  width: number,
  height: number,
  count: number,
  tileWidth: number,
  tileHeight: number,
  insetX = 0,
  chromeHeight = 0,
  columnChoices?: readonly number[],
  scrollViewport?: AppearanceScrollViewport
): boolean {
  const capacity = Math.floor((width - insetX + 8) / (tileWidth + 8));
  const columns = columnChoices
    ? Math.max(0, ...columnChoices.filter((value) => value <= capacity))
    : capacity;
  if (columns < (scrollViewport?.minColumns ?? 1) || count < 1) return false;
  const rows = Math.min(
    Math.ceil(count / columns),
    scrollViewport?.visibleRows ?? Infinity
  );
  return rows * tileHeight + (Math.ceil(rows) - 1) * 8 + chromeHeight <= height;
}
