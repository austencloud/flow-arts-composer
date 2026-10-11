/**
 * Petal palette registry.
 *
 * Silhouettes now draw in two rendering layers:
 *
 *   1. SVG-path-based (Path2D + DOMMatrix): UXWing autumn leaves, hand-
 *      authored tropical/ginkgo leaves. Fills with a radial gradient
 *      (bright centre → base tint → darker rim) plus a subtle darker
 *      stroke for definition. Matches the painted botanical look of the
 *      `@austencloud/backgrounds` autumn-drift + cherry-blossom systems.
 *   2. Procedural (canvas path ops): blossom 5-petal flower with glow +
 *      stamen centre, single blossom petal, and generic round/oval/elongated/
 *      stylized fallbacks for the custom palette.
 *
 * Path2D availability is probed once at module load. In test environments
 * (jsdom) that lack Path2D, SVG shapes fall back to their closest
 * procedural approximation. Production always takes the SVG path.
 *
 * Provenance note - the UXWing SVG path data and the cherry blossom
 * drawing kernel mirror constants that live in
 * `@austencloud/backgrounds` but are not re-exported by its public
 * entrypoint. Long-term fix: upstream those exports so this file can
 * `import` them.
 */

import type { PetalsIntent } from "./effects-config";

export type PetalSpriteShape =
  // Generic procedural - used by custom palette + jsdom fallback.
  | "round"
  | "oval"
  | "elongated"
  | "stylized"
  // Blossom (procedural, cherry-blossom-flavoured).
  | "blossom_flower"
  | "blossom_petal"
  | "blossom_petal_folded"
  | "blossom_petal_curled"
  // UXWing autumn leaves (real SVG paths, free commercial).
  | "maple"
  | "curved"
  | "oak"
  | "rounded"
  | "double"
  | "nature"
  // Jungle - hand-authored SVG paths.
  | "monstera"
  | "banana"
  | "fern"
  | "elephant"
  | "palm"
  | "calathea"
  // Ember Ash (procedural charred fragments).
  | "ash_flake"
  | "ash_cinder"
  // Gold hero - hand-authored.
  | "ginkgo";

export interface PetalPalette {
  readonly id: PetalsIntent["palette"];
  readonly sprites: readonly PetalSpriteShape[];
  readonly tints: readonly string[];
  readonly emberEdge?: { chance: number; color: string };
}

/*                            Palette registries                          */

const BLOSSOM: PetalPalette = {
  id: "blossom",
  // One intact flower per fifteen loose petals. Whole blossoms are punctuation;
  // the smaller loose silhouettes carry the stream without masking the props.
  sprites: [
    "blossom_flower",
    "blossom_petal",
    "blossom_petal",
    "blossom_petal",
    "blossom_petal",
    "blossom_petal",
    "blossom_petal",
    "blossom_petal_folded",
    "blossom_petal_folded",
    "blossom_petal_folded",
    "blossom_petal_folded",
    "blossom_petal_folded",
    "blossom_petal_curled",
    "blossom_petal_curled",
    "blossom_petal_curled",
    "blossom_petal_curled",
  ],
  // Cherry blossom colour mix: vibrant magenta/pink/blush + rose/pink/
  // cream/lavender, carried over from the package palette.
  tints: [
    "#ff3d8b",
    "#ff6aa5",
    "#ffb3c8",
    "#e85090",
    "#ffc8d8",
    "#fff2e8",
    "#e8c8e8",
    "#ffa0c0",
  ],
};

const AUTUMN: PetalPalette = {
  id: "autumn",
  sprites: ["maple", "curved", "oak", "rounded", "double", "nature"],
  // Warm autumnal: golds → oranges → reds → browns → a hint of green.
  tints: [
    "#d39a32",
    "#e1b957",
    "#c96d35",
    "#a94832",
    "#7f3430",
    "#6c4527",
    "#596333",
  ],
};

const GOLD: PetalPalette = {
  id: "gold",
  // Ginkgo dominates, with a few rounded/oval leaves to add silhouette
  // variety so the stream doesn't read as one repeating shape.
  sprites: ["ginkgo", "ginkgo", "ginkgo", "ginkgo", "curved", "nature"],
  tints: [
    "#d8b45a",
    "#e7ca78",
    "#b98a39",
    "#94652f",
    "#c69a4b",
    "#ead8a0",
    "#80603a",
  ],
};

const ASH: PetalPalette = {
  id: "ash",
  // Subset of autumn leaves - we tint them charcoal and occasionally light
  // an ember along the rim.
  sprites: [
    "ash_flake",
    "ash_flake",
    "ash_flake",
    "ash_cinder",
    "ash_cinder",
    "curved",
    "oak",
  ],
  tints: ["#393536", "#4b4745", "#625951", "#76655c", "#51423e"],
  emberEdge: { chance: 0.55, color: "#ff491f" },
};

const JUNGLE: PetalPalette = {
  id: "jungle",
  // Broad leaves carry the family, while the lighter palm and fern profiles
  // break up repetition. Repeated entries are deliberate visual weighting.
  sprites: [
    "monstera",
    "monstera",
    "banana",
    "banana",
    "calathea",
    "calathea",
    "elephant",
    "palm",
    "fern",
  ],
  tints: [
    "#2f7d3a",
    "#3f9146",
    "#54a653",
    "#70b85a",
    "#8cc866",
    "#386d3b",
    "#5d8332",
  ],
};

export const PETAL_PALETTES = {
  blossom: BLOSSOM,
  autumn: AUTUMN,
  jungle: JUNGLE,
  ash: ASH,
  gold: GOLD,
} as const;

export function resolvePetalPalette(intent: PetalsIntent): PetalPalette {
  if (intent.palette !== "custom") {
    return PETAL_PALETTES[intent.palette];
  }
  return deriveCustomPalette(intent.customColor);
}

