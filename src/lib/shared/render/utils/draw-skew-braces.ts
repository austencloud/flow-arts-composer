/**
 * Canvas mirror of SkewBraces.svelte.
 *
 * Skewed-frame beats (one hand on a cardinal point, the other on an
 * intercardinal point) draw "{" and "}" around the letter glyph in the DOM
 * pictograph - see src/lib/shared/pictograph/tka-glyph/components/SkewBraces.svelte.
 * None of the canvas/PNG/PDF export paths painted that mark, so a skewed beat
 * lost its braces on export while the live DOM kept them. This helper draws
 * the same two glyphs at the same layout so the three canvas renderers
 * (layer-compositor, canvas-2d-direct-renderer via canvas-2d-glyph-renderer)
 * can reuse one implementation instead of each re-deriving the positions.
 *
 * Reuses getSkewBraceLayout for the letter-unit math - do not duplicate it
 * here. This file only maps those units into canvas pixels and issues the
 * draw calls, matching SkewBraces.svelte's font, alignment and fill choices.
 */
import { getSkewBraceLayout } from "../../pictograph/tka-glyph/utils/skew-brace-layout";

// Exported so other brace-drawing paths (e.g. export-glyph-prerenderer.ts,
// which paints via SVG <text> rather than a canvas ctx) share the exact same
// colours/font instead of re-declaring their own copies.
export const SKEW_BRACE_FILL_LIGHT = "#231f20";
export const SKEW_BRACE_FILL_DARK = "#d9d9d9";
// Matches SkewBraces.svelte's stack. The trailing "sans-serif" guarantees the
// braces still paint in workers and offscreen contexts, where the named local
// family ('Segoe UI') may resolve differently or not load at all (Chrome
// blocks local() font lookups in a worker for fingerprinting - see
// gelasio-fonts.ts, which bundles a face for exactly this reason). If a
// skewed beat ever enters the card-parity corpus, bundle a face for the
// braces the same way rather than relying on this fallback stack.
export const SKEW_BRACE_FONT_FAMILY = "system-ui, -apple-system, 'Segoe UI', sans-serif";
export const SKEW_BRACE_FONT_WEIGHT = "500";
const FILL_LIGHT = SKEW_BRACE_FILL_LIGHT;
const FILL_DARK = SKEW_BRACE_FILL_DARK;
const FONT_FAMILY = SKEW_BRACE_FONT_FAMILY;
const FONT_WEIGHT = SKEW_BRACE_FONT_WEIGHT;

export interface DrawSkewBracesOptions {
  readonly letter: string;
  /** Letter image dimensions in raw SVG/letter-image units (not yet scaled). */
  readonly letterDimensions: { width: number; height: number };
  /** Extra width to clear on the closing side - see getTurnsColumnRightExtent. */
  readonly rightExtent?: number;
  readonly darkMode: boolean;
  /** Canvas-pixel origin of the letter glyph (TKA_GLYPH_X/Y * scale). */
  readonly originX: number;
  readonly originY: number;
  /** Scale from letter-image units to canvas pixels (canvasSize / VIEWBOX_SIZE). */
  readonly scale: number;
}

/**
 * Draws the opening and closing skew braces around a letter glyph on a 2D
 * canvas context, at the same position SkewBraces.svelte renders them in the
 * DOM. Caller is responsible for the `letter && isSkewedFrameBeat(left, right)`
 * gate - this function always draws when called.
 */
export function drawSkewBraces(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  options: DrawSkewBracesOptions
): void {
  const { letter, letterDimensions, rightExtent = 0, darkMode, originX, originY, scale } = options;
  const layout = getSkewBraceLayout(letter, letterDimensions, { rightExtent });

  ctx.save();
  ctx.font = `${FONT_WEIGHT} ${layout.fontSize * scale}px ${FONT_FAMILY}`;
  ctx.textBaseline = "middle";
  ctx.fillStyle = darkMode ? FILL_DARK : FILL_LIGHT;

  const y = originY + layout.y * scale;

  // text-anchor="end" in SkewBraces.svelte: the brace's right edge sits at x.
  ctx.textAlign = "end";
  ctx.fillText("{", originX + layout.openX * scale, y);

  // text-anchor="start" in SkewBraces.svelte: the brace's left edge sits at x.
  ctx.textAlign = "start";
  ctx.fillText("}", originX + layout.closeX * scale, y);

  ctx.restore();
}
