import {
  ensureAccentContrast,
  type ThemeMode,
} from "#lib/shared/settings/utils/background-theme-calculator.js";

/** Normal-text contrast (WCAG AA) against the darkest light-theme surface. */
export const EFFECT_INK_LIGHT_CONTRAST = 4.5;

/**
 * The color an effect's name, icon and selection ring are drawn in.
 *
 * Effect colors are chosen to glow on the dark theme's panels. On the light
 * theme's panels none of them reads: Bubbles (#c8e0ff) measures 1.25:1 and
 * even Goo, the darkest, only 2.4:1. In light mode each color keeps its hue
 * and saturation and darkens until it clears normal-text contrast. That is
 * gentler than the theme accent's 7:1, which turns most of these colors
 * near-black; at 4.5:1 Fire is still orange and Trails still blue. Dark mode
 * keeps the color as it is.
 */
export function effectInk(color: string, mode: ThemeMode): string {
  return mode === "light"
    ? ensureAccentContrast(color, "light", EFFECT_INK_LIGHT_CONTRAST)
    : color;
}