/**
 * Custom palette: tints derived from a single base colour via HSL
 * lightness shifts, sprites borrowed from the blossom petal roster.
 */
export function deriveCustomPalette(hex: string): PetalPalette {
  const base = hexToHsl(hex);
  const lighter = hslToHex({ h: base.h, s: base.s, l: clamp01(base.l + 0.1) });
  const darker = hslToHex({ h: base.h, s: base.s, l: clamp01(base.l - 0.1) });
  return {
    id: "custom",
    sprites: [
      "blossom_petal",
      "blossom_petal",
      "blossom_petal_folded",
      "blossom_petal_curled",
    ],
    tints: [hex, lighter, darker],
  };
}

export function pickPetalSprite(
  palette: PetalPalette,
  rand: () => number = Math.random
): PetalSpriteShape {
  const n = palette.sprites.length;
  return palette.sprites[Math.floor(rand() * n)] ?? "round";
}

export function pickPetalTint(
  palette: PetalPalette,
  rand: () => number = Math.random
): string {
  const n = palette.tints.length;
  return palette.tints[Math.floor(rand() * n)] ?? "#ffffff";
}

export function rollEmberFlag(
  palette: PetalPalette,
  rand: () => number = Math.random
): boolean {
  if (!palette.emberEdge) return false;
  return rand() < palette.emberEdge.chance;
}

/**
 * Shared size art direction for both renderers.
 *
 * Most particles live in the small tier, a quarter are medium, and only a
 * handful become accents. Intact blossoms stay smaller than loose petals so
 * their five-lobed outline never turns into a hand-sized badge near camera.
 */
export function resolvePetalSize(
  baseSize: number,
  intensity: number,
  shape: PetalSpriteShape,
  rand: () => number = Math.random
): number {
  const intensityScale = 0.36 + clamp01(intensity) * 0.42;
  if (shape === "blossom_flower") {
    return baseSize * intensityScale * (0.62 + rand() * 0.1);
  }

  const tier = rand();
  const jitter = rand();
  const populationScale =
    tier < 0.72
      ? 0.54 + jitter * 0.18
      : tier < 0.96
        ? 0.74 + jitter * 0.16
        : 0.92 + jitter * 0.1;
  const silhouetteScale =
    shape === "blossom_petal_curled"
      ? 0.76
      : shape === "blossom_petal_folded"
        ? 0.88
        : 1;
  return baseSize * intensityScale * populationScale * silhouetteScale;
}

/** Motion-born petals may read clearly; ambient petals stay translucent. */
export function resolvePetalOpacity(
  shape: PetalSpriteShape,
  ambient: boolean
): number {
  const silhouetteOpacity =
    shape === "blossom_flower"
      ? 0.68
      : shape === "blossom_petal_curled"
        ? 0.72
        : 0.82;
  return silhouetteOpacity * (ambient ? 0.7 : 1);
}

/*                       SVG path data (production)                       */

interface SvgLeafData {
  d: string;
  viewBox: { width: number; height: number };
  /** Procedural fallback for jsdom / environments without Path2D. */
  fallback:
    | "maple"
    | "oak"
    | "elm"
    | "oval"
    | "elongated"
    | "round"
    | "stylized";
}

// UXWing leaf silhouettes (free commercial use, no attribution required).
// Mirrors AUTUMN_LEAF_PATHS in @austencloud/backgrounds/autumn-drift.
const UXWING_LEAVES: Record<
  "maple" | "curved" | "oak" | "rounded" | "double" | "nature",
  SvgLeafData
