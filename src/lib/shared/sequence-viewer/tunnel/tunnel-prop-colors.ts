/**
 * Tunnel layer coloration.
 *
 * Beyond the base blue/red pair, every overlaid kaleidoscope copy used to reuse
 * the base colors — so a fold-8 + mirror stack just repeated purple/orange. This
 * spreads the layers across the spectrum while keeping the two families on
 * opposite ends:
 *
 *   - Blue family (even propIndex) fans the COOL arc: blue → cyan → green.
 *     Green is the blue family's far end (green reads as "closer to blue").
 *   - Red family (odd propIndex) fans the WARM/PINK arc: red → pink → magenta.
 *     Magenta is the red family's far end ("closer to red").
 *
 * The base pair (propIndex 0 = blue, 1 = red) is left to the app's own colors;
 * callers only recolor layers (propIndex >= 2). The propIndex convention matches
 * the tip trackers: base blue=0, red=1; layer li blue=2+2*li, red=3+2*li.
 */

import {
  DEFAULT_VIEWER_CUSTOM_COLORS,
  normalizeViewerHexColor,
  type ViewerCustomColorPair,
} from "../domain/viewer-custom-colors";
import { normalizeLegacyHandPair } from "@tka/tka-types";

export type TunnelPropColorMode = "hands" | "spectrum" | "custom";

export interface TunnelPropColorPair extends ViewerCustomColorPair {
  /** Resolved stage order, including the base performer at index zero. */
  performers?: ViewerCustomColorPair[];
}

export interface TunnelPerformerColors {
  mode: "custom" | "hue";
  custom: ViewerCustomColorPair;
  hue: number;
  saturation: number;
  leftLightness: number;
  rightLightness: number;
}

export interface TunnelPropColorState {
  mode: TunnelPropColorMode;
  custom: TunnelPropColorPair;
  performers?: Record<string, TunnelPerformerColors>;
}

/** Stable seed for Custom mode. It deliberately uses the dark-stage hand
 * colors because Tunnel playback is authored on the dark canvas. */
export const DEFAULT_TUNNEL_CUSTOM_PROP_COLORS: TunnelPropColorPair = {
  ...DEFAULT_VIEWER_CUSTOM_COLORS,
};

export const DEFAULT_TUNNEL_PROP_COLOR_STATE: TunnelPropColorState = {
  mode: "spectrum",
  custom: { ...DEFAULT_TUNNEL_CUSTOM_PROP_COLORS },
};

export function normalizeTunnelHexColor(
  value: unknown,
  fallback: string
): string {
  return normalizeViewerHexColor(value, fallback);
}

/** Parse current color state and the version-2 `spectrum` boolean at one
 * boundary. Callers always receive a complete, normalized state. */
export function resolveTunnelPropColorState(
  value: unknown,
  legacySpectrum?: unknown
): TunnelPropColorState {
  const candidate =
    value && typeof value === "object"
      ? (value as {
          mode?: unknown;
          performers?: unknown;
          custom?: { left?: unknown; right?: unknown } | null;
        })
      : null;
  const custom = normalizeLegacyHandPair(candidate?.custom);
  const mode: TunnelPropColorMode =
    candidate?.mode === "hands" ||
    candidate?.mode === "spectrum" ||
    candidate?.mode === "custom"
      ? candidate.mode
      : legacySpectrum === false
        ? "hands"
        : "spectrum";
  return {
    mode,
    ...normalizePerformerEntries(candidate?.performers),
    custom: {
      left: normalizeTunnelHexColor(
        custom?.left,
        DEFAULT_TUNNEL_CUSTOM_PROP_COLORS.left.toLowerCase()
      ),
      right: normalizeTunnelHexColor(
        custom?.right,
        DEFAULT_TUNNEL_CUSTOM_PROP_COLORS.right.toLowerCase()
      ),
    },
  };
}

