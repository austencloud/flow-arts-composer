/**
 * Pans a sideways-scrolling row of pills only as far as brings one pill into
 * view, and always to a pill's own edge, so the row never starts on half a
 * name (2026-10-31, Austen's review: centring the current pill sliced its
 * neighbours mid-word). Near the row's end, where the row cannot pan that
 * far, it gains room after its last pill instead of stopping on a cut one.
 * The page itself never scrolls.
 */
export function revealInRow(row: HTMLElement, item: HTMLElement): void {
  row.style.paddingInlineEnd = "";
  // Positions along the row's scrolled content, whatever its offset parent.
  const origin = row.getBoundingClientRect().left - row.scrollLeft;
  const at = (el: Element) => el.getBoundingClientRect().left - origin;
  const start = at(item);
  const end = start + item.getBoundingClientRect().width;
  if (start < row.scrollLeft) {
    row.scrollLeft = start;
    return;
  }
  if (end <= row.scrollLeft + row.clientWidth) return;
  // The first pill edge far enough right that the item's end shows.
  const least = end - row.clientWidth;
  const target = [...row.children].map(at).find((s) => s >= least - 0.5) ?? start;
  const reach = row.scrollWidth - row.clientWidth;
  if (target > reach) {
    const base = parseFloat(getComputedStyle(row).paddingInlineEnd) || 0;
    row.style.paddingInlineEnd = `${base + Math.ceil(target - reach)}px`;
  }
  row.scrollLeft = target;
}