> = {
  maple: {
    d: "M55.15,85.62c1.73,11.9-0.93,21.51-8.05,31.37c-1.6,2.21-3.29,3.99-5.25,5.89c-0.01-2.63-1.69-3.76-4.22-4.34C48.04,108.25,52.33,96.9,53.7,85.62h-2.36c-7.79-0.77-16.33,12.35-26.35,15.92c4.77-9.16-0.56-10.4-12.66-6.33c9.05-10.8,9.93-14.79,0-13.35c5.13-3.88,9.9-6.11,14.38-7.02c-9.33-2.97-17.63-7.97-24.64-15.57c13.16-0.48,9.93-9.37-2.05-22.76c15.93,8.01,24.33,9.02,21.73-0.17c4.71,3.18,10.75,9.27,17.11,16.09c-2.45-12.5-4.29-24.34-3.42-33.2C41.63,28.56,48.3,19.12,54.84,0c5.51,17.44,11.43,27.12,18.92,20.08c0.97,7.76-0.07,16.06-2.74,24.81l-0.17,6.67c6.21-6.7,12.31-13.03,17.22-15.44c-3.05,10.09,7.63,6.57,21.28,0.38c-12.92,14.44-13.94,22.06-2.57,22.59c-4.73,7.36-13.07,11.84-22.76,15.23c4.22,1.21,8.44,3.49,12.66,7.02c-8.73-0.72-6.9,5,0.25,14.2c-10.92-3.2-16.49-2.33-13.04,6C70.98,90.74,61.77,85.51,56.13,85.62H55.15L55.15,85.62z",
    viewBox: { width: 109.35, height: 122.88 },
    fallback: "maple",
  },
  curved: {
    d: "M104.38,97.86c5.03,6.72,9.37,12.3,11.72,18.72c2.29,6.26,3.22,9.11-1.98,2.63c-4.84-6.04-9.36-11.91-15.98-17.48c-0.47,0.11-0.96,0.21-1.49,0.32C36.81,113.93-6.78,87.01,0.87,0c46.1,15.96,111.38,9.48,104.62,91.25C105.25,94.29,105.02,96.37,104.38,97.86L104.38,97.86zM88.32,84.78c-15.04-32.4-53.68-43.51-72.85-65.67C36.28,59.7,47.63,57.91,88.32,84.78L88.32,84.78L88.32,84.78z",
    viewBox: { width: 117.93, height: 122.88 },
    fallback: "oval",
  },
  oak: {
    d: "M0.36,15.78c0.3,6.98,0.84,14.42,1.74,21.99l21.5,1.25L0.36,15.78L0.36,15.78zM120.96,113.47l-11.6-10.88c12.55-18.33,15.86-36.43,11.45-54.03c-3.26-9.99-9.58-17.97-17.83-24.33l-1.06,70.41l-5.18-5.09L69.34,8.35c-7.1-4.6-15.3-8.22-24.05-11.05l4.26,61.34l-5.18-5.09L37.16,2.16C23.82,0.6,10.93,0.14,0.18,0.17L0,0v8.84c38.3,38.3,75.14,75.14,112.8,112.8C119.93,126.02,124.49,117.75,120.96,113.47L120.96,113.47zM2.71,42.57c1.27,9.21,3.1,18.52,5.67,27.39l49.54,3.38L28.75,44.17L2.71,42.57L2.71,42.57zM9.87,74.82c2.87,8.74,6.53,16.92,11.18,23.99l61-1.34L63.09,78.51L9.87,74.82L9.87,74.82zM24.45,103.54c6.3,8.04,14.18,14.18,23.99,17.39c16.01,4.01,32.29,1.72,48.9-8.17L87.18,102.6L24.45,103.54L24.45,103.54z",
    viewBox: { width: 124.49, height: 126.02 },
    fallback: "oak",
  },
  rounded: {
    d: "M13.54,97.85c-5.05,6.71-9.37,12.31-11.71,18.72c-2.29,6.25-3.22,9.12,1.97,2.62c4.84-6.04,9.37-11.92,15.97-17.47c0.46,0.12,0.97,0.21,1.48,0.32C81.12,113.94,124.7,87.02,117.04,0C70.96,15.97,5.68,9.47,12.43,91.26C12.69,94.29,12.92,96.37,13.54,97.85L13.54,97.85L13.54,97.85zM27.72,86.1c15.65-33.71,55.85-45.26,75.79-68.3C81.91,59.92,64.23,61.99,27.72,86.1L27.72,86.1z",
    viewBox: { width: 124.7, height: 122.88 },
    fallback: "oval",
  },
  double: {
    d: "M59.07,110.77C110.92,105,139.6,71.12,112.44,0c-21.29,14.9-50.39,24.6-65,44.55C57,52.94,64.89,62.23,67.08,74.37c13.19-16.08,27.63-30.72,35.23-47-7.79,39.07-20,53.84-38.78,73.81a93.64,93.64,0,0,1-4.46,9.62Zm-14.9,4C4,105-15.18,76.09,14.27,24.75c23.8,22.92,65.79,37.48,38.39,85.86a27.08,27.08,0,0,1-1.83,2.93C45.9,89.62,26.21,70.69,20.43,50.61,21.77,83.42,31.23,93,45.88,114.86c-.57,0-1.14-.06-1.71-.13Z",
    viewBox: { width: 139.6, height: 114.86 },
    fallback: "oval",
  },
  nature: {
    d: "M73.65,8.87C88,4.52,103.43,2,118.16.08A3.92,3.92,0,0,1,122.27,6c-6.55,10.32-11.88,21.38-17.19,32.38C86.82,76.25,68.82,113.54,5,122a2.73,2.73,0,0,1-.51.07,3.9,3.9,0,0,1-4.18-3.63A119,119,0,0,1,7.53,68.18c5.68-15,14.58-28.66,26.7-39.08,11-9.42,24.68-15.77,39.42-20.23Z",
    viewBox: { width: 122.27, height: 122.07 },
    fallback: "elongated",
  },
};

// Hand-authored tropical leaf silhouettes (single closed paths, viewBox
// 0-100). Their asymmetric contours and varied negative-space rhythms keep
// the atlas from reading as a repeated pack of generic leaf icons.
const JUNGLE_LEAVES: Record<
  "monstera" | "banana" | "fern" | "elephant" | "palm" | "calathea",
  SvgLeafData
> = {
  // Mature monstera with offset split lobes and a narrow basal stem.
  monstera: {
    d: "M48 97 C47 84 45 71 43 59 C36 73 27 83 18 85 C19 76 24 67 31 60 C22 67 14 69 8 64 C15 56 23 51 34 48 C23 49 15 46 11 40 C20 34 30 34 39 38 C32 31 27 24 29 17 C39 20 47 29 50 38 C54 27 62 16 73 11 C76 20 72 29 63 37 C74 32 83 32 91 37 C87 45 78 49 67 49 C78 50 87 55 92 62 C85 68 77 68 67 62 C76 70 81 78 80 86 C69 84 60 75 54 61 C53 74 53 86 55 97 Z",
    viewBox: { width: 100, height: 100 },
    fallback: "oak",
  },
  // Wind-worn banana leaf: long, bowed and irregularly torn at the edge.
  banana: {
    d: "M47 97 C43 82 38 67 34 51 C30 36 32 18 47 4 C55 11 62 20 66 31 L58 34 L68 39 L59 43 L66 49 L57 52 L63 58 L55 61 L60 68 L53 71 L57 78 C56 86 53 92 51 97 Z",
    viewBox: { width: 100, height: 100 },
    fallback: "elongated",
  },
  // Loose fern frond with alternating pinnae and a naturally bent tip.
  fern: {
    d: "M56 4 C57 9 57 13 57 17 L64 13 L59 22 L70 19 L60 28 L73 27 L61 34 L76 36 L61 40 L76 46 L60 46 L73 57 L58 52 L69 66 L56 58 L63 75 L54 64 L56 84 L51 69 L50 97 L46 69 L38 83 L44 63 L31 74 L42 56 L27 64 L40 50 L24 53 L40 44 L24 42 L41 37 L27 32 L43 31 L32 23 L46 25 L39 16 L49 20 C51 13 53 8 56 4 Z",
    viewBox: { width: 100, height: 100 },
    fallback: "elm",
  },
  // Alocasia shield with a clean heart notch and unequal basal lobes.
  elephant: {
    d: "M50 97 C44 87 34 80 25 71 C14 60 12 45 18 31 C23 19 33 12 44 10 C47 10 49 16 50 21 C53 15 57 10 62 11 C75 14 84 24 88 38 C92 53 87 68 76 79 C69 86 59 91 50 97 Z",
    viewBox: { width: 100, height: 100 },
    fallback: "oval",
  },
  // Palmate forest-understory leaf. Unequal fingers give it a wind-swept fan.
  palm: {
    d: "M49 97 C47 82 45 70 43 60 L29 82 C25 78 27 66 34 53 L16 68 C12 62 20 51 33 43 L10 47 C10 39 22 33 37 33 L21 20 C27 15 39 23 46 34 L45 8 C52 7 56 22 53 36 L67 15 C73 20 68 33 59 43 L82 30 C86 37 75 46 62 51 L89 49 C89 57 75 62 59 59 C56 73 54 85 54 97 Z",
    viewBox: { width: 100, height: 100 },
    fallback: "stylized",
  },
  // Calathea-like lance with a relaxed wave rather than a perfect oval.
  calathea: {
    d: "M51 4 C62 13 68 25 66 38 C65 48 70 57 64 70 C60 82 55 91 49 97 C41 88 36 78 37 66 C38 55 32 47 36 34 C39 20 44 10 51 4 Z",
    viewBox: { width: 100, height: 100 },
    fallback: "elongated",
  },
};

