export const ELEMENTAL_GLYPH_VIEWBOX_SIZE = 950;

export const ELEMENTAL_GLYPH_LAYOUT = {
  width: 96,
  height: 112,
  inset: 40,
} as const;

export interface ElementalGlyphBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type ElementalGlyphCorner = "top-right" | "bottom-right";

/**
 * The prop timing-and-direction glyph is the same element icon as the hand
 * glyph, set in the opposite corner. The corner alone tells the two
 * relationships apart; neither carries a ring or label.
 */

/** Scale the canonical pictograph slot to any square canvas. */
export function getElementalGlyphBox(
  canvasSize: number,
  xOffset = 0,
  corner: ElementalGlyphCorner = "bottom-right"
): ElementalGlyphBox {
  const scale = canvasSize / ELEMENTAL_GLYPH_VIEWBOX_SIZE;
  return {
    x:
      (ELEMENTAL_GLYPH_VIEWBOX_SIZE -
        ELEMENTAL_GLYPH_LAYOUT.width -
        ELEMENTAL_GLYPH_LAYOUT.inset +
        xOffset) *
      scale,
    y:
      (corner === "top-right"
        ? ELEMENTAL_GLYPH_LAYOUT.inset
        : ELEMENTAL_GLYPH_VIEWBOX_SIZE -
          ELEMENTAL_GLYPH_LAYOUT.height -
          ELEMENTAL_GLYPH_LAYOUT.inset) * scale,
    width: ELEMENTAL_GLYPH_LAYOUT.width * scale,
    height: ELEMENTAL_GLYPH_LAYOUT.height * scale,
  };
}

/** Match SVG's xMidYMid meet behavior without stretching the source art. */
export function containElementalGlyph(
  box: ElementalGlyphBox,
  sourceWidth: number,
  sourceHeight: number
): ElementalGlyphBox | null {
  if (sourceWidth <= 0 || sourceHeight <= 0) return null;

  const fit = Math.min(box.width / sourceWidth, box.height / sourceHeight);
  const width = sourceWidth * fit;
  const height = sourceHeight * fit;

  return {
    x: box.x + (box.width - width) / 2,
    y: box.y + (box.height - height) / 2,
    width,
    height,
  };
}
