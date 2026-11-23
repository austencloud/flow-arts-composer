import { PropType } from "../../../prop/domain/enums/prop-type";

/**
 * A picture that draws hands is a hand path, not a letter. Austen's standing
 * rule (2026-11-22): "If a pictograph or an animation is displaying hands, it
 * is not a letter. It has no letter." So when both props are drawn as hands,
 * the letter glyph and its turn and float marks stay off, whatever the caller
 * or the visitor's settings ask for. One hand drawn beside a prop is not a
 * hands picture, and keeps its letter.
 */
export function drawsOnlyHands(
  left: PropType | undefined,
  right: PropType | undefined
): boolean {
  return left === PropType.HAND && right === PropType.HAND;
}

/** The letter glyph (with its turns and float marks) may show only if asked
 *  to AND the picture is not drawing hands. */
export function letterGlyphVisible(
  asked: boolean,
  left: PropType | undefined,
  right: PropType | undefined
): boolean {
  return asked && !drawsOnlyHands(left, right);
}