// Gold hero - ginkgo biloba bilobed fan.
const GINKGO: SvgLeafData = {
  d: "M50 95 L46 70 C42 66 36 62 30 56 C22 48 16 38 14 28 C13 22 16 16 22 14 C26 13 30 14 32 18 C34 14 38 10 44 9 C48 8 51 10 52 14 L52 14 C53 10 56 8 60 9 C66 10 70 14 72 18 C74 14 78 13 82 14 C88 16 91 22 90 28 C88 38 82 48 74 56 C68 62 62 66 58 70 L54 95 Z",
  viewBox: { width: 100, height: 100 },
  fallback: "stylized",
};

/*                   Path2D cache + rendering (production)                */

const hasPath2D =
  typeof Path2D !== "undefined" && typeof DOMMatrix !== "undefined";

const pathCache = new Map<string, Path2D>();

function getOrBuildPath(
  key: string,
  data: SvgLeafData,
  size: number
): Path2D | null {
  if (!hasPath2D) return null;
  const cacheKey = `${key}-${Math.round(size)}`;
  const hit = pathCache.get(cacheKey);
  if (hit) return hit;
  try {
    const maxDim = Math.max(data.viewBox.width, data.viewBox.height);
    // Scale so the leaf fits in a (2 * size) box; size = half-width.
    const scale = (size * 2) / maxDim;
    const offsetX = -data.viewBox.width / 2;
    const offsetY = -data.viewBox.height / 2;
    const matrix = new DOMMatrix()
      .scaleSelf(scale, scale)
      .translateSelf(offsetX, offsetY);
    const original = new Path2D(data.d);
    const scaled = new Path2D();
    scaled.addPath(original, matrix);
    pathCache.set(cacheKey, scaled);
    return scaled;
  } catch {
    // Path2D is available but the path failed to parse - extremely rare,
    // but don't crash. Fall back to procedural.
    return null;
  }
}

/**
 * Fill + stroke a leaf with a painted radial gradient (bright centre →
 * base tint → darker rim) and a subtle darker outline for definition.
 * Mirrors the LeafSystem.draw kernel in @austencloud/backgrounds.
 */
function paintLeaf(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  path: Path2D,
  size: number,
  tint: string
): void {
  // Directional light reads as a thin organic surface. The former radial
  // highlight made every leaf look like a glossy UI icon.
  const gradient = ctx.createLinearGradient(
    -size * 0.42,
    -size,
    size * 0.32,
    size
  );
  gradient.addColorStop(0, adjustBrightness(tint, 1.16));
  gradient.addColorStop(0.34, tint);
  gradient.addColorStop(0.78, adjustBrightness(tint, 0.78));
  gradient.addColorStop(1, adjustBrightness(tint, 0.58));
  ctx.fillStyle = gradient;
  ctx.fill(path);
  const previousAlpha = ctx.globalAlpha;
  ctx.globalAlpha = previousAlpha * 0.58;
  ctx.strokeStyle = adjustBrightness(tint, 0.42);
  ctx.lineWidth = Math.max(0.45, size * 0.035);
  ctx.stroke(path);
  ctx.globalAlpha = previousAlpha;
}

/* ---------------------------------------------------------------------- */
/*                        Public draw entry points                        */
/* ---------------------------------------------------------------------- */

/**
 * Draw a petal silhouette at the origin with a given size (half-width in
 * px). Caller handles translation, rotation, and alpha.
 */
export function drawPetalSilhouette(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  shape: PetalSpriteShape,
  size: number,
  tint: string
): void {
  switch (shape) {
    case "blossom_flower":
      drawBlossomFlower(ctx, size, tint);
      return;
    case "blossom_petal":
    case "blossom_petal_folded":
    case "blossom_petal_curled":
      drawBlossomPetal(ctx, shape, size, tint);
      return;
    case "maple":
    case "curved":
    case "oak":
    case "rounded":
    case "double":
    case "nature":
      drawUxwingLeaf(ctx, shape, size, tint);
      return;
    case "monstera":
    case "banana":
    case "fern":
    case "elephant":
    case "palm":
    case "calathea":
      drawJungleLeaf(ctx, shape, size, tint);
      return;
    case "ash_flake":
    case "ash_cinder":
      drawAshFragment(ctx, shape, size, tint);
      return;
    case "ginkgo":
      drawGinkgo(ctx, size, tint);
      return;
    case "round":
      drawProceduralShape(ctx, "round", size, tint);
      return;
    case "oval":
      drawProceduralShape(ctx, "oval", size, tint);
      return;
    case "elongated":
      drawProceduralShape(ctx, "elongated", size, tint);
      return;
    case "stylized":
      drawProceduralShape(ctx, "stylized", size, tint);
      return;
  }
}

