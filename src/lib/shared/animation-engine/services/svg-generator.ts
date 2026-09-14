import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import type { PropSvgData } from "$lib/shared/animation-engine/domain/types/svg-types";

export type { PropSvgData } from "$lib/shared/animation-engine/domain/types/svg-types";
import {
  applyColorToSvg,
  SELECTIVE_COLOR_PROP_TYPES,
  getMotionColor,
  type ThemeMode,
} from "$lib/shared/utils/svg-color-utils";
import { HandSide } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import {
  TORCH_CONTRAST_PALETTE,
  recolorMarkedPart,
} from "$lib/shared/pictograph/prop/domain/torch-contrast";
import {
  getAnimationVisibilityManager,
  type AnimationVisibilityStateManager,
} from "$lib/shared/animation-engine/state/animation-visibility-state.svelte";
import {
  applyFanFrameColor,
  scaleFanAppearanceForBigFan,
  fanAppearanceArtwork,
  parseFanRenderKey,
} from "$lib/shared/pictograph/prop/domain/fan-appearance";
import {
  modelSpriteArtwork,
  parseModelRenderKey,
  type PropSpriteSide,
} from "$lib/shared/pictograph/prop/domain/prop-look";

/**
 * SVG Generator for creating prop staff images and grid
 * Based on the exact implementation from standalone_animator.html
 */

// Module-level cache for fetched SVG content to avoid repeated network requests
const svgCache = new Map<string, string>();

/**
 * Get the current theme mode based on animation visibility settings
 * Dark Mode (dark mode) = "dark" theme colors (brighter props for contrast)
 * Light Mode (light mode) = "light" theme colors (darker props for contrast)
 */
function getCurrentThemeMode(vm?: AnimationVisibilityStateManager): ThemeMode {
  try {
    const manager = vm ?? getAnimationVisibilityManager();
    return manager.isDarkMode() ? "dark" : "light";
  } catch {
    // Fallback to dark mode if manager not available
    return "dark";
  }
}

/**
 * The canonical blue/red the base prop pair renders with (theme-aware), so other
 * surfaces (e.g. the tunnel's spectrum-off layers) can match the base staffs
 * exactly instead of approximating with a separate palette. Mirrors the color
 * generateBluePropSvg/generateRedPropSvg bake in for the base pair.
 */
export function getBaseMotionColors(darkMode?: boolean): {
  left: string;
  right: string;
} {
  const themeMode =
    darkMode !== undefined
      ? darkMode
        ? "dark"
        : "light"
      : getCurrentThemeMode();
  return {
    left: getMotionColor(HandSide.LEFT, themeMode),
    right: getMotionColor(HandSide.RIGHT, themeMode),
  };
}

/**
 * Generate grid SVG with support for strict mode points
 * Loads the actual grid SVG files and adds strict-mode class for animation viewer
 * @param gridMode - Type of grid to generate (GridMode.DIAMOND or GridMode.BOX)
 * @param useStrictPoints - Whether to enable strict mode (for animation viewer)
 */
export async function generateGridSvg(
  gridMode: GridMode = GridMode.DIAMOND,
  useStrictPoints: boolean = true,
  showNonRadialPoints: boolean = true
): Promise<string> {
  // For animation viewer, always use strict mode
  // Load from actual grid SVG files to get the complete grid with all point layers
  let gridFileName: string;
  switch (gridMode) {
    case GridMode.BOX:
      gridFileName = "box_grid.svg";
      break;
    case GridMode.DIAMOND:
      gridFileName = "diamond_grid.svg";
      break;
    default:
      gridFileName = "8point_grid.svg";
      break;
  }

  try {
    const cacheKey = `/images/grid/${gridFileName}`;
    let svgContent: string;

    // Check cache first
    if (svgCache.has(cacheKey)) {
      svgContent = svgCache.get(cacheKey)!;
    } else {
      const response = await fetch(cacheKey);

      if (!response.ok) {
        console.error(`Failed to load grid SVG: ${response.status}`);
        return getFallbackGridSvg(gridMode);
      }
      svgContent = await response.text();
      svgCache.set(cacheKey, svgContent);
    }

    // Add strict-mode class to the SVG root element if strict points are enabled
    if (useStrictPoints) {
      svgContent = svgContent.replace(
        /<svg([^>]*)>/,
        '<svg$1 class="strict-mode">'
      );
    }

    // Hide nonradial (layer2) points when requested
    if (!showNonRadialPoints) {
      svgContent = svgContent.replace(
        "</style>",
        ".strict-layer2-point{fill:none !important}.normal-layer2-point{fill:none !important}\n</style>"
      );
    }

    return svgContent;
  } catch (error) {
    console.error("Error loading grid SVG:", error);
    return getFallbackGridSvg(gridMode);
  }
}

