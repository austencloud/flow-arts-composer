/**
 * A hand drawn alone is laid out as one hand (PictographContainer prepares a
 * visibleHand presentation that way), and a two-hand letter can lay the same
 * hand out differently: its arrow on the other side of its point, its prop
 * nudged off the other hand's. Fuse's halves and Assemble's blue-only beats
 * glide that hand's arrow and prop from the one layout to the other, so they
 * land where the two-hand pictograph draws them instead of snapping there.
 */
import type { HandSide } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";

/** The layers of one hand that a two-hand letter can lay out differently. */
const GLIDING_LAYERS = ["arrow", "prop"] as const;

export interface HandGlide {
  element: Element;
  keyframes: Keyframe[];
}

/**
 * The glides that carry `hand`'s arrow and prop in `from` to where `to`
 * draws them. Both pictographs must share one viewBox at one size, so the
 * target's transforms apply to the source as they are. A layer either one
 * lacks, or one already in place, gets no glide.
 */
export function handGlides(
  from: ParentNode,
  to: ParentNode,
  hand: HandSide
): HandGlide[] {
  const glides: HandGlide[] = [];
  for (const layer of GLIDING_LAYERS) {
    const selector = `.${hand}-${layer}-svg`;
    const element = from.querySelector(selector);
    const target = to.querySelector(selector);
    if (!element || !target) continue;
    const start = getComputedStyle(element).transform;
    const end = getComputedStyle(target).transform;
    if (start === end) continue;
    glides.push({
      element,
      keyframes: [{ transform: start }, { transform: end }],
    });
  }
  return glides;
}
