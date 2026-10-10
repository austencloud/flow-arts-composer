// The preset matrix split into cool and warm hues, and the random pair the
// prop color editor rolls: a cool color for the left hand and a warm one for
// the right. Half the rolls offer a hand-picked pair; the rest build one from
// anywhere in those hue ranges, each color near its most vivid lightness. Now
// and then one hand of a built pair is white, black or a grey instead. The two
// hands always stay apart for red- and green-blind eyes too.
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
  gamutCusp,
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

// Hand-picked pairs, approved from a sample sheet on 2026-10-10, as [left,
// right]. Each has its own shades per theme. The gold, yellow and pastel pairs
// turn brown or grey when deepened enough to read on a white page, so they
// come up on the dark theme only.
export const APPROVED_PAIRS: readonly {
  dark: readonly [string, string];
  light?: readonly [string, string];
}[] = [
  // Blue + red
  { dark: ["#3575e2", "#ed1c24"], light: ["#3575e2", "#ed1c24"] },
  // Teal + coral
  { dark: ["#14b8a6", "#ff6f61"], light: ["#06a796", "#f46558"] },
  // Purple + gold
  { dark: ["#8b5cf6", "#f5b301"] },
  // Cyan + magenta
  { dark: ["#06b6d4", "#e8338f"] },
  // Sky + tangerine
  { dark: ["#38bdf8", "#fb8c2c"] },
  // Indigo + sunflower
  { dark: ["#6366f1", "#facc15"] },
  // Turquoise + crimson
  { dark: ["#2dd4bf", "#dc2626"], light: ["#0aa796", "#dc2626"] },
  // Teal + gold
  { dark: ["#14b8a6", "#eab308"] },
  // Lavender + peach
  { dark: ["#a78bfa", "#fdba74"] },
  // Ocean + fire
  { dark: ["#0ea5e9", "#f2541b"], light: ["#099bdc", "#f2541b"] },
  // Periwinkle + rose
  { dark: ["#818cf8", "#f43f5e"], light: ["#7e89f5", "#f43f5e"] },
  // Mint + raspberry
  { dark: ["#34d399", "#db2777"] },
  // Aqua + scarlet
  { dark: ["#22d3ee", "#e11d48"], light: ["#02a3b9", "#e11d48"] },
  // Violet + tangerine
  { dark: ["#8b5cf6", "#fb923c"] },
  // Denim + salmon
  { dark: ["#5b8bd0", "#fa8072"], light: ["#5b8bd0", "#e87063"] },
  // Spruce + apricot
  { dark: ["#2a9d8f", "#fbae7c"] },
  // Electric + flame
  { dark: ["#4d7cf0", "#ff5a1f"], light: ["#4d7cf0", "#ff5a1f"] },
  // Ice + ember
  { dark: ["#bae6fd", "#ea580c"] },
  // Seafoam + persimmon
  { dark: ["#5eead4", "#ec5b2f"], light: ["#0ea795", "#ec5b2f"] },
  // Orchid + coral
  { dark: ["#a855f7", "#ff7f50"] },
  // Cerulean + pink
  { dark: ["#1e90ff", "#ff69b4"], light: ["#1e90ff", "#f15ca7"] },
  // Jade + magenta
  { dark: ["#10b981", "#d946ef"], light: ["#04a874", "#d946ef"] },
];
const APPROVED_CHANCE = 0.5;

// What a built pair may use on each theme: OKLCH hue arcs and the lightness
// each hand may take. Cool runs green (145) through violet (295). Warm runs
// from magenta (325) round through red, written past 360 so it stays one
// range: on a dark page to golden yellow (100), short of the swatches'
// lime-leaning yellow, which turns olive when softened; on a white page only
// to orange (65), since any yellow dark enough to read there is brown.
// Lightness runs mid to pale on dark and deep to mid on light, and the
// contrast floor has the last word.
export const DICE_RANGES = {
  dark: {
    cool: { from: 145, to: 295 },
    warm: { from: 325, to: 460 },
    lightness: { min: 0.56, max: 0.9 },
  },
  light: {
    cool: { from: 145, to: 295 },
    warm: { from: 325, to: 425 },
    lightness: { min: 0.36, max: 0.66 },
  },
} as const;