/**
 * Fallback grid SVG for when file loading fails
 */
function getFallbackGridSvg(gridMode: GridMode): string {
  if (gridMode === GridMode.EIGHT_POINT) {
    return `<?xml version="1.0" encoding="utf-8"?>
<svg version="1.1" id="Layer_1" xmlns="http://www.w3.org/2000/svg" x="0" y="0" viewBox="0 0 950 950" xml:space="preserve" class="strict-mode">
<style>
  .box-grid-stroke{stroke:#000;stroke-width:7;stroke-miterlimit:10}
  .normal-hand-point{fill:none}
  .strict-hand-point{fill:currentColor}
</style>
<circle id="center_point" cx="475" cy="475" r="12"/>
<circle id="n_diamond_hand_point_strict" class="strict-hand-point" cx="475" cy="325" r="4.7"/>
<circle id="e_diamond_hand_point_strict" class="strict-hand-point" cx="625" cy="475" r="4.7"/>
<circle id="s_diamond_hand_point_strict" class="strict-hand-point" cx="475" cy="625" r="4.7"/>
<circle id="w_diamond_hand_point_strict" class="strict-hand-point" cx="325" cy="475" r="4.7"/>
<circle id="strict_ne_box_hand_point" class="strict-hand-point" cx="581.1" cy="368.9" r="4.7"/>
<circle id="strict_se_box_hand_point" class="strict-hand-point" cx="581.1" cy="581.1" r="4.7"/>
<circle id="strict_sw_box_hand_point" class="strict-hand-point" cx="368.9" cy="581.1" r="4.7"/>
<circle id="strict_nw_box_hand_point" class="strict-hand-point" cx="368.9" cy="368.9" r="4.7"/>
</svg>`;
  } else if (gridMode === GridMode.BOX) {
    return `<?xml version="1.0" encoding="utf-8"?>
<svg version="1.1" id="Layer_1" xmlns="http://www.w3.org/2000/svg" x="0" y="0" viewBox="0 0 950 950" xml:space="preserve" class="strict-mode">
<style>
  .box-outer-ring{fill:none;stroke:#000;stroke-width:13;stroke-miterlimit:10}
  .normal-hand-point{fill:none}
  .strict-hand-point{fill:currentColor}
</style>
<circle id="center_point" cx="475" cy="475" r="11.2"/>
<circle id="ne_box_outer_point" class="box-outer-ring" cx="262.9" cy="262.9" r="25"/>
<circle id="se_box_outer_point" class="box-outer-ring" cx="687.1" cy="262.9" r="25"/>
<circle id="sw_box_outer_point" class="box-outer-ring" cx="687.1" cy="687.1" r="25"/>
<circle id="nw_box_outer_point" class="box-outer-ring" cx="262.9" cy="687.1" r="25"/>
<circle id="strict_ne_box_hand_point" class="strict-hand-point" cx="581.1" cy="368.9" r="4.7"/>
<circle id="strict_se_box_hand_point" class="strict-hand-point" cx="581.1" cy="581.1" r="4.7"/>
<circle id="strict_sw_box_hand_point" class="strict-hand-point" cx="368.9" cy="581.1" r="4.7"/>
<circle id="strict_nw_box_hand_point" class="strict-hand-point" cx="368.9" cy="368.9" r="4.7"/>
</svg>`;
  } else {
    return `<?xml version="1.0" encoding="utf-8"?>
<svg version="1.1" id="Layer_1" xmlns="http://www.w3.org/2000/svg" x="0" y="0" viewBox="0 0 950 950" xml:space="preserve" class="strict-mode">
<style>
  .normal-hand-point{fill:none}
  .strict-hand-point{fill:currentColor}
</style>
<circle id="n_diamond_hand_point_strict" class="strict-hand-point" cx="475" cy="325" r="4.7"/>
<circle id="e_diamond_hand_point_strict" class="strict-hand-point" cx="625" cy="475" r="4.7"/>
<circle id="s_diamond_hand_point_strict" class="strict-hand-point" cx="475" cy="625" r="4.7"/>
<circle id="w_diamond_hand_point_strict" class="strict-hand-point" cx="325" cy="475" r="4.7"/>
<circle id="center_point" cx="475" cy="475" r="12"/>
</svg>`;
  }
}