/**
 * Ember rim - additive orange glow along the silhouette outline. Gated on
 * the same shape dispatch so the stroke and the fill trace the same path.
 */
export function drawPetalEmberRim(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  shape: PetalSpriteShape,
  size: number,
  color: string,
  alpha: number
): void {
  const prevAlpha = ctx.globalAlpha;
  const prevComposite = ctx.globalCompositeOperation;
  const prevShadowBlur = ctx.shadowBlur;
  const prevShadowColor = ctx.shadowColor;
  try {
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(0.9, size * 0.18);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.shadowColor = color;
    ctx.shadowBlur = Math.max(2, size * 0.42);

    const svgData = getSvgDataForShape(shape);
    if (svgData) {
      const path = getOrBuildPath(`ember-${shape}`, svgData, size);
      if (path) {
        ctx.stroke(path);
        return;
      }
      // Path2D unavailable - fall through to procedural stroke.
      strokeProceduralShape(ctx, svgData.fallback, size);
      return;
    }

    // Pure-procedural shape: stroke it directly.
    if (
      shape === "round" ||
      shape === "oval" ||
      shape === "elongated" ||
      shape === "stylized"
    ) {
      strokeProceduralShape(ctx, shape, size);
      return;
    }

    if (shape === "ash_flake" || shape === "ash_cinder") {
      strokeAshFragment(ctx, shape, size);
      return;
    }

    if (
      shape === "blossom_flower" ||
      shape === "blossom_petal" ||
      shape === "blossom_petal_folded" ||
      shape === "blossom_petal_curled"
    ) {
      // Ember on a blossom petal: trace a simple oval - the flower's
      // multi-path geometry doesn't need a per-petal outline.
      strokeProceduralShape(ctx, "oval", size);
      return;
    }
  } finally {
    ctx.globalAlpha = prevAlpha;
    ctx.globalCompositeOperation = prevComposite;
    ctx.shadowBlur = prevShadowBlur;
    ctx.shadowColor = prevShadowColor;
  }
}

function getSvgDataForShape(shape: PetalSpriteShape): SvgLeafData | null {
  switch (shape) {
    case "maple":
    case "curved":
    case "oak":
    case "rounded":
    case "double":
    case "nature":
      return UXWING_LEAVES[shape];
    case "monstera":
    case "banana":
    case "fern":
    case "elephant":
    case "palm":
    case "calathea":
      return JUNGLE_LEAVES[shape];
    case "ginkgo":
      return GINKGO;
    default:
      return null;
  }
}

/* ---------------------------------------------------------------------- */
/*                        Shape-specific implementations                  */
/* ---------------------------------------------------------------------- */

function drawUxwingLeaf(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  shape: "maple" | "curved" | "oak" | "rounded" | "double" | "nature",
  size: number,
  tint: string
): void {
  const data = UXWING_LEAVES[shape];
  const path = getOrBuildPath(shape, data, size);
  if (path) {
    paintLeaf(ctx, path, size, tint);
    return;
  }
  drawProceduralShape(ctx, data.fallback, size, tint);
}

function drawJungleLeaf(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  shape: "monstera" | "banana" | "fern" | "elephant" | "palm" | "calathea",
  size: number,
  tint: string
): void {
  const data = JUNGLE_LEAVES[shape];
  const path = getOrBuildPath(shape, data, size);
  if (path) {
    paintLeaf(ctx, path, size, tint);
    paintJungleVeins(ctx, path, shape, size, tint);
    return;
  }
  drawProceduralShape(ctx, data.fallback, size, tint);
}

function paintJungleVeins(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  path: Path2D,
  shape: "monstera" | "banana" | "fern" | "elephant" | "palm" | "calathea",
  size: number,
  tint: string
): void {
  if (size < 3.5) return;
  const previousAlpha = ctx.globalAlpha;
  ctx.save();
  ctx.clip(path);
  ctx.globalAlpha = previousAlpha * 0.34;
  ctx.strokeStyle = adjustBrightness(tint, 1.65);
  ctx.lineWidth = Math.max(0.42, size * 0.045);
  ctx.lineCap = "round";

  ctx.beginPath();
  ctx.moveTo(0, size * 0.88);
  ctx.quadraticCurveTo(
    shape === "fern" ? size * 0.12 : -size * 0.04,
    0,
    shape === "fern" ? size * 0.12 : 0,
    -size * 0.8
  );
  ctx.stroke();

  ctx.globalAlpha = previousAlpha * 0.2;
  ctx.lineWidth = Math.max(0.32, size * 0.025);
  ctx.beginPath();
  if (shape === "palm") {
    const rays = [-0.72, -0.42, 0, 0.38, 0.7] as const;
    for (const x of rays) {
      ctx.moveTo(0, size * 0.18);
      ctx.quadraticCurveTo(
        x * size * 0.55,
        -size * 0.08,
        x * size,
        -size * 0.58
      );
    }
  } else {
    const levels = [-0.48, -0.18, 0.14, 0.44] as const;
    const width = shape === "banana" || shape === "calathea" ? 0.52 : 0.72;
    for (const y of levels) {
      const reach = (1 - Math.abs(y) * 0.42) * width * size;
      ctx.moveTo(0, y * size);
      ctx.quadraticCurveTo(
        reach * 0.5,
        (y - 0.08) * size,
        reach,
        (y - 0.2) * size
      );
      ctx.moveTo(0, y * size);
      ctx.quadraticCurveTo(
        -reach * 0.5,
        (y - 0.04) * size,
        -reach,
        (y - 0.16) * size
      );
    }
  }
  ctx.stroke();
  ctx.restore();
}

