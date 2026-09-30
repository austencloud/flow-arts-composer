import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
import { isVisibleMotion } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import { turnsTupleGenerator } from "$lib/shared/pictograph/arrow/positioning/placement/services/turns-tuple-generator";

/** The animation glyph's "no turns" tuple: no step, or a hand missing. */
export const NO_TURNS_TUPLE = "(s, 0, 0)";

/**
 * The turns tuple an animation glyph shows for one step. The overlay, the
 * hidden export renderer, and the engine all read it here, so a glyph's turns
 * always come from the same step as its letter.
 */
export function glyphTurnsTuple(
  stepData: PictographData | null | undefined,
  generator: {
    generateTurnsTuple(step: PictographData): string;
  } = turnsTupleGenerator
): string {
  if (
    !stepData ||
    !isVisibleMotion(stepData.motions?.left) ||
    !isVisibleMotion(stepData.motions?.right)
  ) {
    return NO_TURNS_TUPLE;
  }
  return generator.generateTurnsTuple(stepData);
}
