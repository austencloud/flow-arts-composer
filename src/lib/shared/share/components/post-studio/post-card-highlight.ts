/** A card without a mapped playback beat is a still image with no active cell. */
export function postCardHighlightedStepIndex(
  displayedBeatNumber: number | undefined
): number | null {
  if (
    displayedBeatNumber === undefined ||
    !Number.isFinite(displayedBeatNumber)
  ) {
    return null;
  }
  return displayedBeatNumber < 1 ? -1 : displayedBeatNumber - 1;
}