function drawGinkgo(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  size: number,
  tint: string
): void {
  const path = getOrBuildPath("ginkgo", GINKGO, size);
  if (path) {
    paintLeaf(ctx, path, size, tint);
    paintGinkgoVeins(ctx, path, size, tint);
    return;
  }
  drawProceduralShape(ctx, GINKGO.fallback, size, tint);
}

function paintGinkgoVeins(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  path: Path2D,
  size: number,
  tint: string
): void {
  if (size < 3.5) return;
  const previousAlpha = ctx.globalAlpha;
  ctx.save();
  ctx.clip(path);
  ctx.globalAlpha = previousAlpha * 0.24;
  ctx.strokeStyle = adjustBrightness(tint, 1.55);
  ctx.lineWidth = Math.max(0.34, size * 0.028);
  ctx.lineCap = "round";
  ctx.beginPath();
  for (const x of [-0.72, -0.38, 0, 0.38, 0.72]) {
    ctx.moveTo(0, size * 0.8);
    ctx.quadraticCurveTo(x * size * 0.3, size * 0.05, x * size, -size * 0.55);
  }
  ctx.stroke();
  ctx.restore();
}

function drawAshFragment(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  shape: "ash_flake" | "ash_cinder",
  size: number,
  tint: string
): void {
  const gradient = ctx.createLinearGradient(-size, -size, size, size);
  gradient.addColorStop(0, adjustBrightness(tint, 1.35));
  gradient.addColorStop(0.45, tint);
  gradient.addColorStop(1, adjustBrightness(tint, 0.55));
  ctx.fillStyle = gradient;
  ctx.beginPath();
  buildAshFragmentPath(ctx, shape, size);
  ctx.fill();

  const previousAlpha = ctx.globalAlpha;
  ctx.globalAlpha = previousAlpha * 0.28;
  ctx.strokeStyle = adjustBrightness(tint, 1.7);
  ctx.lineWidth = Math.max(0.35, size * 0.035);
  ctx.beginPath();
  ctx.moveTo(-size * 0.28, size * 0.55);
  ctx.lineTo(size * 0.04, size * 0.08);
  ctx.lineTo(-size * 0.06, -size * 0.48);
  ctx.stroke();
  ctx.globalAlpha = previousAlpha;
}

function strokeAshFragment(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  shape: "ash_flake" | "ash_cinder",
  size: number
): void {
  ctx.beginPath();
  buildAshFragmentPath(ctx, shape, size);
  ctx.stroke();
}

function buildAshFragmentPath(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  shape: "ash_flake" | "ash_cinder",
  size: number
): void {
  if (shape === "ash_flake") {
    ctx.moveTo(-size * 0.16, -size * 0.94);
    ctx.lineTo(size * 0.48, -size * 0.58);
    ctx.lineTo(size * 0.36, -size * 0.14);
    ctx.lineTo(size * 0.72, size * 0.28);
    ctx.lineTo(size * 0.08, size * 0.92);
    ctx.lineTo(-size * 0.5, size * 0.58);
    ctx.lineTo(-size * 0.38, size * 0.08);
    ctx.lineTo(-size * 0.66, -size * 0.34);
  } else {
    ctx.moveTo(-size * 0.1, -size);
    ctx.bezierCurveTo(
      size * 0.42,
      -size * 0.68,
      size * 0.5,
      -size * 0.16,
      size * 0.24,
      size * 0.12
    );
    ctx.lineTo(size * 0.46, size * 0.58);
    ctx.bezierCurveTo(
      size * 0.08,
      size,
      -size * 0.42,
      size * 0.72,
      -size * 0.32,
      size * 0.24
    );
    ctx.lineTo(-size * 0.52, -size * 0.28);
  }
  ctx.closePath();
}

/**
 * Blossom 5-petal flower - procedural, port of BlossomPetalSystem
 * drawPetal branch (isFlower === true). Paints a glow ring, 5 radial
 * petals with gradients, then a yellow stamen centre.
 */
