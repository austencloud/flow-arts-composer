/**
 * Background Theme Calculator
 *
 * Calculates theme properties (luminance, contrast, appropriate glass morphism styles)
 * for background colors and gradients to ensure accessibility and visual consistency.
 *
 * ## CSS Variable Hierarchy (2 Layers)
 *
 * ### Layer 1: Dynamic Theme Variables (`--theme-*`) ← Injected here
 * Adapt based on background luminance (light vs dark mode):
 * - `--theme-panel-bg`, `--theme-panel-elevated-bg`
 * - `--theme-card-bg`, `--theme-card-hover-bg`
 * - `--theme-accent`, `--theme-accent-strong`
 * - `--theme-stroke`, `--theme-stroke-strong`
 * - `--theme-text`, `--theme-text-dim`
 * - `--theme-shadow`, `--theme-panel-shadow`
 * - `--theme-danger-bg`, `--theme-danger-hover-bg` (destructive action surfaces)
 * - `--theme-danger-border`, `--theme-danger-hover-border`
 * - `--theme-danger-shadow`, `--theme-danger-hover-shadow`
 *
 * ### Layer 2: Semantic Colors (`--semantic-*`) ← Injected here
 * Status colors that stay constant regardless of background:
 * - `--semantic-error`, `--semantic-error-dim` (red)
 * - `--semantic-success`, `--semantic-success-dim` (green)
 * - `--semantic-warning`, `--semantic-warning-dim` (amber)
 * - `--semantic-info`, `--semantic-info-dim` (blue)
 * - `--prop-blue`, `--prop-red` (domain-specific motion prop colors)
 *
 * Static values (spacing, radius, typography) are now hardcoded in components.
 */

import { BackgroundType } from "@austencloud/backgrounds";
import { setThemeMode } from "$lib/shared/theme/state/theme-mode-state.svelte";
import { BACKGROUND_THEME_COLORS } from "$lib/shared/theme/config/tka-theme-config";
import { BREAKPOINTS } from "$lib/shared/device/domain/constants/device-constants";
import { normalizeBackgroundType } from "$lib/shared/settings/domain/background-type-migration";

/**
 * Calculate relative luminance of a color using WCAG formula
 * https://www.w3.org/TR/WCAG20/#relativeluminancedef
 */
export function calculateLuminance(hex: string): number {
  // Remove # if present
  const color = hex.replace("#", "");

  // Parse RGB components
  const r = parseInt(color.substring(0, 2), 16) / 255;
  const g = parseInt(color.substring(2, 4), 16) / 255;
  const b = parseInt(color.substring(4, 6), 16) / 255;

  // Apply gamma correction
  const rLinear = r <= 0.03928 ? r / 12.92 : Math.pow((r + 0.055) / 1.055, 2.4);
  const gLinear = g <= 0.03928 ? g / 12.92 : Math.pow((g + 0.055) / 1.055, 2.4);
  const bLinear = b <= 0.03928 ? b / 12.92 : Math.pow((b + 0.055) / 1.055, 2.4);

  return 0.2126 * rLinear + 0.7152 * gLinear + 0.0722 * bLinear;
}

/**
 * Calculate average luminance for a gradient
 * For simplicity, we weight the first color more heavily (60%) since it's typically
 * the dominant color in diagonal gradients
 */
export function calculateGradientLuminance(colors: string[]): number {
  if (colors.length === 0) return 0;
  if (colors.length === 1 && colors[0]) return calculateLuminance(colors[0]);

  // Weight colors: first 50%, middle colors split 30%, last 20%
  const first = colors[0] ? calculateLuminance(colors[0]) * 0.5 : 0;
  const lastColor = colors[colors.length - 1];
  const last = lastColor ? calculateLuminance(lastColor) * 0.2 : 0;

  const middleColors = colors.slice(1, -1);
  const middle =
    middleColors.length > 0
      ? middleColors.reduce(
          (sum, color) => sum + calculateLuminance(color),
          0
        ) *
        (0.3 / middleColors.length)
      : 0;

  return first + middle + last;
}

