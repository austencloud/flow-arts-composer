import { isDashLetter } from "./letter-image-getter";

/** Same numbers Dash.svelte uses so the closing brace clears a dash letter. */
const DASH_WIDTH = 70;
const DASH_GAP = 10;

/** Space between the letter image (or its dash) and a brace, in glyph units. */
export const SKEW_BRACE_GAP = 14;

/** Brace glyph height relative to the letter image height. */
export const SKEW_BRACE_FONT_SCALE = 1.15;

export interface SkewBraceLayout {
  /** x of the opening brace (text-anchor end). */
  readonly openX: number;
  /** x of the closing brace (text-anchor start). */
  readonly closeX: number;
  /** Vertical centre of the letter image. */
  readonly y: number;
  readonly fontSize: number;
}

export interface SkewBraceLayoutOptions {
  /**
   * Extra width, in glyph units, to the right of the letter+dash reference
   * edge that the closing brace must clear before it can open - the space
   * TurnsColumn's rendered turn numbers (and any halved-motion mark) occupy.
   * Zero when no turn slot will display. See getTurnsColumnRightExtent in
   * turn-position-calculator.ts, which mirrors TurnsColumn.svelte's own
   * columnWidth math to produce this value.
   */
  readonly rightExtent?: number;
}

export function getSkewBraceLayout(
  letter: string,
  letterDimensions: { width: number; height: number },
  options?: SkewBraceLayoutOptions
): SkewBraceLayout {
  const dashExtent = isDashLetter(letter) ? DASH_GAP + DASH_WIDTH : 0;
  const rightExtent = options?.rightExtent ?? 0;
  return {
    openX: -SKEW_BRACE_GAP,
    closeX: letterDimensions.width + dashExtent + rightExtent + SKEW_BRACE_GAP,
    y: letterDimensions.height / 2,
    fontSize: letterDimensions.height * SKEW_BRACE_FONT_SCALE,
  };
}

/** The braces are system-font text, not glyph images. */
export const SKEW_BRACE_FONT_FAMILY = "system-ui, -apple-system, 'Segoe UI', sans-serif";
export const SKEW_BRACE_FONT_WEIGHT = "500";

/**
 * Where one brace glyph's ink sits, per unit of font size, in canvas
 * TextMetrics terms: `left` and `right` run from a left-aligned text origin
 * (a positive `left` reaches left of it), `ascent` and `descent` from the
 * alphabetic baseline.
 */
export interface BraceGlyphInk {
  readonly left: number;
  readonly right: number;
  readonly ascent: number;
  readonly descent: number;
}

/**
 * Ink of both braces, plus the font's ascent and descent: the box a
 * "central"/"middle" baseline or a CSS line box centres. A brace's ink does
 * not sit in the middle of that box. In Segoe UI it runs 0.70em above the
 * baseline and 0.17em below while the box runs 1.08em above and 0.25em below,
 * so centring the box leaves the visible brace 0.15em low. The gap differs by
 * font (Arial 0.09em, Roboto 0.10em), so the renderers measure it.
 */
export interface SkewBraceInk {
  readonly open: BraceGlyphInk;
  readonly close: BraceGlyphInk;
  readonly fontAscent: number;
  readonly fontDescent: number;
}

/**
 * Segoe UI weight 500 (system-ui on Windows), measured in Chromium at 1000px.
 * Used wherever no canvas can measure: SSR, jsdom tests, old browsers.
 */
export const DEFAULT_SKEW_BRACE_INK: SkewBraceInk = {
  open: { left: -0.0469, right: 0.2969, ascent: 0.7031, descent: 0.1719 },
  close: { left: -0.0313, right: 0.2969, ascent: 0.7031, descent: 0.1719 },
  fontAscent: 1.079,
  fontDescent: 0.251,
};

/** The slice of a 2D context brace measurement uses. */
export interface BraceMeasureContext {
  font: string;
  textAlign: string;
  textBaseline: string;
  save(): void;
  restore(): void;
  measureText?(text: string): TextMetrics;
}

/**
 * Brace ink measured on `ctx`, whose font must already be set at `fontPx`.
 * Null when the context cannot report glyph ink (no measureText, or empty
 * metrics), so the caller can fall back.
 */