function drawBlossomFlower(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  size: number,
  tint: string
): void {
  const { r, g, b } = hexToRgbTuple(tint);

  // A tight, low-alpha bloom keeps the rare flower luminous without turning
  // each sprite into a circular fog patch.
  const glowRadius = size * 1.04;
  const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, glowRadius);
  glow.addColorStop(0, `rgba(${r},${g},${b},0.28)`);
  glow.addColorStop(0.45, `rgba(${r},${g},${b},0.1)`);
  glow.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = glow;
  ctx.fillRect(-glowRadius, -glowRadius, glowRadius * 2, glowRadius * 2);

  // 5 petals fanned out from centre, each with its own radial gradient.
  const petalCount = 5;
  const lengths = [0.91, 0.98, 0.88, 0.95, 0.9] as const;
  const widths = [0.42, 0.47, 0.4, 0.45, 0.43] as const;
  const offsets = [-0.035, 0.018, -0.012, 0.03, -0.02] as const;
  for (let i = 0; i < petalCount; i++) {
    const angle = (i * Math.PI * 2) / petalCount + offsets[i]!;
    const length = lengths[i]!;
    const widthFactor = widths[i]!;
    ctx.save();
    ctx.rotate(angle);
    const petalGrad = ctx.createRadialGradient(
      0,
      size * widthFactor,
      0,
      0,
      size * widthFactor,
      size * 0.7
    );
    petalGrad.addColorStop(0, `rgba(${r},${g},${b},1)`);
    petalGrad.addColorStop(0.6, `rgba(${r},${g},${b},0.75)`);
    petalGrad.addColorStop(1, `rgba(${r},${g},${b},0.15)`);
    ctx.fillStyle = petalGrad;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(
      size * widthFactor,
      size * 0.1,
      size * widthFactor,
      size * 0.45
    );
    ctx.quadraticCurveTo(size * widthFactor, size * 0.8, 0, size * length);
    ctx.quadraticCurveTo(
      -size * widthFactor,
      size * 0.8,
      -size * widthFactor,
      size * 0.45
    );
    ctx.quadraticCurveTo(-size * widthFactor, size * 0.1, 0, 0);
    ctx.fill();
    ctx.restore();
  }

  // Yellow stamen centre.
  const centreRadius = size * 0.16;
  const centreGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, centreRadius);
  centreGrad.addColorStop(0, "rgba(255, 230, 70, 1)");
  centreGrad.addColorStop(1, "rgba(245, 180, 40, 0.6)");
  ctx.fillStyle = centreGrad;
  ctx.beginPath();
  ctx.arc(0, 0, centreRadius, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * Three loose blossom silhouettes: an open heart-notched petal, a folded
 * side-facing petal, and a curled crescent. They share a painted fill and a
 * faint vein, but their outlines stay distinct after the 3D atlas turns them.
 */
function drawBlossomPetal(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  shape: "blossom_petal" | "blossom_petal_folded" | "blossom_petal_curled",
  size: number,
  tint: string
): void {
  const { r, g, b } = hexToRgbTuple(tint);
  const grad = ctx.createLinearGradient(-size * 0.45, -size, size * 0.35, size);
  grad.addColorStop(0, "rgba(255,255,255,0.9)");
  grad.addColorStop(0.32, `rgba(${r},${g},${b},0.96)`);
  grad.addColorStop(0.78, `rgba(${r},${g},${b},0.72)`);
  grad.addColorStop(
    1,
    `rgba(${Math.round(r * 0.72)},${Math.round(g * 0.72)},${Math.round(b * 0.72)},0.62)`
  );
  ctx.fillStyle = grad;
  ctx.beginPath();
  if (shape === "blossom_petal") {
    ctx.moveTo(0, size * 0.92);
    ctx.bezierCurveTo(
      -size * 0.2,
      size * 0.66,
      -size * 0.58,
      size * 0.22,
      -size * 0.5,
      -size * 0.28
    );
    ctx.bezierCurveTo(
      -size * 0.43,
      -size * 0.78,
      -size * 0.15,
      -size * 1.02,
      0,
      -size * 0.78
    );
    ctx.bezierCurveTo(
      size * 0.2,
      -size * 1.02,
      size * 0.5,
      -size * 0.72,
      size * 0.48,
      -size * 0.24
    );
    ctx.bezierCurveTo(
      size * 0.5,
      size * 0.2,
      size * 0.2,
      size * 0.66,
      0,
      size * 0.92
    );
  } else if (shape === "blossom_petal_folded") {
    ctx.moveTo(-size * 0.08, size * 0.95);
    ctx.bezierCurveTo(
      -size * 0.28,
      size * 0.42,
      -size * 0.3,
      -size * 0.4,
      -size * 0.05,
      -size * 0.94
    );
    ctx.bezierCurveTo(
      size * 0.1,
      -size * 0.68,
      size * 0.34,
      -size * 0.3,
      size * 0.28,
      size * 0.18
    );
    ctx.bezierCurveTo(
      size * 0.22,
      size * 0.58,
      size * 0.06,
      size * 0.84,
      -size * 0.08,
      size * 0.95
    );
  } else {
    ctx.moveTo(-size * 0.16, size * 0.88);
    ctx.bezierCurveTo(
      -size * 0.56,
      size * 0.48,
      -size * 0.5,
      -size * 0.36,
      -size * 0.06,
      -size * 0.94
    );
    ctx.bezierCurveTo(
      size * 0.02,
      -size * 0.5,
      size * 0.42,
      -size * 0.46,
      size * 0.56,
      -size * 0.08
    );
    ctx.bezierCurveTo(
      size * 0.22,
      -size * 0.18,
      size * 0.02,
      size * 0.24,
      size * 0.22,
      size * 0.62
    );
    ctx.bezierCurveTo(
      size * 0.04,
      size * 0.72,
      -size * 0.06,
      size * 0.82,
      -size * 0.16,
      size * 0.88
    );
  }
  ctx.closePath();
  ctx.fill();

  // The fold survives at small sizes as one quiet directional highlight.
  ctx.strokeStyle = `rgba(255,255,255,${shape === "blossom_petal_curled" ? 0.24 : 0.32})`;
  ctx.lineWidth = Math.max(0.45, size * 0.055);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-size * 0.08, size * 0.72);
  ctx.quadraticCurveTo(
    size * 0.08,
    size * 0.1,
    shape === "blossom_petal_curled" ? size * 0.34 : 0,
    -size * 0.66
  );
  ctx.stroke();
}

/* ---------------------------------------------------------------------- */
/*                  Procedural fallbacks + generic shapes                 */
/* ---------------------------------------------------------------------- */

type ProceduralShape =
  | "round"
  | "oval"
  | "elongated"
  | "stylized"
  | "maple"
  | "oak"
  | "elm";

function drawProceduralShape(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  shape: ProceduralShape,
  size: number,
  tint: string
): void {
  ctx.fillStyle = tint;
  ctx.beginPath();
  buildProceduralPath(ctx, shape, size);
  ctx.fill();
}

function strokeProceduralShape(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  shape: ProceduralShape,
  size: number
): void {
  ctx.beginPath();
  buildProceduralPath(ctx, shape, size);
  ctx.stroke();
}

