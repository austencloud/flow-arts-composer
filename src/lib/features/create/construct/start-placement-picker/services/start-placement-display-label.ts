import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";

/**
 * Formats the canonical static letter with its placement number, such as α1.
 */
export function getStartPlacementDisplayLabel(
  placement: Pick<PictographData, "letter" | "startPlacement">
): string | null {
  if (!placement.letter || !placement.startPlacement) return null;

  const number = placement.startPlacement.match(/\d+$/)?.[0];
  return number ? `${placement.letter}${number}` : placement.letter;
}