export function measureSkewBraceInk(
  ctx: BraceMeasureContext,
  fontPx: number
): SkewBraceInk | null {
  if (typeof ctx.measureText !== "function" || !(fontPx > 0)) return null;
  ctx.save();
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  const open = ctx.measureText("{");
  const close = ctx.measureText("}");
  ctx.restore();

  const glyph = (m: TextMetrics): BraceGlyphInk | null => {
    const ink = {
      left: m.actualBoundingBoxLeft / fontPx,
      right: m.actualBoundingBoxRight / fontPx,
      ascent: m.actualBoundingBoxAscent / fontPx,
      descent: m.actualBoundingBoxDescent / fontPx,
    };
    const finite = Object.values(ink).every(Number.isFinite);
    return finite && ink.ascent + ink.descent > 0 && ink.left + ink.right > 0 ? ink : null;
  };
  const openInk = glyph(open);
  const closeInk = glyph(close);
  const fontAscent = open.fontBoundingBoxAscent / fontPx;
  const fontDescent = open.fontBoundingBoxDescent / fontPx;
  if (!openInk || !closeInk || !Number.isFinite(fontAscent) || !Number.isFinite(fontDescent)) {
    return null;
  }
  return { open: openInk, close: closeInk, fontAscent, fontDescent };
}

let pageInk: SkewBraceInk | null = null;

/**
 * Brace ink for the fonts this page (or worker) resolves, measured once on an
 * OffscreenCanvas. Falls back to the Segoe UI numbers where none exists.
 */
export function getSkewBraceInk(): SkewBraceInk {
  if (pageInk) return pageInk;
  if (typeof OffscreenCanvas === "undefined") return DEFAULT_SKEW_BRACE_INK;
  const ctx = new OffscreenCanvas(1, 1).getContext("2d");
  if (!ctx) return DEFAULT_SKEW_BRACE_INK;
  const fontPx = 1000;
  ctx.font = `${SKEW_BRACE_FONT_WEIGHT} ${fontPx}px ${SKEW_BRACE_FONT_FAMILY}`;
  pageInk = measureSkewBraceInk(ctx, fontPx);
  return pageInk ?? DEFAULT_SKEW_BRACE_INK;
}

export interface SkewBraceGlyphPlacement {
  /** Text origins, left-aligned on the alphabetic baseline, in glyph units. */
  readonly open: { readonly x: number; readonly y: number };
  readonly close: { readonly x: number; readonly y: number };
  /** Left edge of the opening brace's ink. */
  readonly inkLeft: number;
  /** Right edge of the closing brace's ink. */
  readonly inkRight: number;
}

/**
 * Where to draw the two brace glyphs so their ink, not their font box, sits
 * on the layout: each brace's ink centred on the letter's centre line, the
 * opening brace's ink ending at `openX` and the closing brace's ink starting
 * at `closeX`. Draw with left alignment on the alphabetic baseline.
 */
export function placeSkewBraceGlyphs(
  layout: SkewBraceLayout,
  ink: SkewBraceInk = DEFAULT_SKEW_BRACE_INK
): SkewBraceGlyphPlacement {
  const size = layout.fontSize;
  const baseline = (glyph: BraceGlyphInk) =>
    layout.y + ((glyph.ascent - glyph.descent) / 2) * size;
  const openX = layout.openX - ink.open.right * size;
  const closeX = layout.closeX + ink.close.left * size;
  return {
    open: { x: openX, y: baseline(ink.open) },
    close: { x: closeX, y: baseline(ink.close) },
    inkLeft: openX - ink.open.left * size,
    inkRight: closeX + ink.close.right * size,
  };
}

/**
 * How far, in em of the brace font, a brace's ink centre sits below the middle
 * of a `line-height: 1` box. HTML surfaces raise the brace by this much.
 */
export function skewBraceLineBoxDrop(ink: SkewBraceInk = DEFAULT_SKEW_BRACE_INK): number {
  return (ink.fontAscent - ink.fontDescent) / 2 - (ink.open.ascent - ink.open.descent) / 2;
}

/**
 * Brace font size per unit of letter height that inks the brace as tall as
 * SKEW_BRACE_FONT_SCALE does in Segoe UI, the face it was tuned on. The fixed
 * scale draws a taller brace wherever system-ui resolves to a face whose "{"
 * inks more of the em (DejaVu Sans on Linux about 8% taller, Roboto 6%).
 */
export function skewBraceInkFontScale(ink: SkewBraceInk = DEFAULT_SKEW_BRACE_INK): number {
  const tuned = DEFAULT_SKEW_BRACE_INK.open;
  return (SKEW_BRACE_FONT_SCALE * (tuned.ascent + tuned.descent)) / (ink.open.ascent + ink.open.descent);
}
