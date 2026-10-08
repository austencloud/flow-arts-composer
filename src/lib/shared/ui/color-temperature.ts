// The preset matrix split into cool and warm hues, and the random pair the
// prop color editor rolls from them: a cool color for the left hand and a
// warm one for the right.
import {
  DARK_SURFACE_ANCHOR,
  contrastRatio,
} from "$lib/shared/settings/utils/background-theme-calculator";
import {
  COLOR_PRESETS,
  COLOR_PRESET_COLUMNS,
  type ColorPreset,
} from "./color-presets";

// Hue columns of the matrix in the order the editor lists them: blue, sky,
// cyan, teal, green, violet, then magenta, pink, red, orange, gold, yellow.
const COOL_HUE_COLUMNS = [8, 7, 6, 5, 4, 9];
const WARM_HUE_COLUMNS = [10, 11, 0, 1, 2, 3];
const HUE_ROWS = ["light", "vivid", "deep"] as const;

function huePresets(columns: readonly number[]): readonly ColorPreset[] {
  return HUE_ROWS.flatMap((_, row) =>
    columns.map((hue) => COLOR_PRESETS[row * COLOR_PRESET_COLUMNS + hue]!)
  );
}

export const COOL_PRESETS = huePresets(COOL_HUE_COLUMNS);
export const WARM_PRESETS = huePresets(WARM_HUE_COLUMNS);

// WCAG's floor for graphics. On a dark theme it drops the deep row and vivid
// blue; on a light one it drops the light row and the brightest vivid hues, so a
// roll never hands the performer a prop that vanishes into the page.
const MIN_PROP_CONTRAST = 3;
// Pictograph cells stay white in light mode.
const LIGHT_SURFACE = "#ffffff";

export interface CoolWarmPair {
  left: string;
  right: string;
}

/**
 * Every cool-left, warm-right pair that reads on the theme. Both colors come
 * from one row, so a pair is light with light or deep with deep and the two
 * hands carry the same weight.
 */
export function coolWarmPairs(darkMode: boolean): CoolWarmPair[] {
  const surface = darkMode ? DARK_SURFACE_ANCHOR : LIGHT_SURFACE;
  const readable = (preset: ColorPreset) =>
    contrastRatio(preset.hex, surface) >= MIN_PROP_CONTRAST;
  return HUE_ROWS.flatMap((row) => {
    const cools = COOL_PRESETS.filter((p) => p.row === row && readable(p));
    const warms = WARM_PRESETS.filter((p) => p.row === row && readable(p));
    return cools.flatMap((cool) =>
      warms.map((warm) => ({ left: cool.hex, right: warm.hex }))
    );
  });
}

/**
 * A random readable pair in which both hands change, so every press visibly
 * rolls the dice.
 */
export function randomCoolWarmPair(
  current: CoolWarmPair | null | undefined,
  darkMode: boolean,
  random: () => number = Math.random
): CoolWarmPair {
  const pairs = coolWarmPairs(darkMode);
  const left = current?.left.toLowerCase();
  const right = current?.right.toLowerCase();
  const fresh = pairs.filter(
    (pair) => pair.left !== left && pair.right !== right
  );
  const pool = fresh.length > 0 ? fresh : pairs;
  return pool[Math.floor(random() * pool.length)]!;
}
