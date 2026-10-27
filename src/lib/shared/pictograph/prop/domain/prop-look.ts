import { propArtworkStem, type PropSpriteSide } from "@tka/render-core";
import {
  fanAppearanceArtwork,
  fanPreviewImage,
  isFanPropType,
  normalizeFanAppearance,
  resolveFanRenderKey,
  type FanAppearance,
} from "./fan-appearance";
import { HOOP_FAMILY_GLYPH_CROPS } from "./hoop-family-geometry.generated";
import {
  isTrianglePropType,
  normalizeTriangleGrip,
  parseTriangleRenderKey,
  resolveTriangleRenderKey,
  triangleAppearanceArtwork,
  type TriangleGrip,
} from "./triangle-appearance";

export { propArtworkStem, type PropSpriteSide };

export interface PropRenderAppearance {
  fanAppearance?: FanAppearance | null;
  triangleGrip?: TriangleGrip | null;
}

/**
 * Renderer-only identity for the texture cache: a fan's build, or a triangle's
 * grip. Every other prop keeps its plain type. Keys never enter PropType,
 * choreography, or URLs.
 */
export function resolvePropRenderKey(
  propType: string,
  appearance: PropRenderAppearance
): string {
  const normalized = propType.toLowerCase();
  if (isFanPropType(normalized)) {
    return resolveFanRenderKey(
      normalized,
      normalizeFanAppearance(appearance.fanAppearance)
    );
  }
  if (isTrianglePropType(normalized)) {
    return resolveTriangleRenderKey(
      normalized,
      normalizeTriangleGrip(appearance.triangleGrip)
    );
  }
  return normalized;
}

/** The notation prop behind any render key (fan build, triangle grip, or plain). */
export function basePropTypeOfRenderKey(value: string): string {
  const normalized = value.toLowerCase();
  const separator = normalized.indexOf("__");
  const head = separator === -1 ? normalized : normalized.slice(0, separator);
  // Map the triangle's glyph key back to "triangle".
  return parseTriangleRenderKey(head)?.propType ?? head;
}

export interface PropTileArtwork {
  href: string;
  /**
   * The artwork is a chosen fan build rather than the plain notation glyph,
   * so previews show it in color instead of as a white silhouette.
   */
  styled: boolean;
  /** Already lit in its hand's color; never recolor it. */
  prelit: boolean;
  /**
   * A rendered photo of the whole prop rather than a glyph on the pictograph
   * box: draw it once, filling the tile, instead of through the pair recipe.
   * `crop` is the source-pixel window that holds the prop.
   */
  fill?: PropTileCrop;
  /**
   * The window of a whole-box capture that holds the prop. The pair recipe
   * draws this window fitted to the glyph square, so a one-sided prop is not
   * half empty margin. Notation glyphs are already cropped artwork.
   */
  crop?: PropTileCrop;
}

