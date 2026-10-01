/** Minimum room for the complete chooser, including its own headings/insets.
 * A smaller inspector opens the same controls in a drawer instead of shrinking
 * labels or hiding the last rows behind the timeline. */
export function appearanceControlsFit(
  width: number,
  height: number,
  count: number,
  tileWidth: number,
  tileHeight: number,
  insetX = 0,
  chromeHeight = 0
): boolean {
  const columns = Math.floor((width - insetX + 8) / (tileWidth + 8));
  if (columns < 1 || count < 1) return false;
  const rows = Math.ceil(count / columns);
  return rows * tileHeight + (rows - 1) * 8 + chromeHeight <= height;
}
