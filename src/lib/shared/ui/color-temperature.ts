// The preset matrix split into cool and warm hues, and the random pair the
// prop color editor rolls: a cool color for the left hand and a warm one for
// the right, drawn from anywhere in those hue ranges at any lightness and
// saturation the theme can show, not only from the swatches.
import {
  DARK_SURFACE_ANCHOR,
  contrastRatio,
} from "$lib/shared/settings/utils/background-theme-calculator";
import {
  COLOR_PRESETS,
  COLOR_PRESET_COLUMNS,
  type ColorPreset,
} from "./color-presets";
import {
  hexToOklch,
  maxChroma,
  oklabDistance,
  oklchToHex,
  type Oklch,
} from "./oklch";

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

// What the dice may use on each theme, as OKLCH hue arcs and the band the
// pair's shared lightness lands in. Cool runs green (145) through violet
// (295). Warm runs from magenta (325) round through red, written past 360 so
// it stays one range: on a dark page to golden yellow (100), short of the
// swatches' lime-leaning yellow, which turns olive when softened; on a white
// page only to orange (65), since any yellow dark enough to read there is
// brown. Lightness runs pale to mid on dark and mid to deep on light, and the
// contrast floor has the last word.
export const DICE_RANGES = {
  dark: {
    cool: { from: 145, to: 295 },
    warm: { from: 325, to: 460 },
    lightness: { min: 0.66, max: 0.86 },
  },
  light: {
    cool: { from: 145, to: 295 },
    warm: { from: 325, to: 425 },
    lightness: { min: 0.5, max: 0.66 },
  },
} as const;

// WCAG's floor for graphics, so a roll never hands the performer a prop that
// vanishes into the page.
const MIN_PROP_CONTRAST = 3;
// Pictograph cells stay white in light mode.
const LIGHT_SURFACE = "#ffffff";
// Each hand may sit this far above or below the pair's shared lightness.
const LIGHTNESS_SPREAD = 0.04;
// A pair shares one saturation, as a fraction of the most chroma each hue can
// show at its lightness: 1 is vivid, the floor is soft. Below about half,
// colors turn muddy.
const MIN_SATURATION = 0.5;
// A quarter turn keeps neighbours such as green and yellow, which barely read
// as cool against warm, out of one pair.
const MIN_HUE_GAP = 90;
// Each hand moves at least this far in Oklab, so a press never looks like it
// did nothing.
const MIN_CHANGE = 0.1;
const MAX_DRAWS = 24;

export interface CoolWarmPair {
  left: string;
  right: string;
}

function between(min: number, max: number, unit: number): number {
  return min + unit * (max - min);
}

/** Steps lightness away from the surface until the color clears the floor. */
function readableHex(
  lightness: number,
  saturation: number,
  hue: number,
  darkMode: boolean
): string {
  const surface = darkMode ? DARK_SURFACE_ANCHOR : LIGHT_SURFACE;
  const step = darkMode ? 0.01 : -0.01;
  for (let l = lightness; ; l += step) {
    const hex = oklchToHex(l, maxChroma(l, hue) * saturation, hue);
    if (contrastRatio(hex, surface) >= MIN_PROP_CONTRAST || l <= 0 || l >= 1)
      return hex;
  }
}

function drawPair(darkMode: boolean, random: () => number): CoolWarmPair {
  const {
    cool,
    warm,
    lightness: band,
  } = darkMode ? DICE_RANGES.dark : DICE_RANGES.light;
  const lightness = between(band.min, band.max, random());
  // The square root leans toward vivid: about one roll in four is soft.
  const saturation = between(MIN_SATURATION, 1, Math.sqrt(random()));
  const coolHue = between(cool.from, cool.to, random());
  // The part of the warm arc at least a quarter turn from the cool hue either
  // way round; it is never empty, because the arcs face each other.
  const warmHue =
    between(
      Math.max(warm.from, coolHue + MIN_HUE_GAP),
      Math.min(warm.to, coolHue + 360 - MIN_HUE_GAP),
      random()
    ) % 360;
  const handLightness = () =>
    lightness + between(-LIGHTNESS_SPREAD, LIGHTNESS_SPREAD, random());
  return {
    left: readableHex(handLightness(), saturation, coolHue, darkMode),
    right: readableHex(handLightness(), saturation, warmHue, darkMode),
  };
}

/**
 * A random readable pair, cool on the left and warm on the right, in which
 * both hands visibly change.
 */
export function randomCoolWarmPair(
  current: CoolWarmPair | null | undefined,
  darkMode: boolean,
  random: () => number = Math.random
): CoolWarmPair {
  const was: { left: Oklch; right: Oklch } | null = current
    ? { left: hexToOklch(current.left), right: hexToOklch(current.right) }
    : null;
  const changed = (pair: CoolWarmPair) =>
    !was ||
    (oklabDistance(hexToOklch(pair.left), was.left) >= MIN_CHANGE &&
      oklabDistance(hexToOklch(pair.right), was.right) >= MIN_CHANGE);
  let pair = drawPair(darkMode, random);
  for (let draw = 1; draw < MAX_DRAWS && !changed(pair); draw += 1)
    pair = drawPair(darkMode, random);
  return pair;
}
