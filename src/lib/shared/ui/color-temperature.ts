// The preset matrix split into cool and warm hues, and the random pair the
// prop color editor rolls: a cool color for the left hand and a warm one for
// the right, drawn from anywhere in those hue ranges at any lightness and
// saturation the theme can show, not only from the swatches. Now and then one
// hand is white, black or a grey instead. The two hands always stay apart for
// red- and green-blind eyes too.
import {
  DARK_SURFACE_ANCHOR,
  contrastRatio,
} from "$lib/shared/settings/utils/background-theme-calculator";
import {
  COLOR_PRESETS,
  COLOR_PRESET_COLUMNS,
  type ColorPreset,
} from "./color-presets";
import { colorVisionDistance } from "./color-vision";
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
// contrast floor has the last word. A pair whose hues fold together for
// colorblind eyes pulls its hands apart in lightness, as far as the reach.
export const DICE_RANGES = {
  dark: {
    cool: { from: 145, to: 295 },
    warm: { from: 325, to: 460 },
    lightness: { min: 0.66, max: 0.86 },
    reach: { min: 0.56, max: 0.9 },
  },
  light: {
    cool: { from: 145, to: 295 },
    warm: { from: 325, to: 425 },
    lightness: { min: 0.5, max: 0.66 },
    reach: { min: 0.36, max: 0.66 },
  },
} as const;

// WCAG's floor for graphics, so a roll never hands the performer a prop that
// vanishes into the page.
const MIN_PROP_CONTRAST = 3;
// Pictograph cells stay white in light mode.
const LIGHT_SURFACE = "#ffffff";
// Each hand may sit this far above or below the pair's shared lightness.
const LIGHTNESS_SPREAD = 0.04;
// Each hand's saturation, as a fraction of the most chroma its hue can show at
// its lightness: 1 is vivid, the floor is soft. Below about half, colors turn
// muddy.
const MIN_SATURATION = 0.5;
// About one roll in six trades a hand's color for a neutral swatch that reads
// on the page: white or a light grey on dark, black or a dark grey on light.
const NEUTRAL_CHANCE = 1 / 6;
const READABLE_NEUTRALS = {
  dark: readableNeutrals(DARK_SURFACE_ANCHOR),
  light: readableNeutrals(LIGHT_SURFACE),
};
// The two hands stay at least this far apart in Oklab for typical, red-blind
// and green-blind eyes, so the props never read as one color. Teal against
// pink at one lightness, say, is two matching greys to green-blind eyes.
const MIN_PAIR_DISTANCE = 0.1;
// A pair that falls short moves its hands apart in lightness by these steps.
const SPLIT_STEP = 0.02;
// Orange through gold turns brown or olive as it darkens, so a warm hand in
// this stretch takes the lighter side of a split.
const DARKENS_TO_MUD = { from: 40, to: 120 };
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

interface Hand {
  lightness: number;
  saturation: number;
  hue: number;
}

function between(min: number, max: number, unit: number): number {
  return min + unit * (max - min);
}

function readableNeutrals(surface: string): readonly string[] {
  return COLOR_PRESETS.filter(
    (preset) =>
      preset.row === "neutral" &&
      contrastRatio(preset.hex, surface) >= MIN_PROP_CONTRAST
  ).map((preset) => preset.hex);
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

function apart(pair: CoolWarmPair): boolean {
  return colorVisionDistance(pair.left, pair.right) >= MIN_PAIR_DISTANCE;
}

function drawPair(darkMode: boolean, random: () => number): CoolWarmPair {
  const {
    cool,
    warm,
    lightness: band,
    reach,
  } = darkMode ? DICE_RANGES.dark : DICE_RANGES.light;
  const lightness = between(band.min, band.max, random());
  // Each hand draws its own; the square root leans toward vivid, so about one
  // hand in four is soft.
  const saturation = () => between(MIN_SATURATION, 1, Math.sqrt(random()));
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
  const left: Hand = {
    lightness: handLightness(),
    saturation: saturation(),
    hue: coolHue,
  };
  const right: Hand = {
    lightness: handLightness(),
    saturation: saturation(),
    hue: warmHue,
  };
  const hex = (hand: Hand, l = hand.lightness) =>
    readableHex(l, hand.saturation, hand.hue, darkMode);

  if (random() < NEUTRAL_CHANCE) {
    const neutralLeft = random() < 0.5;
    const kept = hex(neutralLeft ? right : left);
    const neutrals = (
      darkMode ? READABLE_NEUTRALS.dark : READABLE_NEUTRALS.light
    ).filter((neutral) => apart({ left: neutral, right: kept }));
    const neutral = neutrals[Math.floor(random() * neutrals.length)];
    if (neutral)
      return neutralLeft
        ? { left: neutral, right: kept }
        : { left: kept, right: neutral };
  }

  const leftLighter =
    random() < 0.5 &&
    (warmHue < DARKENS_TO_MUD.from || warmHue > DARKENS_TO_MUD.to);
  const middle = (left.lightness + right.lightness) / 2;
  let pair = { left: hex(left), right: hex(right) };
  for (
    let split = SPLIT_STEP;
    split <= reach.max - reach.min && !apart(pair);
    split += SPLIT_STEP
  ) {
    // Centred on the pair, slid back inside the reach.
    const low = Math.min(
      Math.max(middle - split / 2, reach.min),
      reach.max - split
    );
    const high = low + split;
    pair = {
      left: hex(left, leftLighter ? high : low),
      right: hex(right, leftLighter ? low : high),
    };
  }
  return pair;
}

/**
 * A random readable pair, cool on the left and warm on the right, that
 * colorblind eyes can tell apart and in which both hands visibly change.
 * Sometimes one hand is a neutral instead.
 */
export function randomCoolWarmPair(
  current: CoolWarmPair | null | undefined,
  darkMode: boolean,
  random: () => number = Math.random
): CoolWarmPair {
  const was: { left: Oklch; right: Oklch } | null = current
    ? { left: hexToOklch(current.left), right: hexToOklch(current.right) }
    : null;
  const fits = (pair: CoolWarmPair) =>
    apart(pair) &&
    (!was ||
      (oklabDistance(hexToOklch(pair.left), was.left) >= MIN_CHANGE &&
        oklabDistance(hexToOklch(pair.right), was.right) >= MIN_CHANGE));
  let pair = drawPair(darkMode, random);
  for (let draw = 1; draw < MAX_DRAWS && !fits(pair); draw += 1)
    pair = drawPair(darkMode, random);
  return pair;
}
