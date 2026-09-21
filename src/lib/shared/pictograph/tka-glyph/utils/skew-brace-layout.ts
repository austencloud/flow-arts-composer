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

export function getSkewBraceLayout(
  letter: string,
  letterDimensions: { width: number; height: number }
): SkewBraceLayout {
  const dashExtent = isDashLetter(letter) ? DASH_GAP + DASH_WIDTH : 0;
  return {
    openX: -SKEW_BRACE_GAP,
    closeX: letterDimensions.width + dashExtent + SKEW_BRACE_GAP,
    y: letterDimensions.height / 2,
    fontSize: letterDimensions.height * SKEW_BRACE_FONT_SCALE,
  };
}