export interface PropTileCrop {
  imageWidth: number;
  imageHeight: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The fan build previews are 640x240 renders with the fan in the middle. */
export const FAN_PREVIEW_CROP: PropTileCrop = {
  imageWidth: 640,
  imageHeight: 240,
  x: 170,
  y: 15,
  width: 300,
  height: 220,
};

// Fan glyphs share a hand-centered 260×207 canvas. Remove its empty left
// half so both grips remain readable in a compact navigation pair.
export const FAN_GLYPH_CROP: PropTileCrop = {
  imageWidth: 260,
  imageHeight: 207,
  x: 90,
  y: -5,
  width: 172,
  height: 217,
};

// Measured painted bounds of the button SVGs, with a small stroke margin.
// Several files retain an invisible second prop or a hand-pivot half-canvas.
// Crop only the navigation artwork; choreography keeps its original coordinates.
const NOTATION_GLYPH_CROPS: Record<string, PropTileCrop> = {
  fan: {
    imageWidth: 260,
    imageHeight: 207,
    x: 126,
    y: -3.1,
    width: 135.59,
    height: 212.65,
  },
  bigfan: {
    imageWidth: 460,
    imageHeight: 580,
    x: 41.49,
    y: -8.51,
    width: 370.42,
    height: 530.32,
  },
  triad: {
    imageWidth: 248.76,
    imageHeight: 219.09,
    x: 52.94,
    y: -3.03,
    width: 198.85,
    height: 225.16,
  },
  bigtriad: {
    imageWidth: 600,
    imageHeight: 523.5,
    x: 136.44,
    y: -7.75,
    width: 471.4,
    height: 538.9,
  },
  minihoop: HOOP_FAMILY_GLYPH_CROPS.minihoop,
  bighoop: HOOP_FAMILY_GLYPH_CROPS.bighoop,
  triangle: HOOP_FAMILY_GLYPH_CROPS.triangle,
  trigeng: {
    imageWidth: 250,
    imageHeight: 236.7,
    x: 24.44,
    y: -3.35,
    width: 228.94,
    height: 232.09,
  },
  triquetra: {
    imageWidth: 290.3,
    imageHeight: 169.6,
    x: 132.76,
    y: -2.54,
    width: 159.99,
    height: 174.69,
  },
  triquetra2: {
    imageWidth: 170,
    imageHeight: 170,
    x: 12.76,
    y: -2.54,
    width: 159.79,
    height: 174.69,
  },
  sword: {
    imageWidth: 572.3,
    imageHeight: 64,
    x: 105.7,
    y: -2.8,
    width: 467.1,
    height: 69.6,
  },
  energy_saber: {
    imageWidth: 620,
    imageHeight: 96,
    x: 125.07,
    y: 19.07,
    width: 475.86,
    height: 57.86,
  },
  energy_staff: {
    imageWidth: 300,
    imageHeight: 90,
    x: 17.75,
    y: 27.15,
    width: 264.5,
    height: 35.7,
  },
  chicken: {
    imageWidth: 325,
    imageHeight: 30.3,
    x: 149.82,
    y: -2.18,
    width: 176.96,
    height: 34.45,
  },
  guitar: {
    imageWidth: 595,
    imageHeight: 170,
    x: 131.78,
    y: -6.82,
    width: 468.44,
    height: 182.01,
  },
  ukulele: {
    imageWidth: 350,
    imageHeight: 71.5,
    x: 153.7,
    y: -2.9,
    width: 199.21,
    height: 77.31,
  },
  contactball: {
    imageWidth: 300,
    imageHeight: 150,
    x: 147.75,
    y: -2.25,
    width: 154.5,
    height: 154.5,
  },
  bigcontactball: {
    imageWidth: 600,
    imageHeight: 300,
    x: 295.5,
    y: -4.5,
    width: 309,
    height: 309,
  },
};

/**
 * The image a picker tile or preview should draw for a prop: the fan build's
 * artwork for fans, the triangle's grip glyph, otherwise the notation artwork
 * in `fallback`.
 */
export function propTileArtwork(
  propType: string,
  side: PropSpriteSide,
  appearance: PropRenderAppearance,
  fallback: string
): PropTileArtwork {
  const normalized = propType.toLowerCase();
  if (isFanPropType(normalized)) {
    // The rendered build preview reads at tile size; the recolorable line
    // artwork the animator uses is too thin to survive a 64px glyph.
    const fan = normalizeFanAppearance(appearance.fanAppearance);
    return fan.build === "pictograph"
      ? { href: fallback, styled: false, prelit: false }
      : {
          href: fanPreviewImage(fan),
          styled: true,
          prelit: true,
          fill: FAN_PREVIEW_CROP,
        };
  }
  if (isTrianglePropType(normalized)) {
    // The triangle's grip changes which glyph is correct. The sprite
    // generator writes byte-identical SVGs into buttons/ and pictograph/, so
    // the side appearance artwork doubles as the side notation tile.
    const grip = normalizeTriangleGrip(appearance.triangleGrip);
    return {
      href: triangleAppearanceArtwork(grip) ?? fallback,
      styled: false,
      prelit: false,
    };
  }
  return { href: fallback, styled: false, prelit: false };
}

/** Navigation needs a recolorable pair, even when the picker uses a fan photo. */
export function propGlyphArtwork(
  propType: string,
  side: PropSpriteSide,
  appearance: PropRenderAppearance,
  fallback: string
): PropTileArtwork {
  if (isFanPropType(propType)) {
    const fan = normalizeFanAppearance(appearance.fanAppearance);
    return {
      href: fanAppearanceArtwork(fan.build, fan.cover) ?? fallback,
      styled: true,
      prelit: false,
      crop:
        fan.build === "pictograph"
          ? NOTATION_GLYPH_CROPS[propType.toLowerCase()]
          : FAN_GLYPH_CROP,
    };
  }
  const art = propTileArtwork(propType, side, appearance, fallback);
  return art.styled
    ? art
    : { ...art, crop: NOTATION_GLYPH_CROPS[propType.toLowerCase()] };
}
