/**
 * Ink palette registry.
 *
 * Mirrors the smoke palette pattern but with stroke-specific color slots:
 * `pigment` (stroke core), `edge` (feathering), `splatterTint` (sprint-2
 * burst particle color), `poolTint` (sprint-2 ground decal color). Flags
 * `watercolor` and `emissive` alter renderer behavior - see spec
 * docs/superpowers/specs/2026-04-15-effects-phase-1j-ink-design.md.
 *
 * Sprint 1 (1j.i) reads only `pigment`, `edge`, and the two flags in the
 * renderer. `splatterTint` and `poolTint` ship now so sprint 2 (1j.iii +
 * 1j.iv) doesn't need another palette migration.
 *
 * Placed under 3d/effects/ink/ per the Phase 1j.i instructions. Both 2D
 * (Ink2DRenderer) and 3D backends resolve palettes through this single
 * source of truth.
 */

import type { InkIntent } from "#lib/shared/effects/domain/effects-config.js";

export interface InkPalette {
  readonly id: InkIntent["palette"];
  /** Hex - stroke core color (dense center of the brush path). */
  readonly pigment: string;
  /** Hex - stroke edge / feathering color. */
  readonly edge: string;
  /** Hex - sprint-2 splatter burst particle color. */
  readonly splatterTint: string;
  /** Hex - sprint-2 ground pool decal color. */
  readonly poolTint: string;
  /**
   * True on the neon palette only - switches the renderer from
   * source-over (opaque pigment) to `lighter` additive blend so the
   * stroke glows. One palette that glows reinforces the "default ink is
   * opaque, not emissive" read.
   */
  readonly emissive?: boolean;
  /**
   * True on the watercolor palette. Each renderer supplies its own translucent
   * wash profile and suppresses ground pooling because watercolor evaporates.
   */
  readonly watercolor?: boolean;
}

const INDIA: InkPalette = {
  id: "india",
  pigment: "#0a0a0a",
  edge: "#1a1a1a",
  splatterTint: "#0a0a0a",
  poolTint: "#050505",
};

const SUMI: InkPalette = {
  id: "sumi",
  pigment: "#404040",
  edge: "#606060",
  splatterTint: "#303030",
  poolTint: "#282828",
};

const WATERCOLOR: InkPalette = {
  id: "watercolor",
  pigment: "#4080c0",
  edge: "#80b0e0",
  splatterTint: "#6098d0",
  // Watercolor evaporates - poolTint unused but kept for type completeness.
  poolTint: "#80b0e0",
  watercolor: true,
};

const NEON: InkPalette = {
  id: "neon",
  pigment: "#ff2080",
  edge: "#ff60a0",
  splatterTint: "#ff2080",
  poolTint: "#c01060",
  emissive: true,
};

const BLOOD: InkPalette = {
  id: "blood",
  pigment: "#8f2635",
  edge: "#d67881",
  splatterTint: "#a84255",
  poolTint: "#310a11",
};

const ACID: InkPalette = {
  id: "acid",
  pigment: "#7fd94a",
  edge: "#b8ff6f",
  splatterTint: "#98e860",
  poolTint: "#4a8a2a",
};

export const INK_PALETTES = {
  india: INDIA,
  sumi: SUMI,
  watercolor: WATERCOLOR,
  neon: NEON,
  blood: BLOOD,
  acid: ACID,
} as const;

/**
 * Resolve the active palette for an intent. For `palette === "custom"`,
 * derive the color slots from `customColor`:
 *   pigment      = base
 *   edge         = +15% L
 *   splatterTint = base
 *   poolTint     = -30% L
 * No flags - custom strokes are opaque (matches default ink identity).
 */
export function resolveInkPalette(intent: InkIntent): InkPalette {
  if (intent.palette !== "custom") {
    return INK_PALETTES[intent.palette];
  }
  return deriveCustomPalette(intent.customColor);
}

export function deriveCustomPalette(hex: string): InkPalette {
  const base = hexToHsl(hex);
  const pigment = hslToHex(base);
  const edge = hslToHex({ h: base.h, s: base.s, l: clamp01(base.l + 0.15) });
  const poolTint = hslToHex({ h: base.h, s: base.s, l: clamp01(base.l - 0.3) });
  return {
    id: "custom",
    pigment,
    edge,
    splatterTint: pigment,
    poolTint,
  };
}

/* --- HSL helpers (local copy; mirrors SmokePalettes/WaterPalettes) --- */

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
  return s.length >= 6 ? s.slice(0, 6) : "0a0a0a";
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