function finite(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function normalizePerformerColors(
  value: unknown
): TunnelPerformerColors {
  const v = (
    value && typeof value === "object" ? value : {}
  ) as Partial<TunnelPerformerColors>;
  const percent = (n: unknown, fallback: number) =>
    Math.max(0, Math.min(100, finite(n, fallback)));
  return {
    mode: v.mode === "hue" ? "hue" : "custom",
    custom: {
      left: normalizeTunnelHexColor(v.custom?.left, "#8080ff"),
      right: normalizeTunnelHexColor(v.custom?.right, "#000080"),
    },
    hue: ((finite(v.hue, 240) % 360) + 360) % 360,
    saturation: percent(v.saturation, 100),
    leftLightness: percent(v.leftLightness, 75),
    rightLightness: percent(v.rightLightness, 25),
  };
}

function normalizePerformerEntries(
  value: unknown
): Pick<TunnelPropColorState, "performers"> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const entries = Object.entries(value)
    .filter(
      ([id, v]) =>
        id.length > 0 &&
        id.length <= 200 &&
        v &&
        typeof v === "object" &&
        ["custom", "hue"].includes((v as TunnelPerformerColors).mode)
    )
    .slice(0, 128)
    .map(([id, v]) => [id, normalizePerformerColors(v)]);
  return entries.length ? { performers: Object.fromEntries(entries) } : {};
}

export function resolvePerformerColorPair(
  value: TunnelPerformerColors
): ViewerCustomColorPair {
  const colors = normalizePerformerColors(value);
  if (colors.mode === "custom") return { ...colors.custom };
  const shade = (lightness: number) => {
    const rgb = hslToRgb01(
      colors.hue,
      colors.saturation / 100,
      lightness / 100
    );
    return `#${toHex2(rgb.r * 255)}${toHex2(rgb.g * 255)}${toHex2(rgb.b * 255)}`;
  };
  return {
    left: shade(colors.leftLightness),
    right: shade(colors.rightLightness),
  };
}

export function tunnelPerformerPair(
  colors: TunnelPropColorPair,
  index: number
): ViewerCustomColorPair {
  return (
    colors.performers?.[index] ?? { left: colors.left, right: colors.right }
  );
}

export function buildTunnelRenderColors(
  state: TunnelPropColorState,
  performerIds: readonly string[],
  handColors: ViewerCustomColorPair
): TunnelPropColorPair | null {
  if (!performerIds.some((id) => Object.hasOwn(state.performers ?? {}, id))) {
    return activeTunnelPropColorPair(state);
  }
  const performers = performerIds.map((id, index) => {
    const override = Object.hasOwn(state.performers ?? {}, id)
      ? state.performers![id]
      : undefined;
    if (override) return resolvePerformerColorPair(override);
    if (state.mode === "custom") return { ...state.custom };
    if (state.mode === "hands" || index === 0) return { ...handColors };
    return {
      left: tunnelPropColor(index * 2, performerIds.length - 1).hex,
      right: tunnelPropColor(index * 2 + 1, performerIds.length - 1).hex,
    };
  });
  return { ...performers[0]!, performers };
}

/** Exact pair sent to the engine only while Custom mode is active. */
export function activeTunnelPropColorPair(
  state: TunnelPropColorState
): TunnelPropColorPair | null {
  return state.mode === "custom" ? { ...state.custom } : null;
}

// Hue arcs in degrees. t=0 sits at the family anchor, t=1 at its far color.
const BLUE_ANCHOR_HUE = 250; // blue-violet
const BLUE_FAR_HUE = 110; // green  (250 → 200 cyan → 110 green)
const RED_ANCHOR_HUE = 360; // red (== 0)
const RED_FAR_HUE = 285; // magenta-violet (360 → 320 magenta → 285)

const SAT = 0.85;
const LIGHT = 0.57;

export interface TunnelColor {
  /** "#rrggbb" */
  hex: string;
  /** Components in 0..1 (for the fire colorField / WebGL uniforms). */
  rgb01: { r: number; g: number; b: number };
  /** Components in 0..255. */
  rgb255: { r: number; g: number; b: number };
}

