/**
 * How a reflow page's first paragraph relates to its hero tagline. Most
 * taglines were lifted from the page's own intro, so the same sentence would
 * show twice: once under the title, again as the paragraph's opening.
 *
 * - "same": the paragraph is just the tagline; FlowFrame drops the paragraph.
 * - "contains": the paragraph says more; the hero drops the tagline so the
 *   intro stays whole and in Austen's words.
 * - "none": both show.
 */
import type { GuideBlock } from "./guide-content-blocks";
import { localizeLevel1Text } from "./localize-level1-content";

export const stripHtml = (html: string) =>
  html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();

export type TaglineInIntro = "same" | "contains" | "none";

export function taglineInIntro(
  content: readonly GuideBlock[],
  tagline: string
): TaglineInIntro {
  const tag = stripHtml(tagline);
  if (!tag) return "none";
  // Every paragraph of the intro counts: the run of prose before the first
  // heading or figure (LOOPs' tagline is its second paragraph).
  let found: TaglineInIntro = "none";
  for (const b of content) {
    if (b.kind === "heading" && b.level === 1) continue;
    if (b.kind !== "prose") break;
    const intro = stripHtml(localizeLevel1Text(b.html));
    if (intro === tag) return "same";
    if (intro.includes(tag)) found = "contains";
  }
  return found;
}