// WCAG's floor for graphics, so a roll never hands the performer a prop that
// vanishes into the page.
const MIN_PROP_CONTRAST = 3;
// Pictograph cells stay white in light mode.
const LIGHT_SURFACE = "#ffffff";
// Each hand lands within this much of its hue's most vivid lightness, so blue
// can be deep and cyan bright in one pair.
const CUSP_DRIFT = 0.06;
// Each hand's saturation, as a fraction of the most chroma its hue can show at
// its lightness: 1 is vivid. Below about 0.7 colors start to look soft.
const MIN_SATURATION = 0.7;
// About one built pair in six trades a hand's color for a neutral swatch that
// reads on the page: white or a light grey on dark, black or a dark grey on
// light.
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

function clamp(value: number, range: { min: number; max: number }): number {
  return Math.min(range.max, Math.max(range.min, value));
}

function readableNeutrals(surface: string): readonly string[] {
  return COLOR_PRESETS.filter(
    (preset) =>
      preset.row === "neutral" &&
      contrastRatio(preset.hex, surface) >= MIN_PROP_CONTRAST
  ).map((preset) => preset.hex);
}

// The cusp search walks the gamut, so each whole-degree hue is looked up once.
const cuspLightness = new Map<number, number>();

function vividLightness(hue: number): number {
  const degree = Math.round(hue) % 360;
  let lightness = cuspLightness.get(degree);
  if (lightness === undefined) {
    lightness = gamutCusp(degree).l;
    cuspLightness.set(degree, lightness);
  }
  return lightness;
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
    lightness: range,
  } = darkMode ? DICE_RANGES.dark : DICE_RANGES.light;
  // Each hand draws its own; the square root leans toward vivid.
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
  const hand = (hue: number): Hand => ({
    lightness: clamp(
      vividLightness(hue) + between(-CUSP_DRIFT, CUSP_DRIFT, random()),
      range
    ),
    saturation: saturation(),
    hue,
  });
  const left = hand(coolHue);
  const right = hand(warmHue);
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

  // Hues that fold together for colorblind eyes step apart in lightness the
  // way the hands already lean, except that orange through gold always rises.
  const leftRises =
    left.lightness >= right.lightness &&
    (warmHue < DARKENS_TO_MUD.from || warmHue > DARKENS_TO_MUD.to);
  const [rising, sinking] = leftRises ? [left, right] : [right, left];
  let pair = { left: hex(left), right: hex(right) };
  for (
    let push = SPLIT_STEP / 2;
    push <= range.max - range.min && !apart(pair);
    push += SPLIT_STEP / 2
  ) {
    const up = hex(rising, Math.min(rising.lightness + push, range.max));
    const down = hex(sinking, Math.max(sinking.lightness - push, range.min));
    pair = leftRises ? { left: up, right: down } : { left: down, right: up };
  }
  return pair;
}

function approvedPairs(darkMode: boolean): CoolWarmPair[] {
  return APPROVED_PAIRS.flatMap(({ dark, light }) => {
    const shades = darkMode ? dark : light;
    return shades ? [{ left: shades[0], right: shades[1] }] : [];
  });
}

/**
 * A random readable pair, cool on the left and warm on the right, that
 * colorblind eyes can tell apart and in which both hands visibly change. Half
 * the time it is one of the hand-picked pairs.
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
  if (random() < APPROVED_CHANCE) {
    const choices = approvedPairs(darkMode).filter(fits);
    const choice = choices[Math.floor(random() * choices.length)];
    if (choice) return choice;
  }
  let pair = drawPair(darkMode, random);
  for (let draw = 1; draw < MAX_DRAWS && !fits(pair); draw += 1)
    pair = drawPair(darkMode, random);
  return pair;
}
