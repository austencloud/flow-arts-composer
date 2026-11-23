/**
 * The word screen (2026-11-22, Austen): a four-beat word shows the live
 * animation on top, centred and as big as the screen allows, and its four
 * beats in one row beneath. The start pose is not drawn again as a tile (the
 * animation holds it before it plays), and the small caption line is gone:
 * the player's own timing-and-direction mark, bottom right, says it.
 *
 * Pure so the choice is tested without a browser.
 */
import { isStartBox } from "#lib/shared/guide-topics/strip-to-sequence.js";
import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";

/** A word of more beats than this keeps its Start tile and its rows. */
export const WORD_STACK_BEATS = 4;

/**
 * The beats of a strip that is a start pose plus exactly four steps, else
 * null: longer words (16-count, 8-letter words) and shorter ones (two-letter
 * words) change nothing.
 */
export function wordStackBeats(
  items: readonly PictographData[]
): PictographData[] | null {
  if (items.length !== WORD_STACK_BEATS + 1) return null;
  if (!isStartBox(items[0] as unknown as StepData)) return null;
  return items.slice(1) as PictographData[];
}

/**
 * A caption that only names the word's timing and direction ("GGGG: β→β
 * Tog-Same", "MPMP: γ→γ (Opp)"): the player's mark shows that, so the caption
 * goes. A caption that says something the mark does not ("AABB: thumbs in |
 * in") stays.
 */
export function captionIsTimingNote(
  caption: string | null | undefined
): boolean {
  if (!caption) return false;
  const colon = caption.indexOf(":");
  const rest = colon >= 0 ? caption.slice(colon + 1) : caption;
  return /\b(Split|Tog|Quarter|Same|Opp)\b/.test(rest);
}
