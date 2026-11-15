/**
 * Decides which variation, if any, a card should prepare ahead of the next tap.
 *
 * Preparing costs a thumbnail lookup (or render) per card, so it starts only
 * after the visitor has tapped the pill once on that card: a gallery of cards
 * with dozens of variations each must not prepare every neighbour on load. It
 * looks one ahead, wrapping at the end exactly as the pill's own cycling does.
 */
export function nextVariationToPrepare(state: {
  variationCount: number;
  currentIndex: number;
  /** The visitor has tapped the pill at least once on this card. */
  hasTapped: boolean;
  /** The shown variation's picture is in place. */
  pictureShown: boolean;
}): number | null {
  const { variationCount, currentIndex, hasTapped, pictureShown } = state;
  if (!hasTapped || !pictureShown) return null;
  if (variationCount <= 1) return null;
  return (currentIndex + 1) % variationCount;
}
