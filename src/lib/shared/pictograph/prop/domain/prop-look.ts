import {
  fanAppearanceArtwork,
  fanPreviewImage,
  isFanPropType,
  normalizeFanAppearance,
  resolveFanRenderKey,
  type FanAppearance,
} from "./fan-appearance";
import {
  PROP_MODEL_SPRITES,
  type PropModelSpriteEntry,
} from "./prop-model-sprites.generated";

/**
 * How the 2D animation canvas draws a prop.
 *
 * - `model`: a flat capture of the same 3D model the viewer's 3D mode renders,
 *   pre-lit in the blue and red motion colors.
 * - `pictograph`: the flat notation artwork, recolored per hand at runtime.
 *
 * Fan keeps its own richer appearance contract (build, frame, cover); this
 * setting covers every other physical prop with one switch.
 */
export const PROP_LOOKS = ["model", "pictograph"] as const;
export type PropLook = (typeof PROP_LOOKS)[number];

/**
 * The notation artwork stays the default: its proportions are canonical and
 * the 3D captures (a much thinner staff, for one) are an opt-in look.
 */
export const DEFAULT_PROP_LOOK: PropLook = "pictograph";

export type PropSpriteSide = "left" | "right";

export function normalizePropLook(value: unknown): PropLook {
  return value === "model" ? "model" : DEFAULT_PROP_LOOK;
}

/** Props with a captured model sprite pair on disk. */
export function hasModelSprite(propType: string | null | undefined): boolean {
  if (!propType) return false;
  return Object.prototype.hasOwnProperty.call(
    PROP_MODEL_SPRITES,
    propType.toLowerCase()
  );
}

export interface PropRenderAppearance {
  fanAppearance?: FanAppearance | null;
  propLook?: PropLook | null;
}

/**
 * Renderer-only identity for the texture cache. Fan builds win for fans; every
 * other prop with a captured sprite gets `<prop>__model` when the model look is
 * active. Keys never enter PropType, choreography, or URLs.
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
  if (
    normalizePropLook(appearance.propLook) === "model" &&
    hasModelSprite(normalized)
  ) {
    return `${normalized}__model`;
  }
  return normalized;
}

export interface ModelRenderKey {
  propType: string;
}

export function parseModelRenderKey(value: string): ModelRenderKey | null {
  const match = /^([a-z0-9_-]+)__model$/.exec(value.toLowerCase());
  if (!match) return null;
  return { propType: match[1]! };
}

/** The notation prop behind any render key (fan build, model, or plain). */
export function basePropTypeOfRenderKey(value: string): string {
  const normalized = value.toLowerCase();
  const separator = normalized.indexOf("__");
  return separator === -1 ? normalized : normalized.slice(0, separator);
}

export const MODEL_SPRITE_ROOT = "/images/props/appearances/model";

export function modelSpriteArtwork(
  propType: string,
  side: PropSpriteSide
): string {
  const color = side === "left" ? "blue" : "red";
  const entry = PROP_MODEL_SPRITES[propType.toLowerCase()];
  const revision = entry ? `?v=${encodeURIComponent(entry.capturedAt)}` : "";
  return `${MODEL_SPRITE_ROOT}/${propType.toLowerCase()}-${color}.svg${revision}`;
}

export interface PropTileArtwork {
  href: string;
  /**
   * The artwork is a chosen look (a fan build or a model capture) rather than
   * the plain notation glyph, so previews show it in color instead of as a
   * white silhouette.
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
  /** Navigation-only correction for model captures facing away from the glyph. */
  rotation?: number;
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
  bighoop: {
    imageWidth: 600,
    imageHeight: 300,
    x: 251.32,
    y: -5.15,
    width: 353.83,
    height: 310.31,
  },
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
 * The image a picker tile or preview should draw for a prop under the user's
 * current look: the fan build's artwork for fans, the pre-lit model capture
 * for props that have one, otherwise the notation artwork in `fallback`.
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
  if (
    normalizePropLook(appearance.propLook) === "model" &&
    hasModelSprite(normalized)
  ) {
    return {
      href: modelSpriteArtwork(normalized, side),
      styled: true,
      prelit: true,
      crop: modelSpriteCrop(PROP_MODEL_SPRITES[normalized]!),
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
  // The capture's subpixel shaft vanishes at navigation size. Its vector
  // silhouette preserves the same fire-staff shape, including both wicks.
  if (art.prelit && propType.toLowerCase() === "fire_double_staff") {
    return { href: fallback, styled: false, prelit: false };
  }
  if (
    art.prelit &&
    [
      "club",
      "bigclub",
      "torch",
      "bigtorch",
      "poi",
      "chicken",
      "bigchicken",
    ].includes(propType.toLowerCase())
  ) {
    return { ...art, rotation: 180 };
  }
  return art.styled
    ? art
    : { ...art, crop: NOTATION_GLYPH_CROPS[propType.toLowerCase()] };
}

/**
 * The painted window of a model capture as a tile crop. Captures are
 * grip-centred and mirrored about the hand, so a club or torch paints only
 * half its box; without measured bounds the whole box is drawn as before.
 */
export function modelSpriteCrop(
  entry: PropModelSpriteEntry
): PropTileCrop | undefined {
  if (!entry.bounds) return undefined;
  return {
    imageWidth: entry.width,
    imageHeight: entry.height,
    ...entry.bounds,
  };
}

export interface PropLookOption {
  id: PropLook;
  label: string;
  image: string;
}

export function propLookOptions(propType: string): readonly PropLookOption[] {
  const normalized = propType.toLowerCase();
  return [
    {
      id: "model",
      label: "3D model",
      image: modelSpriteArtwork(normalized, "left"),
    },
    {
      id: "pictograph",
      label: "Pictograph",
      image: `/images/props/buttons/${normalized}.svg`,
    },
  ];
}
