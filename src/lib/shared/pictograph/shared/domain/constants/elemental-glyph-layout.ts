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
 * glyph, set in the opposite corner and wrapped in a dashed ring: the ring
 * reads as "spin" and tells the two relationships apart at a glance. Shared
 * by the live DOM, the canvas compositor and the MCP renderer.
 */
export const PROP_GLYPH_RING = {
  radius: 76,
  strokeWidth: 5,
  dash: [14, 10] as const,
  opacity: 0.75,
  color: { light: "#000000", dark: "#e6e6e6" },
} as const;

export interface PropGlyphRing {
  cx: number;
  cy: number;
  r: number;
  strokeWidth: number;
  dash: readonly [number, number];
}

/** Ring geometry centred on the top-right glyph slot, scaled to any canvas. */
export function getPropGlyphRing(
  canvasSize: number,
  xOffset = 0
): PropGlyphRing {
  const box = getElementalGlyphBox(canvasSize, xOffset, "top-right");
  const scale = canvasSize / ELEMENTAL_GLYPH_VIEWBOX_SIZE;
  return {
    cx: box.x + box.width / 2,
    cy: box.y + box.height / 2,
    r: PROP_GLYPH_RING.radius * scale,
    strokeWidth: PROP_GLYPH_RING.strokeWidth * scale,
    dash: [PROP_GLYPH_RING.dash[0] * scale, PROP_GLYPH_RING.dash[1] * scale],
  };
}

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