/**
 * Generate blue staff SVG exactly as in standalone_animator.html
 * @deprecated Use generateBluePropSvg instead
 */
export function generateLeftStaffSvg(): string {
  const themeMode = getCurrentThemeMode();
  const leftColor = getMotionColor(HandSide.LEFT, themeMode);
  return `<svg version="1.1" id="staff" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px" viewBox="0 0 252.8 77.8" style="enable-background:new 0 0 252.8 77.8;" xml:space="preserve"><path fill="${leftColor}" stroke="#555555" stroke-width="1" stroke-miterlimit="10" d="M251.4,67.7V10.1c0-4.8-4.1-8.7-9.1-8.7s-9.1,3.9-9.1,8.7v19.2H10.3c-4.9,0-8.9,3.8-8.9,8.5V41 c0,4.6,4,8.5,8.9,8.5h222.9v18.2c0,4.8,4.1,8.7,9.1,8.7S251.4,72.5,251.4,67.7z"/><circle id="centerPoint" fill="#FF0000" cx="126.4" cy="38.9" r="5" /></svg>`;
}

/**
 * Generate red staff SVG exactly as in standalone_animator.html
 * @deprecated Use generateRedPropSvg instead
 */
export function generateRightStaffSvg(): string {
  const themeMode = getCurrentThemeMode();
  const rightColor = getMotionColor(HandSide.RIGHT, themeMode);
  return `<svg version="1.1" id="staff" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px" viewBox="0 0 252.8 77.8" style="enable-background:new 0 0 252.8 77.8;" xml:space="preserve"><path fill="${rightColor}" stroke="#555555" stroke-width="1" stroke-miterlimit="10" d="M251.4,67.7V10.1c0-4.8-4.1-8.7-9.1-8.7s-9.1,3.9-9.1,8.7v19.2H10.3c-4.9,0-8.9,3.8-8.9,8.5V41 c0,4.6,4,8.5,8.9,8.5h222.9v18.2c0,4.8,4.1,8.7,9.1,8.7S251.4,72.5,251.4,67.7z"/><circle id="centerPoint" fill="#FF0000" cx="126.4" cy="38.9" r="5" /></svg>`;
}

/**
 * Props that stay on the padded `animated/` artwork rather than the shared
 * pictograph family (see resolvePropSvgPath).
 *
 * - torch / bigtorch: their animated viewBoxes are deliberately offset and
 *   padded so the flame isn't clipped while the hand pivot stays put. The
 *   pictograph versions crop to the shaft.
 * - triquetra2: the two families hold different artwork here (300x175.3 vs
 *   170x170), not a uniform rescale, so swapping would change the shape.
 * - sword-* variants: no pictograph counterpart exists.
 */
function isAnimatedOnlyProp(propTypeLower: string): boolean {
  return (
    propTypeLower === "torch" ||
    propTypeLower === "bigtorch" ||
    propTypeLower === "triquetra2" ||
    propTypeLower.startsWith("sword-")
  );
}

/**
 * Resolve the sprite the animation canvas draws.
 *
 * The animation canvas draws the SAME artwork the pictographs use. Both
 * families hold identical paths at origin 0,0 — `animated/` is just each prop
 * uniformly scaled up into a 300/600 box, which left every prop tracing a
 * mandala at a different radius (mandala scale is fixed, not fit-to-content, so
 * tip reach IS mandala radius). The club was converged onto the pictograph
 * family first — its two files are byte-identical — and this brings the rest
 * with it, landing regular props on a ~130 reach.
 */