/**
 * Determine theme mode based on luminance
 */
export type ThemeMode = "light" | "dark";

export function getThemeMode(luminance: number): ThemeMode {
  // Threshold at 0.4 - colors with luminance above this are considered "light"
  return luminance > 0.4 ? "light" : "dark";
}

/**
 * Generate CSS custom properties for glass morphism based on theme
 */
export interface GlassMorphismTheme {
  panelBg: string;
  panelBorder: string;
  panelHover: string;
  cardBg: string;
  cardBorder: string;
  cardHover: string;
  textPrimary: string;
  textSecondary: string;
  inputBg: string;
  inputBorder: string;
  inputFocus: string;
  buttonActive: string;
  backdropBlur: string;
}

/**
 * Generate theme-aware glass morphism styles
 */
export function generateGlassMorphismTheme(
  mode: ThemeMode,
  accentColor?: string
): GlassMorphismTheme {
  if (mode === "light") {
    // Light backgrounds need dark, semi-opaque overlays
    return {
      panelBg: "rgba(20, 10, 40, 0.85)",
      panelBorder: accentColor
        ? `rgba(${hexToRgb(accentColor)}, 0.3)`
        : "rgba(168, 85, 247, 0.3)",
      panelHover: "rgba(30, 15, 60, 0.9)",
      cardBg: "rgba(25, 15, 45, 0.88)",
      cardBorder: accentColor
        ? `rgba(${hexToRgb(accentColor)}, 0.35)`
        : "rgba(168, 85, 247, 0.35)",
      cardHover: "rgba(35, 20, 65, 0.92)",
      textPrimary: "#ffffff",
      textSecondary: "rgba(255, 255, 255, 0.85)",
      inputBg: "rgba(30, 20, 50, 0.75)",
      inputBorder: accentColor
        ? `rgba(${hexToRgb(accentColor)}, 0.4)`
        : "rgba(168, 85, 247, 0.4)",
      inputFocus: "rgba(40, 25, 70, 0.85)",
      buttonActive: "rgba(88, 28, 135, 0.75)",
      backdropBlur: "blur(20px)",
    };
  } else {
    // Dark backgrounds use standard light glass morphism
    return {
      panelBg: "rgba(255, 255, 255, 0.05)",
      panelBorder: "rgba(255, 255, 255, 0.1)",
      panelHover: "rgba(255, 255, 255, 0.08)",
      cardBg: "rgba(255, 255, 255, 0.05)",
      cardBorder: "rgba(255, 255, 255, 0.1)",
      cardHover: "rgba(255, 255, 255, 0.08)",
      textPrimary: "#ffffff",
      textSecondary: "rgba(255, 255, 255, 0.75)", // WCAG AAA compliant
      inputBg: "rgba(255, 255, 255, 0.05)",
      inputBorder: "rgba(255, 255, 255, 0.1)",
      inputFocus: "rgba(255, 255, 255, 0.08)",
      buttonActive: "rgba(255, 255, 255, 0.15)",
      backdropBlur: "blur(20px)",
    };
  }
}

/**
 * Matte (non-glass) theme tokens for 2026 bento style.
 */
export interface MatteTheme {
  panelBg: string;
  panelElevatedBg: string;
  cardBg: string;
  cardHoverBg: string;
  accent: string;
  accentStrong: string;
  stroke: string;
  strokeStrong: string;
  text: string;
  textDim: string;
  shadow: string;
  panelShadow: string;
}

/**
 * Danger zone theme tokens for destructive actions.
 * Adapts based on background luminance for visibility.
 */
