/**
 * How the tray's top bar (Off chip, then the Both / Left / Right row) is drawn,
 * decided from natural widths alone so no form can flicker into another.
 * The row is never dropped for a two-prop sequence.
 *
 *   words    the word chip, then the row. The row's three tracks are equal
 *            while each word fits at that share, else each is its own word's
 *            width (the CSS `minmax(max-content, 1fr)` does that part).
 *   icon     the icon-only chip, then the row at the same rule.
 *   pictures the icon-only chip and the row with the three words hidden
 *            together (names kept): only when even word-sized tracks do not
 *            fit beside the icon chip.
 *
 * `rowMin` is the row at word-sized tracks, its narrowest whole-word width.
 */
export type HandBarStep = "words" | "icon" | "pictures";

export function chooseHandBarStep(input: {
  wordChip: number;
  iconChip: number;
  rowMin: number;
  bar: number;
  gap: number;
}): HandBarStep {
  const { wordChip, iconChip, rowMin, bar, gap } = input;
  if (wordChip + gap + rowMin <= bar) return "words";
  if (iconChip + gap + rowMin <= bar) return "icon";
  return "pictures";
}
