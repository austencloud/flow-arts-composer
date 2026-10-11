/**
 * Which marketing routes paint their own opaque surface over the cosmic
 * chrome, and what that surface is.
 *
 * Every other public page floats its content on the shared star field, so the
 * footer's translucent scrim and hairline top border read as the page settling
 * onto the sky. A room page paints ink edge to edge instead: against that,
 * the same scrim darkens downward over nothing and the hairline draws a line
 * across a surface that is supposed to be continuous, so the footer stops
 * looking like the bottom of the page and starts looking like a different
 * site. Handing the footer the page's own surface removes both.
 *
 * MarketingChrome renders the footer as a sibling of the page, not a
 * descendant, so a page cannot publish this downward through CSS inheritance.
 * The chrome owns the route decision, exactly as it already does for the
 * footer variant, and both sides read the value from here.
 */

/** The archive room's ink. Shared by /history and the footer beneath it. */
export const ARCHIVE_INK = "oklch(0.115 0.008 270)";

/**
 * The guide book's canvas. Every deep /guide page paints it edge to edge
 * (GuideShell publishes it to guide.css as --guide-canvas), and the footer
 * beneath continues it. The /guide hub is left as it was: it shares the
 * homepage's chrome for the shared-element morph between the two.
 */
export const GUIDE_CANVAS = "oklch(0.13 0.015 270)";

/**
 * The surface the page at `path` runs to the viewport edge, or `undefined`
 * when the page floats on the cosmic background and the footer should keep
 * its scrim.
 */
export function pageSurface(path: string): string | undefined {
  if (path === "/history") return ARCHIVE_INK;
  if (path.startsWith("/guide/")) return GUIDE_CANVAS;
  return undefined;
}