export function resolvePropSvgPath(
  propTypeLower: string,
  side: PropSpriteSide = "left"
): string {
  const fanRenderKey = parseFanRenderKey(propTypeLower);
  if (fanRenderKey) {
    return fanAppearanceArtwork(fanRenderKey.build, fanRenderKey.cover)!;
  }
  const modelRenderKey = parseModelRenderKey(propTypeLower);
  if (modelRenderKey) {
    return modelSpriteArtwork(modelRenderKey.propType, side);
  }
  const family = isAnimatedOnlyProp(propTypeLower) ? "animated" : "pictograph";
  return `/images/props/${family}/${propTypeLower}.svg`;
}

// The fan build helpers live with the fan appearance domain so the static
// pictograph loader and this animator recolor and size the same artwork the
// same way.
export { applyFanFrameColor };

/**
 * Model sprites are pre-lit in the blue and red motion colors, so the hand
 * picks the file. Callers that only know a color get the closer motion hue.
 */
function spriteSideForColor(color: string): PropSpriteSide {
  const hex = color.trim().replace(/^#/, "");
  const full =
    hex.length === 3
      ? hex
          .split("")
          .map((c) => c + c)
          .join("")
      : hex;
  const value = Number.parseInt(full.slice(0, 6), 16);
  if (Number.isNaN(value)) return "left";
  const red = (value >> 16) & 0xff;
  const blue = value & 0xff;
  return red > blue ? "right" : "left";
}

/**
 * Generate prop SVG with custom color
 */
export async function generatePropSvg(
  propType: string = "staff",
  color: string,
  themeMode: ThemeMode = getCurrentThemeMode(),
  side?: PropSpriteSide
): Promise<PropSvgData> {
  const propTypeLower = propType.toLowerCase();
  const modelRenderKey = parseModelRenderKey(propTypeLower);
  if (modelRenderKey) {
    // Baked 3D capture: material colors are part of the image. No recolor.
    const path = resolvePropSvgPath(
      propTypeLower,
      side ?? spriteSideForColor(color)
    );
    const svg = await fetchPropSvg(path);
    const { width, height } = extractViewBoxDimensions(svg);
    return { svg, width, height };
  }
  const path = resolvePropSvgPath(propTypeLower);
  const fanRenderKey = parseFanRenderKey(propTypeLower);
  const fetchedSvg = await fetchPropSvg(path);
  const semanticPropType = fanRenderKey?.propType ?? propTypeLower;
  // A parsed key is a material build by construction: FanRenderKey types
  // `build` as Exclude<FanBuild, "pictograph">, and resolveFanRenderKey returns
  // null for the pictograph build rather than a key carrying it. The old
  // second half of this test could not go false.
  const isMaterialColoredFan = fanRenderKey !== null;
  const coloredSvg = isMaterialColoredFan
    ? applyFanFrameColor(fetchedSvg, color)
    : applyColorToPropSvg(fetchedSvg, color, semanticPropType);
  const sizedSvg =
    fanRenderKey?.propType === "bigfan"
      ? scaleFanAppearanceForBigFan(coloredSvg)
      : coloredSvg;
  const contrastAdjustedSvg =
    semanticPropType === "torch" || semanticPropType === "bigtorch"
      ? recolorMarkedPart(
          sizedSvg,
          "data-animated-torch-shaft",
          TORCH_CONTRAST_PALETTE[themeMode].shaft
        )
      : sizedSvg;
  const { width, height } = extractViewBoxDimensions(sizedSvg);
  return { svg: contrastAdjustedSvg, width, height };
}

/**
 * Generate blue prop SVG with dynamic prop type
 * Color adapts to theme: dark backgrounds get bright blue, light backgrounds get darker blue
 * @param propType - Type of prop to generate
 * @param darkMode - When provided, uses this instead of global dark mode state (for preview isolation)
 */
export async function generateLeftPropSvg(
  propType: string = "staff",
  darkMode?: boolean
): Promise<PropSvgData> {
  // Use passed darkMode if provided, otherwise read from global state
  const themeMode =
    darkMode !== undefined
      ? darkMode
        ? "dark"
        : "light"
      : getCurrentThemeMode();
  return generatePropSvg(
    propType,
    getMotionColor(HandSide.LEFT, themeMode),
    themeMode,
    "left"
  );
}

/**
 * Generate red prop SVG with dynamic prop type
 * Color adapts to theme: dark backgrounds get bright red, light backgrounds get darker red
 * @param propType - Type of prop to generate
 * @param darkMode - When provided, uses this instead of global dark mode state (for preview isolation)
 */
export async function generateRightPropSvg(
  propType: string = "staff",
  darkMode?: boolean
): Promise<PropSvgData> {
  // Use passed darkMode if provided, otherwise read from global state
  const themeMode =
    darkMode !== undefined
      ? darkMode
        ? "dark"
        : "light"
      : getCurrentThemeMode();
  return generatePropSvg(
    propType,
    getMotionColor(HandSide.RIGHT, themeMode),
    themeMode,
    "right"
  );
}

/**
 * Fetch prop SVG from server (with caching)
 */
async function fetchPropSvg(path: string): Promise<string> {
  // Level 1: In-memory cache (fastest, clears on reload)
  if (svgCache.has(path)) {
    return svgCache.get(path)!;
  }

  // Level 2: Try network fetch
  try {
    const response = await fetch(path);
    if (response.ok) {
      const svgText = await response.text();
      svgCache.set(path, svgText);
      // Background: persist to IndexedDB for offline use
      saveToIDB(path, svgText).catch(() => {});
      return svgText;
    }
  } catch {
    // Network failed - fall through to IndexedDB
  }

  // Level 3: IndexedDB offline cache (survives reload, works offline)
  const cached = await loadFromIDB(path);
  if (cached) {
    svgCache.set(path, cached);
    return cached;
  }

  throw new Error(`Failed to fetch prop SVG from ${path} (offline, no cache)`);
}

// ---- IndexedDB persistence for offline prop SVGs ----

let idbPromise: Promise<IDBDatabase> | null = null;

function getIDB(): Promise<IDBDatabase> {
  if (idbPromise) return idbPromise;
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB not available"));
  }
  idbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open("tka-animated-svg-cache", 1);
    request.onerror = () => {
      idbPromise = null; // allow retry on next call
      reject(request.error);
    };
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains("svgs")) {
        db.createObjectStore("svgs", { keyPath: "path" });
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
  return idbPromise;
}

