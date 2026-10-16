/**
 * Smoke palette registry.
 *
 * First effect where palette carries **behavioral multipliers** (lifetime,
 * curl bias, rise bias) in addition to color slots. Rationale: smoke
 * palettes read as different effects entirely - incense is a thin thread
 * of mist, fog is a dense wall, genie is a fast colored swirl. Exposing
 * lifetime/curl/rise as separate user sliders would force the user to
 * rebuild each personality themselves on top of default behavior; baking
 * it into the palette lets the user pick a feeling.
 *
 * User-facing sliders on the intent layer (curlStrength, riseSpeed) are
 * _multipliers_ of the palette defaults, not absolute values. The
 * translator composes them at resolve time.
 *
 * Spec: docs/superpowers/specs/2026-04-15-effects-phase-1i-smoke-design.md
 *
 * Backend-agnostic - both 2D (Smoke2DRenderer) and 3D (SmokeRenderer3D)
 * resolve a SmokeIntent's palette field through `resolveSmokePalette()`
 * and then sample core/edge/lifetime/curlBias/riseBias as needed.
 */

import type { SmokeIntent } from "./effects-config";

export interface SmokePalette {
  readonly id: SmokeIntent["palette"];
  /** Hex - dense puff interior. */
  readonly core: string;
  /** Hex - puff rim / fade color. */
  readonly edge: string;
  /** Seconds - base lifetime before per-particle jitter. */
  readonly lifetime: number;
  /** 0-2 multiplier on the user's curlStrength. */
  readonly curlBias: number;
  /** 0-2 multiplier on the user's riseSpeed. */
  readonly riseBias: number;
  /**
   * Heat the smoke carries, against air at 0.35. Warmer smoke rises; cooler
   * smoke (fog) is heavier than the air and settles.
   */
  readonly warmth: number;
  /**
   * True = genie-style rim hue shift over particle lifetime.
   * Implementation deferred to 1i.iii; the flag is set here so translators
   * and renderers can branch on it once shipped.
   */
  readonly hueShift?: boolean;
}

const INCENSE: SmokePalette = {
  id: "incense",
  core: "#d8d8d8",
  edge: "#f0f0f0",
  lifetime: 5.0,
  curlBias: 0.3,
  riseBias: 0.4,
  warmth: 0.42,
};

const FOG: SmokePalette = {
  id: "fog",
  core: "#c0c0c8",
  edge: "#e0e0e8",
  lifetime: 6.0,
  curlBias: 0.5,
  riseBias: 0.2,
  warmth: 0.08,
};

const GENIE: SmokePalette = {
  id: "genie",
  core: "#a060ff",
  edge: "#ffe0ff",
  lifetime: 2.0,
  curlBias: 1.0,
  riseBias: 0.9,
  warmth: 1.05,
  hueShift: true,
};

const CURSED: SmokePalette = {
  id: "cursed",
  core: "#202020",
  edge: "#606060",
  lifetime: 5.0,
  curlBias: 0.8,
  riseBias: 0.3,
  warmth: 0.22,
};

const SPIRIT: SmokePalette = {
  id: "spirit",
  core: "#80c8ff",
  edge: "#ffffff",
  lifetime: 6.0,
  curlBias: 0.4,
  riseBias: 0.5,
  warmth: 0.32,
};

const CAMPFIRE: SmokePalette = {
  id: "campfire",
  core: "#6e2411",
  edge: "#dc6b24",
  lifetime: 4.0,
  curlBias: 0.6,
  riseBias: 0.6,
  warmth: 0.95,
};

export const SMOKE_PALETTES = {
  incense: INCENSE,
  fog: FOG,
  genie: GENIE,
  cursed: CURSED,
  spirit: SPIRIT,
  campfire: CAMPFIRE,
} as const;

/**
 * Resolve the active palette for an intent. For `palette === "custom"`,
 * derive the color slots from `customColor`; behavioral multipliers fall
 * back to neutral defaults (lifetime 7.0, curl 0.5, rise 0.5).
 */
export function resolveSmokePalette(intent: SmokeIntent): SmokePalette {
  if (intent.palette !== "custom") {
    return SMOKE_PALETTES[intent.palette];
  }
  return deriveCustomPalette(intent.customColor);
}

/**
 * Custom-palette derivation:
 *   core       = base
 *   edge       = +15% L
 *   lifetime   = 7.0s  (neutral)
 *   curlBias   = 0.5   (neutral)
 *   riseBias   = 0.5   (neutral)
 *   warmth     = 0.35  (neutral: neither rises nor sinks on its own)
 *   hueShift   = false
 */
export function deriveCustomPalette(hex: string): SmokePalette {
  const base = hexToHsl(hex);
  const core = hslToHex(base);
  const edge = hslToHex({ h: base.h, s: base.s, l: clamp01(base.l + 0.15) });
  return {
    id: "custom",
    core,
    edge,
    lifetime: 7.0,
    curlBias: 0.5,
    riseBias: 0.5,
    warmth: 0.35,
  };
}

/* --- HSL helpers (local copy; mirrors WaterPalettes/BubblePalettes) --- */

interface Hsl {
  h: number;
  s: number;
  l: number;
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
  return s.length >= 6 ? s.slice(0, 6) : "d8d8d8";
}

function hexToHsl(hex: string): Hsl {
  const s = normalizeHex(hex);
  const r = parseInt(s.slice(0, 2), 16) / 255;
  const g = parseInt(s.slice(2, 4), 16) / 255;
  const b = parseInt(s.slice(4, 6), 16) / 255;
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