export function tunnelColorFromHex(hex: string): TunnelColor {
  const normalized = normalizeTunnelHexColor(hex, "#ffffff");
  const packed = Number.parseInt(normalized.slice(1), 16);
  const rgb255 = {
    r: (packed >> 16) & 255,
    g: (packed >> 8) & 255,
    b: packed & 255,
  };
  return {
    hex: normalized,
    rgb255,
    rgb01: {
      r: rgb255.r / 255,
      g: rgb255.g / 255,
      b: rgb255.b / 255,
    },
  };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** HSL (h in deg, s/l in 0..1) → rgb 0..1. */
function hslToRgb01(
  h: number,
  s: number,
  l: number
): { r: number; g: number; b: number } {
  const hh = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (hh < 60) [r, g, b] = [c, x, 0];
  else if (hh < 120) [r, g, b] = [x, c, 0];
  else if (hh < 180) [r, g, b] = [0, c, x];
  else if (hh < 240) [r, g, b] = [0, x, c];
  else if (hh < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return { r: r + m, g: g + m, b: b + m };
}

function toHex2(n: number): string {
  return Math.max(0, Math.min(255, Math.round(n)))
    .toString(16)
    .padStart(2, "0");
}

/**
 * Color for one prop in the tunnel stack.
 *
 * @param propIndex base left=0, right=1; layer left=2+2*li, right=3+2*li.
 * @param layerCount number of overlaid layers (`additionalLayers.length`); the
 *                   family spans `layerCount + 1` props (base + layers), so the
 *                   fan stretches to fill exactly the active stack.
 */
export function tunnelPropColor(
  propIndex: number,
  layerCount: number
): TunnelColor {
  const isLeft = propIndex % 2 === 0;
  const familyIndex = Math.floor(propIndex / 2); // 0 = base
  const familyCount = Math.max(1, layerCount + 1);
  const t = familyCount <= 1 ? 0 : Math.min(1, familyIndex / (familyCount - 1));

  const hue = isLeft
    ? lerp(BLUE_ANCHOR_HUE, BLUE_FAR_HUE, t)
    : lerp(RED_ANCHOR_HUE, RED_FAR_HUE, t);

  const rgb01 = hslToRgb01(hue, SAT, LIGHT);
  const rgb255 = { r: rgb01.r * 255, g: rgb01.g * 255, b: rgb01.b * 255 };
  const hex = `#${toHex2(rgb255.r)}${toHex2(rgb255.g)}${toHex2(rgb255.b)}`;
  return { hex, rgb01, rgb255 };
}

// ── Performer spotlight ────────────────────────────────────────────────────
// When a performer is selected in the Speed drawer, every OTHER copy dims so the
// chosen one is unmistakable. A prop's "family" mirrors the color convention
// above: family 0 = base "you", family k = copy arm k (propIndex 2k / 2k+1).

/** Dim multiplier for a non-selected performer under the spotlight (0 = gone,
 *  1 = full). Low enough that the selected performer clearly dominates a dense
 *  kaleidoscope, high enough that the others stay faintly legible. */
export const SPOTLIGHT_DIM = 0.12;

export type TunnelLayerSelection =
  | number
  | readonly number[]
  | null
  | undefined;

/**
 * Brightness multiplier for a prop family under the spotlight. `selectedArm` is
 * the selected performer (0 = base "you", k = copy arm k), or null when none is
 * selected. `familyIndex` is `Math.floor(propIndex / 2)`. Returns 1 for the
 * selected family (or when nothing is selected), else {@link SPOTLIGHT_DIM}.
 */
export function spotlightFactor(
  selectedArm: TunnelLayerSelection,
  familyIndex: number
): number {
  if (selectedArm == null) return 1;
  const selected =
    typeof selectedArm === "number"
      ? familyIndex === selectedArm
      : selectedArm.includes(familyIndex);
  return selected ? 1 : SPOTLIGHT_DIM;
}

/** Scale a "#rrggbb" toward black by `factor` (1 = unchanged) — for dimming the
 *  per-tip effect colors, whose only brightness lever is the color itself. */
export function dimHex(hex: string, factor: number): string {
  if (factor >= 1) return hex;
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1]!, 16);
  return `#${toHex2(((n >> 16) & 255) * factor)}${toHex2(((n >> 8) & 255) * factor)}${toHex2((n & 255) * factor)}`;
}