export interface DangerTheme {
  bg: string;
  hoverBg: string;
  border: string;
  hoverBorder: string;
  shadow: string;
  hoverShadow: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// ACCENT CONTRAST FLOOR
//
// The accent is used BOTH as text (109+ `color: var(--theme-accent)` sites) and
// as a fill under white labels. A raw gradient-extracted accent guarantees
// neither: the old light-mode default #2563eb measured 3.34:1 against the
// #d0d0ca panel (fails even AA), and dark palettes like Blossom's #db2777
// measured ~3.7:1 against near-black panels.
//
// The floor adjusts ONLY the HSL lightness (hue + saturation preserved, so each
// background keeps its color identity) until the accent clears a per-mode
// contrast target against the worst-case theme surface:
//
// - Light mode: 7:1 (AAA) vs #c8c8c2 (cardHoverBg, the darkest light surface).
//   Darkening serves both roles — deep accent text passes AAA, and white labels
//   on the darkened accent pass comfortably too.
// - Dark mode: 4.5:1 (AA) vs the effective panel color (~black over a dark
//   scene). 7:1 is mathematically unreachable for a single token here: an
//   accent bright enough for 7:1 text on near-black leaves white-on-accent
//   fills below 3:1. 4.5:1 is the max-min compromise; text that needs AAA in
//   dark mode uses --theme-accent-text (below), which IS floored at 7:1.
//
// src/app.html carries an inline pre-hydration copy of this logic — keep in sync.
// ═══════════════════════════════════════════════════════════════════════════

/** Darkest light-mode surface (cardHoverBg) — the worst case for dark-on-light. */
const LIGHT_WORST_SURFACE = "#c8c8c2";
/** Approximate effective dark-mode panel: rgba(0,0,0,.75+) over a dark scene. */
const DARK_SURFACE_ANCHOR = "#16161f";
const LIGHT_ACCENT_TARGET = 7; // AAA
const DARK_ACCENT_TARGET = 4.5; // AA — see ceiling note above
const ACCENT_TEXT_TARGET = 7; // AAA, both modes (--theme-accent-text)

/** WCAG contrast ratio between two hex colors (1..21). */
export function contrastRatio(hexA: string, hexB: string): number {
  const a = calculateLuminance(hexA);
  const b = calculateLuminance(hexB);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const color = hex.replace("#", "");
  const r = parseInt(color.substring(0, 2), 16) / 255;
  const g = parseInt(color.substring(2, 4), 16) / 255;
  const b = parseInt(color.substring(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return { h, s, l };
}

function hslToHex(h: number, s: number, l: number): string {
  const hue2rgb = (p: number, q: number, t: number): number => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  let r: number, g: number, b: number;
  if (s === 0) {
    r = g = b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  const toHex = (v: number) =>
    Math.round(Math.max(0, Math.min(1, v)) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Walk the accent's HSL lightness (hue/saturation fixed) until it clears the
 * contrast target against the surface: darker in light mode, lighter in dark.
 * Always solvable — black hits ~12.6:1 on the light surface, white ~18:1 on the
 * dark anchor. Returns the minimal-change hex.
 */
export function ensureAccentContrast(
  accent: string,
  mode: ThemeMode,
  target: number = mode === "light" ? LIGHT_ACCENT_TARGET : DARK_ACCENT_TARGET
): string {
  const surface = mode === "light" ? LIGHT_WORST_SURFACE : DARK_SURFACE_ANCHOR;
  if (contrastRatio(accent, surface) >= target) return accent;
  const { h, s, l } = hexToHsl(accent);
  // Binary search the lightness bound that first meets the target. Contrast is
  // monotonic in lightness on each side of the surface's luminance.
  let lo = mode === "light" ? 0 : l;
  let hi = mode === "light" ? l : 1;
  let best = mode === "light" ? "#000000" : "#ffffff";
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    const candidate = hslToHex(h, s, mid);
    if (contrastRatio(candidate, surface) >= target) {
      best = candidate;
      // Meets target — try to stay closer to the original lightness.
      if (mode === "light") lo = mid;
      else hi = mid;
    } else {
      if (mode === "light") hi = mid;
      else lo = mid;
    }
  }
  return best;
}

function isValidHex(color?: string): color is string {
  return !!color && /^#[0-9a-fA-F]{6}$/.test(color);
}

function fallbackAccent(mode: ThemeMode, accentColor?: string): string {
  const base = isValidHex(accentColor)
    ? accentColor
    : mode === "light"
      ? "#2563eb"
      : "#38bdf8";
  return ensureAccentContrast(base, mode);
}

/**
 * Detect if viewport is mobile-sized
 */
function isMobile(): boolean {
  if (typeof window === "undefined") return false;
  return window.innerWidth < BREAKPOINTS.MOBILE;
}

export function generateMatteTheme(
  mode: ThemeMode,
  accentColor?: string
): MatteTheme {
  const accent = fallbackAccent(mode, accentColor);
  const mobile = isMobile();

  if (mode === "light") {
    // Softened light mode - no pure whites to reduce eye strain
    // Pure white (#fff) is reserved for print mode only
    return {
      panelBg: "#d0d0ca", // Warm medium gray
      panelElevatedBg: "#d8d8d2", // Slightly lighter for elevation
      cardBg: "#d8d8d2", // Matches pictograph background
      cardHoverBg: "#c8c8c2", // Darker on hover
      accent,
      accentStrong: accent,
      stroke: "rgba(15, 23, 42, 0.15)", // More visible strokes on darker bg
      strokeStrong: "rgba(15, 23, 42, 0.22)",
      text: "#0f172a",
      textDim: "rgba(15, 23, 42, 0.75)",
      shadow: "0 12px 28px rgba(15, 23, 42, 0.18)",
      panelShadow: "0 12px 28px rgba(15, 23, 42, 0.18)",
    };
  }

  // On mobile, increase opacity for better readability
  // Desktop: 0.75/0.5, Mobile: 0.88/0.7
  return {
    panelBg: mobile ? "rgba(0, 0, 0, 0.88)" : "rgba(0, 0, 0, 0.75)",
    panelElevatedBg: mobile ? "rgba(0, 0, 0, 0.7)" : "rgba(0, 0, 0, 0.5)",
    cardBg: mobile ? "rgba(0, 0, 0, 0.88)" : "rgba(0, 0, 0, 0.75)",
    cardHoverBg: mobile ? "rgba(0, 0, 0, 0.7)" : "rgba(0, 0, 0, 0.55)",
    accent,
    accentStrong: accent, // Use same accent for strong variant
    stroke: "rgba(255, 255, 255, 0.08)",
    strokeStrong: "rgba(255, 255, 255, 0.14)",
    text: "#ffffff",
    textDim: "rgba(255, 255, 255, 0.75)", // WCAG AAA: 7:1 contrast minimum
    shadow: "0 14px 36px rgba(0, 0, 0, 0.4)",
    panelShadow: "0 12px 28px rgba(0, 0, 0, 0.35)",
  };
}

/**
 * Generate danger zone theme based on background luminance.
 * Both modes use opaque dark surfaces - the difference is the base color tint.
 * Light mode: darker, more opaque for contrast against bright backgrounds
 * Dark mode: slightly less opaque, works well against dark solid backgrounds
 */
export function generateDangerTheme(mode: ThemeMode): DangerTheme {
  if (mode === "light") {
    // Light/colorful backgrounds (Aurora, etc.) - very opaque dark red surface
    return {
      bg: "linear-gradient(135deg, rgba(60, 12, 18, 0.95) 0%, rgba(75, 18, 25, 0.92) 100%)",
      hoverBg:
        "linear-gradient(135deg, rgba(75, 15, 22, 0.96) 0%, rgba(90, 22, 30, 0.94) 100%)",
      border: "rgba(239, 68, 68, 0.6)",
      hoverBorder: "rgba(239, 68, 68, 0.75)",
      shadow:
        "inset 0 1px 0 rgba(239, 68, 68, 0.2), 0 4px 20px rgba(0, 0, 0, 0.4)",
      hoverShadow:
        "inset 0 1px 0 rgba(239, 68, 68, 0.25), 0 8px 32px rgba(0, 0, 0, 0.5), 0 0 24px rgba(239, 68, 68, 0.25)",
    };
  }

  // Dark backgrounds - opaque dark red (matches other card opacity but red-tinted)
  return {
    bg: "linear-gradient(135deg, rgba(45, 10, 15, 0.92) 0%, rgba(55, 15, 20, 0.88) 100%)",
    hoverBg:
      "linear-gradient(135deg, rgba(55, 12, 18, 0.94) 0%, rgba(65, 18, 25, 0.9) 100%)",
    border: "rgba(239, 68, 68, 0.45)",
    hoverBorder: "rgba(239, 68, 68, 0.6)",
    shadow:
      "inset 0 1px 0 rgba(239, 68, 68, 0.15), 0 4px 16px rgba(0, 0, 0, 0.3)",
    hoverShadow:
      "inset 0 1px 0 rgba(239, 68, 68, 0.2), 0 8px 28px rgba(0, 0, 0, 0.4), 0 0 20px rgba(239, 68, 68, 0.18)",
  };
}

/**
 * Convert hex color to RGB string (for use in rgba())
 */
function hexToRgb(hex: string): string {
  const color = hex.replace("#", "");
  const r = parseInt(color.substring(0, 2), 16);
  const g = parseInt(color.substring(2, 4), 16);
  const b = parseInt(color.substring(4, 6), 16);
  return `${r}, ${g}, ${b}`;
}

/**
 * Get a suitable accent color from gradient colors
 * (typically the most vibrant middle or end color)
 */
export function extractAccentColor(colors: string[]): string | undefined {
  if (colors.length === 0) return undefined;
  if (colors.length === 1) return colors[0];

  // For 3-color gradients, use the middle color
  if (colors.length === 3) return colors[1];

  // For 2-color gradients, use the second color
  return colors[1];
}

// Store applied theme in HMR data for persistence across module reloads
interface HMRThemeData {
  backgroundType?: BackgroundType;
  solidColor?: string;
  gradientColors?: string[];
}

/**
 * Apply theme CSS variables to document root based on colors
 * Can be called with solid color OR gradient/theme colors
 */
export function applyThemeFromColors(
  solidColor?: string,
  gradientColors?: string[]
): void {
  if (typeof document === "undefined") return;

  // Store in HMR data for persistence across module reloads
  if (import.meta.hot) {
    import.meta.hot.data.appliedTheme = {
      solidColor,
      gradientColors,
    } as HMRThemeData;
  }

  // Calculate luminance
  const luminance = solidColor
    ? calculateLuminance(solidColor)
    : gradientColors
      ? calculateGradientLuminance(gradientColors)
      : 0;

  // Determine theme mode
  const mode = getThemeMode(luminance);

  // Update the reactive theme mode state
  setThemeMode(mode);

  // Extract accent color
  const accentColor = gradientColors
    ? extractAccentColor(gradientColors)
    : solidColor;

  // Generate themes
  const theme = generateGlassMorphismTheme(mode, accentColor);
  const matteTheme = generateMatteTheme(mode, accentColor);
  const dangerTheme = generateDangerTheme(mode);

  // Apply to document root
  const root = document.documentElement;

  // Set data attribute for CSS-based background luminance awareness
  // "bright" = luminous backgrounds (Aurora, etc.) - cards need deeper colors to pop
  // "dim" = darker backgrounds (Cosmic, etc.) - standard vibrant colors work well
  // NOTE: This is separate from "dark mode" (L key) which controls pictograph rendering
  const luminanceClass = mode === "light" ? "bright" : "dim";
  root.setAttribute("data-theme-luminance", luminanceClass);

  // ═══════════════════════════════════════════════════════════════════════════
  // LEGACY VARIABLES - Still used by 30+ components. DO NOT REMOVE.
  // Migration to --theme-* variables is ongoing.
  // ═══════════════════════════════════════════════════════════════════════════
  root.style.setProperty("--panel-bg-current", theme.panelBg);
  root.style.setProperty("--panel-border-current", theme.panelBorder);
  root.style.setProperty("--panel-hover-current", theme.panelHover);
  root.style.setProperty("--card-bg-current", theme.cardBg);
  root.style.setProperty("--card-border-current", theme.cardBorder);
  root.style.setProperty("--card-hover-current", theme.cardHover);
  root.style.setProperty("--text-primary-current", theme.textPrimary);
  root.style.setProperty("--text-secondary-current", theme.textSecondary);
  root.style.setProperty("--input-bg-current", theme.inputBg);
  root.style.setProperty("--input-border-current", theme.inputBorder);
  root.style.setProperty("--input-focus-current", theme.inputFocus);
  root.style.setProperty("--button-active-current", theme.buttonActive);
  root.style.setProperty("--glass-backdrop", theme.backdropBlur);

  // ═══════════════════════════════════════════════════════════════════════════
  // LAYER 2: Dynamic Theme Variables (--theme-*)
  // Adapt based on background luminance. Use these for new components.
  // ═══════════════════════════════════════════════════════════════════════════
  root.style.setProperty("--theme-panel-bg", matteTheme.panelBg);
  root.style.setProperty(
    "--theme-panel-elevated-bg",
    matteTheme.panelElevatedBg
  );
  root.style.setProperty("--theme-card-bg", matteTheme.cardBg);
  root.style.setProperty("--theme-card-hover-bg", matteTheme.cardHoverBg);
  root.style.setProperty("--theme-accent", matteTheme.accent);
  root.style.setProperty("--theme-accent-strong", matteTheme.accentStrong);
  root.style.setProperty("--theme-stroke", matteTheme.stroke);
  root.style.setProperty("--theme-stroke-strong", matteTheme.strokeStrong);
  root.style.setProperty("--theme-text", matteTheme.text);
  root.style.setProperty("--theme-text-dim", matteTheme.textDim);
  root.style.setProperty("--theme-shadow", matteTheme.shadow);
  root.style.setProperty("--theme-panel-shadow", matteTheme.panelShadow);

  // Additional convenience tokens (derived from base tokens)
  root.style.setProperty(
    "--theme-accent-bg",
    `color-mix(in srgb, ${matteTheme.accent} 15%, transparent)`
  );
  root.style.setProperty(
    "--theme-accent-glow",
    `color-mix(in srgb, ${matteTheme.accent} 40%, transparent)`
  );
  root.style.setProperty(
    "--theme-accent-hover",
    `color-mix(in srgb, ${matteTheme.accent} 80%, white)`
  );
  root.style.setProperty("--theme-accent-border", matteTheme.stroke);
  // AAA text variant: same as the accent in light mode (already floored at 7:1);
  // lifted further in dark mode, where the base accent stops at the 4.5:1
  // fill-compatible ceiling.
  root.style.setProperty(
    "--theme-accent-text",
    ensureAccentContrast(matteTheme.accent, mode, ACCENT_TEXT_TARGET)
  );
  root.style.setProperty("--theme-input-bg", matteTheme.cardBg);
  root.style.setProperty("--theme-hover-bg", matteTheme.cardHoverBg);
  root.style.setProperty(
    "--theme-text-tertiary",
    `color-mix(in srgb, ${matteTheme.textDim} 70%, transparent)`
  );
  root.style.setProperty("--theme-transition", "150ms ease-out");

  // Danger zone theme variables (for destructive actions)
  root.style.setProperty("--theme-danger-bg", dangerTheme.bg);
  root.style.setProperty("--theme-danger-hover-bg", dangerTheme.hoverBg);
  root.style.setProperty("--theme-danger-border", dangerTheme.border);
  root.style.setProperty(
    "--theme-danger-hover-border",
    dangerTheme.hoverBorder
  );
  root.style.setProperty("--theme-danger-shadow", dangerTheme.shadow);
  root.style.setProperty(
    "--theme-danger-hover-shadow",
    dangerTheme.hoverShadow
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // LAYER 3: Semantic Colors (--semantic-*, --prop-*)
  // Constant colors that do NOT change with background.
  // Use for status indicators, errors, successes, and domain-specific colors.
  // ═══════════════════════════════════════════════════════════════════════════
  root.style.setProperty("--semantic-error", "#ef4444");
  root.style.setProperty("--semantic-error-dim", "rgba(239, 68, 68, 0.15)");
  root.style.setProperty("--semantic-success", "#22c55e");
  root.style.setProperty("--semantic-success-dim", "rgba(34, 197, 94, 0.15)");
  root.style.setProperty("--semantic-warning", "#f59e0b");
  root.style.setProperty("--semantic-warning-dim", "rgba(245, 158, 11, 0.15)");
  root.style.setProperty("--semantic-warning-bg", "rgba(245, 158, 11, 0.1)");
  root.style.setProperty(
    "--semantic-warning-border",
    "rgba(245, 158, 11, 0.3)"
  );
  root.style.setProperty("--semantic-warning-text", "#fbbf24");
  root.style.setProperty("--semantic-warning-glow", "rgba(245, 158, 11, 0.4)");
  root.style.setProperty("--semantic-warning-text-vivid", "#fcd34d");
  root.style.setProperty("--semantic-info", "#3b82f6");
  root.style.setProperty("--semantic-info-dim", "rgba(59, 130, 246, 0.15)");
  root.style.setProperty("--semantic-info-bg", "rgba(59, 130, 246, 0.1)");
  root.style.setProperty("--semantic-info-border", "rgba(59, 130, 246, 0.3)");
  root.style.setProperty("--semantic-info-text", "#60a5fa");

  // Domain-specific prop colors (constant)
  root.style.setProperty("--prop-blue", "var(--user-left-color, #2e3192)");
  root.style.setProperty("--prop-blue-bg", "rgba(var(--user-left-rgb, 46, 49, 146), 0.15)");
  root.style.setProperty("--prop-blue-border", "rgba(var(--user-left-rgb, 46, 49, 146), 0.4)");
  root.style.setProperty("--prop-blue-text", "var(--user-left-color, #818cf8)");
  root.style.setProperty("--prop-red", "var(--user-right-color, #ed1c24)");
  root.style.setProperty("--prop-red-bg", "rgba(var(--user-right-rgb, 237, 28, 36), 0.15)");
  root.style.setProperty("--prop-red-border", "rgba(var(--user-right-rgb, 237, 28, 36), 0.4)");
  root.style.setProperty("--prop-red-text", "var(--user-right-color, #f87171)");

  // Feature accent colors (constant) - for branding different app areas
  root.style.setProperty("--feature-edit", "#8b5cf6"); // Purple - editing contexts
  root.style.setProperty("--feature-edit-dim", "rgba(139, 92, 246, 0.15)");
  root.style.setProperty("--feature-view", "#06b6d4"); // Teal - viewing/export contexts
  root.style.setProperty("--feature-view-dim", "rgba(6, 182, 212, 0.15)");
  root.style.setProperty("--feature-generate", "#f97316"); // Orange - generation contexts
  root.style.setProperty("--feature-generate-dim", "rgba(249, 115, 22, 0.15)");

  // Domain accent colors (constant) - for specialized visualization areas
  root.style.setProperty("--accent-teal", "#14b8a6"); // Axis-alternating, flipped transforms
  root.style.setProperty("--accent-pink", "#ec4899"); // Section palette
  root.style.setProperty("--accent-rotation", "#36c3ff"); // Rotation transform viz
  root.style.setProperty("--accent-swap", "#2ecc71"); // Swap transform viz
  root.style.setProperty("--accent-inversion", "#eb7d00"); // Inversion transform viz

  // ═══════════════════════════════════════════════════════════════════════════
  // SCROLLBAR THEME VARIABLES
  // Adapt based on background luminance for consistent scrollbar styling.
  // ═══════════════════════════════════════════════════════════════════════════
  root.style.setProperty(
    "--scrollbar-thumb",
    mode === "light" ? "rgba(15, 23, 42, 0.25)" : "rgba(255, 255, 255, 0.2)"
  );
  root.style.setProperty(
    "--scrollbar-thumb-hover",
    mode === "light" ? "rgba(15, 23, 42, 0.4)" : "rgba(255, 255, 255, 0.35)"
  );
  root.style.setProperty(
    "--scrollbar-track",
    mode === "light" ? "rgba(15, 23, 42, 0.05)" : "transparent"
  );
  root.style.setProperty(
    "--scrollbar-accent",
    `color-mix(in srgb, ${matteTheme.accent} 30%, transparent)`
  );
  root.style.setProperty(
    "--scrollbar-accent-hover",
    `color-mix(in srgb, ${matteTheme.accent} 50%, transparent)`
  );
}

/**
 * Apply theme based on BackgroundType
 * Convenience function that looks up theme colors and applies them
 */
export function applyThemeForBackground(backgroundType: BackgroundType): void {
  // Store in HMR data for persistence across module reloads
  if (import.meta.hot) {
    import.meta.hot.data.appliedTheme = { backgroundType } as HMRThemeData;
  }

  const themeColors = BACKGROUND_THEME_COLORS[backgroundType];
  if (themeColors) {
    applyThemeFromColors(undefined, themeColors);
  }
}

/**
 * The background this device has saved, or COSMIC when nothing is stored or the
 * stored value cannot be read.
 *
 * A standalone surface that mounts its own BackgroundHost needs the same value
 * `ensureThemeApplied` tunes the interface colors for, so both read it here
 * instead of parsing the settings blob twice.
 */
export function getSavedBackgroundType(): BackgroundType {
  if (typeof localStorage === "undefined") return BackgroundType.COSMIC;

  try {
    const stored = localStorage.getItem("tka-modern-web-settings");
    if (!stored) return BackgroundType.COSMIC;

    const settings = JSON.parse(stored);
    return (
      normalizeBackgroundType(settings.backgroundType) ?? BackgroundType.COSMIC
    );
  } catch (e) {
    console.warn("[Theme] Failed to read the saved background type:", e);
    return BackgroundType.COSMIC;
  }
}

/**
 * Ensure theme CSS variables are applied based on localStorage settings.
 * Call this when CSS variables may have been cleared (HMR, remount, etc.)
 * This ALWAYS applies - no "skip if same" optimization.
 *
 * Unlike applyThemeForBackground/applyThemeFromColors, this function:
 * 1. Reads directly from localStorage (not reactive state)
 * 2. Always applies, even if values appear unchanged
 * 3. Is safe to call from anywhere (checks for browser environment)
 */
export function ensureThemeApplied(): void {
  if (typeof localStorage === "undefined" || typeof document === "undefined")
    return;

  applyThemeForBackground(getSavedBackgroundType());
}

// ═══════════════════════════════════════════════════════════════════════════
// HMR RECOVERY: Restore theme from import.meta.hot.data on module reload
// This runs when this module is re-evaluated during HMR
// ═══════════════════════════════════════════════════════════════════════════
if (import.meta.hot?.data?.appliedTheme) {
  const theme = import.meta.hot.data.appliedTheme as HMRThemeData;
  // Use setTimeout to avoid blocking module evaluation
  setTimeout(() => {
    if (theme.backgroundType) {
      applyThemeForBackground(theme.backgroundType);
    } else if (theme.solidColor || theme.gradientColors) {
      applyThemeFromColors(theme.solidColor, theme.gradientColors);
    }
  }, 0);
}