function buildProceduralPath(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  shape: ProceduralShape,
  s: number
): void {
  switch (shape) {
    case "round": {
      ctx.moveTo(0, -s * 0.95);
      ctx.bezierCurveTo(
        s * 0.9,
        -s * 0.9,
        s * 0.95,
        s * 0.2,
        s * 0.3,
        s * 0.95
      );
      ctx.bezierCurveTo(
        s * 0.1,
        s * 0.6,
        -s * 0.1,
        s * 0.6,
        -s * 0.3,
        s * 0.95
      );
      ctx.bezierCurveTo(-s * 0.95, s * 0.2, -s * 0.9, -s * 0.9, 0, -s * 0.95);
      ctx.closePath();
      return;
    }
    case "oval": {
      const w = s * 0.65;
      ctx.moveTo(0, -s);
      ctx.bezierCurveTo(w, -s * 0.7, w, s * 0.7, 0, s);
      ctx.bezierCurveTo(-w, s * 0.7, -w, -s * 0.7, 0, -s);
      ctx.closePath();
      return;
    }
    case "elongated": {
      const w = s * 0.3;
      ctx.moveTo(0, -s);
      ctx.bezierCurveTo(w, -s * 0.5, w, s * 0.5, 0, s);
      ctx.bezierCurveTo(-w, s * 0.5, -w, -s * 0.5, 0, -s);
      ctx.closePath();
      return;
    }
    case "stylized": {
      ctx.moveTo(0, -s);
      ctx.bezierCurveTo(s * 0.9, -s * 0.4, s * 0.9, s * 0.4, 0, s);
      ctx.bezierCurveTo(-s * 0.9, s * 0.4, -s * 0.9, -s * 0.4, 0, -s);
      ctx.closePath();
      return;
    }
    case "maple": {
      const lobes = 5;
      const pts: Array<[number, number]> = [];
      for (let i = 0; i < lobes; i++) {
        const tip = (i / lobes) * Math.PI * 2 - Math.PI / 2;
        const valley = ((i + 0.5) / lobes) * Math.PI * 2 - Math.PI / 2;
        pts.push([Math.cos(tip) * s, Math.sin(tip) * s]);
        pts.push([Math.cos(valley) * s * 0.45, Math.sin(valley) * s * 0.45]);
      }
      const first = pts[0];
      if (!first) return;
      ctx.moveTo(first[0], first[1]);
      for (let i = 1; i < pts.length; i++) {
        const p = pts[i]!;
        ctx.lineTo(p[0], p[1]);
      }
      ctx.closePath();
      return;
    }
    case "oak": {
      const w = s * 0.55;
      ctx.moveTo(0, -s);
      ctx.quadraticCurveTo(w * 1.2, -s * 0.7, w * 0.8, -s * 0.4);
      ctx.quadraticCurveTo(w * 1.1, -s * 0.2, w * 0.9, 0);
      ctx.quadraticCurveTo(w * 1.15, s * 0.2, w * 0.8, s * 0.5);
      ctx.quadraticCurveTo(w * 0.9, s * 0.75, 0, s);
      ctx.quadraticCurveTo(-w * 0.9, s * 0.75, -w * 0.8, s * 0.5);
      ctx.quadraticCurveTo(-w * 1.15, s * 0.2, -w * 0.9, 0);
      ctx.quadraticCurveTo(-w * 1.1, -s * 0.2, -w * 0.8, -s * 0.4);
      ctx.quadraticCurveTo(-w * 1.2, -s * 0.7, 0, -s);
      ctx.closePath();
      return;
    }
    case "elm": {
      const w = s * 0.4;
      const serrations = 6;
      ctx.moveTo(0, -s);
      for (let i = 1; i <= serrations; i++) {
        const t = i / serrations;
        const y = -s + 2 * s * t;
        const bulge = w * Math.sin(t * Math.PI) * (i % 2 === 0 ? 1.1 : 0.85);
        ctx.lineTo(bulge, y);
      }
      for (let i = serrations - 1; i >= 0; i--) {
        const t = i / serrations;
        const y = -s + 2 * s * t;
        const bulge = -w * Math.sin(t * Math.PI) * (i % 2 === 0 ? 1.1 : 0.85);
        ctx.lineTo(bulge, y);
      }
      ctx.closePath();
      return;
    }
  }
}

/* ---------------------------------------------------------------------- */
/*                             Colour helpers                             */
/* ---------------------------------------------------------------------- */

interface Hsl {
  h: number;
  s: number;
  l: number;
}

interface Rgb {
  r: number;
  g: number;
  b: number;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function normalizeHex(hex: string): string {
  const s = hex.trim().replace(/^#/, "");
  if (s.length === 3) {
    return s
      .split("")
      .map((c) => c + c)
      .join("");
  }
  return s.length >= 6 ? s.slice(0, 6) : "ffb0c8";
}

function hexToRgb(hex: string): Rgb {
  const s = normalizeHex(hex);
  return {
    r: parseInt(s.slice(0, 2), 16),
    g: parseInt(s.slice(2, 4), 16),
    b: parseInt(s.slice(4, 6), 16),
  };
}

/** A palette tint as 0-255 channels, for painters that build their own fills. */
export function hexToRgbTuple(hex: string): Rgb {
  return hexToRgb(hex);
}

function adjustBrightness(hex: string, factor: number): string {
  const { r, g, b } = hexToRgb(hex);
  const clamp = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n * factor)));
  const toHex = (n: number) => clamp(n).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function hexToHsl(hex: string): Hsl {
  const { r: ri, g: gi, b: bi } = hexToRgb(hex);
  const r = ri / 255;
  const g = gi / 255;
  const b = bi / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let sat = 0;
  if (max !== min) {
    const d = max - min;
    sat = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }
  return { h, s: sat, l };
}

function hslToHex({ h, s, l }: Hsl): string {
  let r: number;
  let g: number;
  let b: number;
  if (s === 0) {
    r = g = b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  const toHex = (n: number): string =>
    Math.round(clamp01(n) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function hue2rgb(p: number, q: number, t: number): number {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}
