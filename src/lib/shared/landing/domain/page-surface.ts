/**
 * Which marketing routes paint their own opaque surface over the cosmic
 * chrome, and what that surface is.
 *
 * The footer paints no surface of its own. Over a page that floats on the
 * shared star field it stays transparent, so the sky simply runs on beneath
 * it. A room page paints its own surface edge to edge instead, and a
 * transparent footer under it would drop back onto the sky and read as a
 * different site. Handing the footer the page's own surface keeps the two one
 * continuous page.
 *
 * MarketingChrome renders the footer as a sibling of the page, not a
 * descendant, so a page cannot publish this downward through CSS inheritance.
 * The chrome owns the route decision and both sides read the value from here.
 */

/** The archive room's ink. Shared by /history and the footer beneath it. */
export const ARCHIVE_INK = "oklch(0.115 0.008 270)";

/**
 * The guide book's canvas. The /guide hub and every page under it paint it
 * edge to edge (GuideShell publishes it to guide.css as --guide-canvas), and
 * the footer beneath continues it. The hub was once left out to keep the
 * homepage's live sky for a home -> hub morph; the launchpad tile that morphs
 * now leads to /learn/concepts (navigation-morphs.ts), so no morph lands here.
 */
export const GUIDE_CANVAS = "oklch(0.13 0.015 270)";

/**
 * The surface the page at `path` runs to the viewport edge, or `undefined`
 * when the page floats on the cosmic background and the footer stays
 * transparent over it.
 */
export function pageSurface(path: string): string | undefined {
  if (path === "/history") return ARCHIVE_INK;
  if (path === "/guide" || path.startsWith("/guide/")) return GUIDE_CANVAS;
  return undefined;
}