async function saveToIDB(path: string, svgText: string): Promise<void> {
  const db = await getIDB();
  const tx = db.transaction("svgs", "readwrite");
  tx.objectStore("svgs").put({ path, svgText, cachedAt: Date.now() });
}

async function loadFromIDB(path: string): Promise<string | null> {
  try {
    const db = await getIDB();
    const tx = db.transaction("svgs", "readonly");
    return new Promise((resolve) => {
      const request = tx.objectStore("svgs").get(path);
      request.onsuccess = () => resolve(request.result?.svgText ?? null);
      request.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/**
 * Apply color to prop SVG while preserving transparent sections and accent colors.
 * Torch-family props preserve dark body fills (only knob/handle gets colored).
 */
function applyColorToPropSvg(
  svgText: string,
  color: string,
  propType?: string
): string {
  const isSelective = propType
    ? (SELECTIVE_COLOR_PROP_TYPES as readonly string[]).includes(
        propType.toLowerCase()
      )
    : false;

  return applyColorToSvg(svgText, color, {
    selectiveColorMode: isSelective,
  });
}

/**
 * Extract viewBox dimensions from SVG
 */
function extractViewBoxDimensions(svgText: string): {
  width: number;
  height: number;
} {
  // Try to extract from viewBox attribute
  const viewBoxMatch = svgText.match(/viewBox=["']([^"']+)["']/);
  if (viewBoxMatch?.[1]) {
    const viewBoxValues = viewBoxMatch[1].split(/\s+/).map(Number);
    if (viewBoxValues.length === 4) {
      return { width: viewBoxValues[2]!, height: viewBoxValues[3]! };
    }
  }

  // Fallback to width/height attributes
  const widthMatch = svgText.match(/width=["']([^"']+)["']/);
  const heightMatch = svgText.match(/height=["']([^"']+)["']/);

  if (widthMatch && heightMatch) {
    return {
      width: parseFloat(widthMatch[1]!),
      height: parseFloat(heightMatch[1]!),
    };
  }

  // Default fallback (staff dimensions)
  console.warn(
    "Could not extract SVG dimensions, using default staff dimensions"
  );
  return { width: 252.8, height: 77.8 };
}
