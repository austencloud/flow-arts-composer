/**
 * The pure math behind a post caption: which ones are on screen at a given
 * post time, how far into their fade they are, where their baseline sits,
 * and how their text breaks across lines. `caption-painter.ts` is the only
 * canvas-touching thing here - everything below takes plain numbers and a
 * measure function, so it is trivial to test without a real canvas.
 */

export type CaptionPosition = "top" | "middle" | "bottom";
export type CaptionSize = "s" | "m" | "l";

/** The slice of `CompiledCaption` this module actually needs. */
export interface CaptionLayoutInput {
  id: string;
  text: string;
  startSeconds: number;
  endSeconds: number;
  position: CaptionPosition;
  size: CaptionSize;
}

/** A caption on screen at some instant, with its fade already resolved. */
export interface ActiveCaption<T extends CaptionLayoutInput> {
  caption: T;
  alpha: number;
}

/** Short enough to read as a cut, long enough not to flicker. */
export const CAPTION_FADE_SECONDS = 0.15;

/**
 * Vertical anchors as a fraction of the frame height. Top and bottom sit off
 * the edges - 12% down, 18% up from the bottom - so a caption never collides
 * with a phone's status bar or Instagram's UI chrome; bottom also clears the
 * strip's own real estate lower in the frame.
 */
export const CAPTION_POSITION_FRACTION: Record<CaptionPosition, number> = {
  top: 0.12,
  middle: 0.5,
  bottom: 0.82,
};

/** Font size as a fraction of the frame width, InShot-caption scaled. */
export const CAPTION_SIZE_FRACTION: Record<CaptionSize, number> = {
  s: 0.055,
  m: 0.075,
  l: 0.1,
};

/** A caption never spans edge to edge; this leaves breathing room. */
export const CAPTION_MAX_WIDTH_FRACTION = 0.86;

/** The dark outline's stroke width, as a fraction of the font size. */
export const CAPTION_STROKE_WIDTH_FRACTION = 0.18;

/** Line spacing for a wrapped caption, as a multiple of its font size. */
export const CAPTION_LINE_HEIGHT_FRACTION = 1.2;

export const CAPTION_FONT_FAMILY = "Fraunces";
/** The app's only cut of its display face - self-hosted, loaded app-wide. */
export const CAPTION_FONT_STYLE = "italic";
export const CAPTION_FONT_WEIGHT = 700;
/** What paints when Fraunces has not loaded (or never will, e.g. no DOM). */
export const CAPTION_FALLBACK_FONT_STACK =
  'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/** A canvas `font` string a probe can hand to `document.fonts.load`. */
export function captionFontProbe(fontPx: number): string {
  return `${CAPTION_FONT_STYLE} ${CAPTION_FONT_WEIGHT} ${fontPx}px "${CAPTION_FONT_FAMILY}"`;
}

/**
 * The canvas `font` string to paint with. When Fraunces has not loaded, the
 * fallback goes to a heavy weight of the system stack rather than italic 700
 * of a family that was never fetched - a "700 Fraunces, sans-serif" string
 * paints in the browser's default (thin) weight of the fallback, which reads
 * nothing like the intended bold caption.
 */
export function captionFontString(fontPx: number, fontReady: boolean): string {
  return fontReady
    ? `${captionFontProbe(fontPx)}, ${CAPTION_FALLBACK_FONT_STACK}`
    : `900 ${fontPx}px ${CAPTION_FALLBACK_FONT_STACK}`;
}

/**
 * 0 to 1 across a short fade in and out at the caption's own edges. A caption
 * shorter than two fades splits the difference so it never holds at 1 for an
 * instant only to immediately fall back to 0.
 */
export function captionAlpha(
  caption: Pick<CaptionLayoutInput, "startSeconds" | "endSeconds">,
  timeSeconds: number,
  fadeSeconds: number = CAPTION_FADE_SECONDS
): number {
  const span = caption.endSeconds - caption.startSeconds;
  const fade = Math.min(fadeSeconds, span / 2);
  if (fade <= 0) return 1;
  const sinceStart = timeSeconds - caption.startSeconds;
  const untilEnd = caption.endSeconds - timeSeconds;
  return Math.max(0, Math.min(1, sinceStart / fade, untilEnd / fade));
}

/** Every caption whose span contains `timeSeconds`, each with its alpha. */
export function activeCaptionsAtTime<T extends CaptionLayoutInput>(
  captions: readonly T[],
  timeSeconds: number,
  fadeSeconds: number = CAPTION_FADE_SECONDS
): ActiveCaption<T>[] {
  const active: ActiveCaption<T>[] = [];
  for (const caption of captions) {
    if (
      timeSeconds < caption.startSeconds ||
      timeSeconds >= caption.endSeconds
    ) {
      continue;
    }
    active.push({
      caption,
      alpha: captionAlpha(caption, timeSeconds, fadeSeconds),
    });
  }
  return active;
}

/** A caption's font size in pixels, scaled off the frame it paints into. */
export function captionFontPx(size: CaptionSize, rectWidth: number): number {
  return rectWidth * CAPTION_SIZE_FRACTION[size];
}

/** The y of a caption's vertical center, in the same pixels as `rect`. */
export function captionCenterY(
  position: CaptionPosition,
  rect: { y: number; height: number }
): number {
  return rect.y + rect.height * CAPTION_POSITION_FRACTION[position];
}

/**
 * Greedy word wrap: adds words to the current line while `measureWidth` says
 * it still fits `maxWidth`, otherwise starts a new line. A single word wider
 * than `maxWidth` still gets its own line rather than being split - a post
 * caption is short enough that this never runs away.
 */
export function wrapCaptionText(
  text: string,
  measureWidth: (line: string) => number,
  maxWidth: number
): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const lines: string[] = [];
  let current = words[0]!;
  for (let index = 1; index < words.length; index++) {
    const word = words[index]!;
    const attempt = `${current} ${word}`;
    if (measureWidth(attempt) <= maxWidth) {
      current = attempt;
    } else {
      lines.push(current);
      current = word;
    }
  }
  lines.push(current);
  return lines;
}

/** The baseline y of each wrapped line, centered on the caption's anchor. */
export function captionLineYPositions(
  centerY: number,
  lineCount: number,
  lineHeight: number
): number[] {
  const totalHeight = lineHeight * lineCount;
  const firstLineY = centerY - totalHeight / 2 + lineHeight / 2;
  return Array.from(
    { length: lineCount },
    (_, index) => firstLineY + index * lineHeight
  );
}
