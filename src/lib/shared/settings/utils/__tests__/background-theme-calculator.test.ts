import { describe, it, expect } from "vitest";
import {
  calculateGradientLuminance,
  contrastRatio,
  ensureAccentContrast,
  generateMatteTheme,
  getThemeMode,
} from "../background-theme-calculator";
import { BACKGROUND_THEME_COLORS } from "#lib/shared/theme/config/tka-theme-config.js";

// The calculator's own light-mode surfaces (generateMatteTheme "light" branch).
const LIGHT_SURFACES = ["#d0d0ca", "#d8d8d2", "#c8c8c2"];
// Effective dark panel: near-black rgba over a dark scene (calculator's anchor).
const DARK_ANCHOR = "#16161f";

// Minimal hue extractor for hue-preservation assertions (degrees 0-360).
function hueOf(hex: string): number {
  const c = hex.replace("#", "");
  const r = parseInt(c.slice(0, 2), 16) / 255;
  const g = parseInt(c.slice(2, 4), 16) / 255;
  const b = parseInt(c.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  const d = max - min;
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return h * 360;
}

describe("contrastRatio", () => {
  it("computes the WCAG extremes and is symmetric", () => {
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 1);
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 1);
    expect(contrastRatio("#808080", "#808080")).toBeCloseTo(1, 3);
  });
});

describe("accent contrast floor — real background palettes", () => {
  for (const [bg, colors] of Object.entries(BACKGROUND_THEME_COLORS)) {
    it(`${bg}: accent clears the per-mode floor on every theme surface`, () => {
      const mode = getThemeMode(calculateGradientLuminance(colors!));
      const theme = generateMatteTheme(mode, colors![1]);
      if (mode === "light") {
        for (const surface of LIGHT_SURFACES) {
          expect(contrastRatio(theme.accent, surface)).toBeGreaterThanOrEqual(7);
        }
      } else {
        expect(contrastRatio(theme.accent, DARK_ANCHOR)).toBeGreaterThanOrEqual(4.5);
      }
    });
  }
});

describe("accent contrast floor — hostile custom colors", () => {
  // Light mode: everything must be forced down to 7:1 (AAA) on all surfaces —
  // includes the OLD default #2563eb, which measured only ~3.3:1.
  const lightInputs = ["#2563eb", "#fde047", "#ffffff", "#22d3ee", "#d0d0ca"];
  for (const input of lightInputs) {
    it(`light: ${input} → ≥7:1 on every light surface`, () => {
      const { accent } = generateMatteTheme("light", input);
      for (const surface of LIGHT_SURFACES) {
        expect(contrastRatio(accent, surface)).toBeGreaterThanOrEqual(7);
      }
    });
  }

  // Dark mode: dim accents must be lifted to ≥4.5:1 (Blossom's #db2777 was ~3.7).
  const darkInputs = ["#1e1b4b", "#db2777", "#4338ca", "#000000"];
  for (const input of darkInputs) {
    it(`dark: ${input} → ≥4.5:1 on the dark anchor`, () => {
      const { accent } = generateMatteTheme("dark", input);
      expect(contrastRatio(accent, DARK_ANCHOR)).toBeGreaterThanOrEqual(4.5);
    });
  }
});

describe("ensureAccentContrast behavior", () => {
  it("leaves an already-passing accent untouched", () => {
    // Forest green passes 4.5 on the dark anchor as-is.
    expect(ensureAccentContrast("#22c55e", "dark")).toBe("#22c55e");
  });

  it("preserves hue when it adjusts (theme identity survives)", () => {
    const pink = "#db2777";
    const adjusted = ensureAccentContrast(pink, "dark");
    expect(adjusted).not.toBe(pink);
    // Hue drift under ±4° — lightness-only walk.
    const drift = Math.abs(hueOf(adjusted) - hueOf(pink));
    expect(Math.min(drift, 360 - drift)).toBeLessThanOrEqual(4);

    const blue = "#2563eb";
    const darkened = ensureAccentContrast(blue, "light");
    expect(darkened).not.toBe(blue);
    const blueDrift = Math.abs(hueOf(darkened) - hueOf(blue));
    expect(Math.min(blueDrift, 360 - blueDrift)).toBeLessThanOrEqual(4);
  });

  it("supports the AAA text target in dark mode (--theme-accent-text)", () => {
    const text = ensureAccentContrast("#db2777", "dark", 7);
    expect(contrastRatio(text, DARK_ANCHOR)).toBeGreaterThanOrEqual(7);
  });

  it("solves even achromatic extremes", () => {
    expect(contrastRatio(ensureAccentContrast("#ffffff", "light"), "#c8c8c2")).toBeGreaterThanOrEqual(7);
    expect(contrastRatio(ensureAccentContrast("#000000", "dark"), DARK_ANCHOR)).toBeGreaterThanOrEqual(4.5);
  });

  it("white-on-accent stays readable after the light-mode floor (fill role)", () => {
    // Darkening for text ALSO fixes the white-label-on-accent fill case.
    const { accent } = generateMatteTheme("light", "#2563eb");
    expect(contrastRatio("#ffffff", accent)).toBeGreaterThanOrEqual(7);
  });

  it("falls back to mode defaults for invalid input, then floors them", () => {
    const light = generateMatteTheme("light", "not-a-color");
    for (const surface of LIGHT_SURFACES) {
      expect(contrastRatio(light.accent, surface)).toBeGreaterThanOrEqual(7);
    }
    const dark = generateMatteTheme("dark", undefined);
    expect(contrastRatio(dark.accent, DARK_ANCHOR)).toBeGreaterThanOrEqual(4.5);
  });
});
