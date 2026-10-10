import { describe, expect, it } from "vitest";
import {
  APPROVED_PAIRS,
  DICE_RANGES,
  randomCoolWarmPair,
  type CoolWarmPair,
} from "./color-temperature";
import { COLOR_PRESETS } from "./color-presets";
import { colorVisionDistance } from "./color-vision";
import { hexToOklch, maxChroma, oklabDistance } from "./oklch";
import {
  DARK_SURFACE_ANCHOR,
  contrastRatio,
} from "$lib/shared/settings/utils/background-theme-calculator";

/** Mulberry32, so a failure replays the same rolls. */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), state | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DEFAULT_PAIR = { left: "#2e3192", right: "#ed1c24" };
const ROLLS = 400;
const NEUTRALS = new Set(
  COLOR_PRESETS.filter((preset) => preset.row === "neutral").map(
    (preset) => preset.hex
  )
);
const isNeutral = (hex: string) => NEUTRALS.has(hex);
const pairKey = ({ left, right }: CoolWarmPair) => `${left}|${right}`;

/** The hand-picked pairs shown on one theme. */
function approvedFor(darkMode: boolean): CoolWarmPair[] {
  return APPROVED_PAIRS.flatMap(({ dark, light }) => {
    const shades = darkMode ? dark : light;
    return shades ? [{ left: shades[0], right: shades[1] }] : [];
  });
}

/** Presses the dice again and again, each roll starting from the last. */
function rollChain(darkMode: boolean, seed = 7) {
  const random = seeded(seed);
  const chain: { before: CoolWarmPair; after: CoolWarmPair }[] = [];
  let current = DEFAULT_PAIR;
  for (let roll = 0; roll < ROLLS; roll += 1) {
    const next = randomCoolWarmPair(current, darkMode, random);
    chain.push({ before: current, after: next });
    current = next;
  }
  return chain;
}

// Rounding to whole channel values turns a soft color's hue a few degrees.
const HUE_TOLERANCE = 6;

function inArc(hue: number, arc: { from: number; to: number }): boolean {
  const unwrapped = hue < arc.from - HUE_TOLERANCE ? hue + 360 : hue;
  return (
    unwrapped >= arc.from - HUE_TOLERANCE && unwrapped <= arc.to + HUE_TOLERANCE
  );
}

function hueGap(a: number, b: number): number {
  const gap = Math.abs(a - b) % 360;
  return Math.min(gap, 360 - gap);
}

/** How much of its hue's possible chroma a color uses, 0 to 1. */
function saturationOf(hex: string): number {
  const { l, c, h } = hexToOklch(hex);
  return c / maxChroma(l, h);
}

describe.each([
  ["dark", true, DARK_SURFACE_ANCHOR],
  ["light", false, "#ffffff"],
] as const)("the hand-picked pairs on a %s theme", (_, darkMode, surface) => {
  const pairs = approvedFor(darkMode);

  it("stand out from the page and stay apart for colorblind eyes", () => {
    expect(pairs.length).toBeGreaterThanOrEqual(10);
    for (const { left, right } of pairs) {
      expect(contrastRatio(left, surface)).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(right, surface)).toBeGreaterThanOrEqual(3);
      expect(colorVisionDistance(left, right)).toBeGreaterThanOrEqual(0.1);
      const gap = hueGap(hexToOklch(left).h, hexToOklch(right).h);
      expect(gap).toBeGreaterThanOrEqual(90);
    }
  });

  it("are written in lower case, so a pick matches the swatch it came from", () => {
    for (const { left, right } of pairs) {
      expect(left).toMatch(/^#[0-9a-f]{6}$/);
      expect(right).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});

describe.each([
  ["dark", true, DARK_SURFACE_ANCHOR, DICE_RANGES.dark],
  ["light", false, "#ffffff", DICE_RANGES.light],
] as const)("the dice on a %s theme", (_, darkMode, surface, ranges) => {
  const chain = rollChain(darkMode);
  const approved = new Set(approvedFor(darkMode).map(pairKey));
  const picked = chain.filter(({ after }) => approved.has(pairKey(after)));
  const built = chain.filter(({ after }) => !approved.has(pairKey(after)));
  const colors = chain.flatMap(({ after }) => [after.left, after.right]);
  const colored = chain.filter(
    ({ after }) => !isNeutral(after.left) && !isNeutral(after.right)
  );
  const builtColored = built.filter(
    ({ after }) => !isNeutral(after.left) && !isNeutral(after.right)
  );
  const builtTints = builtColored.flatMap(({ after }) => [
    after.left,
    after.right,
  ]);

  it("offers a hand-picked pair about half the time, spread across the list", () => {
    expect(picked.length).toBeGreaterThan(ROLLS * 0.35);
    expect(picked.length).toBeLessThan(ROLLS * 0.6);
    // Over 4,000 rolls every pair comes up; 400 may miss one or two.
    const seen = new Set(picked.map(({ after }) => pairKey(after)));
    expect(seen.size).toBeGreaterThanOrEqual(approved.size - 2);
  });

  it("never offers a dark-only pair on a white page", () => {
    if (darkMode) return;
    const darkOnly = new Set(
      APPROVED_PAIRS.filter((pair) => !pair.light).map(({ dark }) =>
        pairKey({ left: dark[0], right: dark[1] })
      )
    );
    for (const { after } of chain)
      expect(darkOnly.has(pairKey(after))).toBe(false);
  });

  it("builds a cool color for the left and a warm one for the right", () => {
    for (const { after } of built) {
      if (!isNeutral(after.left))
        expect(inArc(hexToOklch(after.left).h, ranges.cool)).toBe(true);
      if (!isNeutral(after.right))
        expect(inArc(hexToOklch(after.right).h, ranges.warm)).toBe(true);
    }
  });

  it("only rolls colors that stand out from the page", () => {
    for (const hex of colors) {
      expect(contrastRatio(hex, surface)).toBeGreaterThanOrEqual(3);
    }
  });

  it("keeps the two hues at least a quarter turn apart", () => {
    for (const { after } of colored) {
      const gap = hueGap(hexToOklch(after.left).h, hexToOklch(after.right).h);
      expect(gap).toBeGreaterThanOrEqual(90 - HUE_TOLERANCE);
    }
  });

  it("keeps the two hands apart for red- and green-blind eyes", () => {
    for (const { after } of chain) {
      expect(
        colorVisionDistance(after.left, after.right)
      ).toBeGreaterThanOrEqual(0.1);
    }
  });

  it("still builds teal with pink, one hand lighter than the other", () => {
    const tealPink = builtColored.filter(({ after }) => {
      const [left, right] = [hexToOklch(after.left), hexToOklch(after.right)];
      return (
        left.h >= 160 && left.h <= 220 && (right.h >= 325 || right.h <= 10)
      );
    });
    expect(tealPink.length).toBeGreaterThan(ROLLS * 0.01);
    const split = tealPink.filter(
      ({ after }) =>
        Math.abs(hexToOklch(after.left).l - hexToOklch(after.right).l) > 0.08
    );
    expect(split.length).toBeGreaterThan(tealPink.length / 2);
  });

  it("visibly changes both hands on every roll", () => {
    for (const { before, after } of chain) {
      const moved = (from: string, to: string) =>
        oklabDistance(hexToOklch(from), hexToOklch(to));
      expect(moved(before.left, after.left)).toBeGreaterThanOrEqual(0.1);
      expect(moved(before.right, after.right)).toBeGreaterThanOrEqual(0.1);
    }
  });

  it("sometimes trades one hand, never both, for white, black or a grey", () => {
    const neutralRolls = chain.filter(
      ({ after }) => isNeutral(after.left) || isNeutral(after.right)
    );
    expect(neutralRolls.length).toBeGreaterThan(ROLLS * 0.03);
    expect(neutralRolls.length).toBeLessThan(ROLLS * 0.16);
    for (const { after } of neutralRolls) {
      expect(isNeutral(after.left) && isNeutral(after.right)).toBe(false);
    }
    expect(neutralRolls.some(({ after }) => isNeutral(after.left))).toBe(true);
    expect(neutralRolls.some(({ after }) => isNeutral(after.right))).toBe(true);
  });

  it("builds bold colors, each hand with its own saturation", () => {
    // Rounding to whole channel values nudges saturation a little either way.
    for (const hex of builtTints)
      expect(saturationOf(hex)).toBeGreaterThanOrEqual(0.66);
    const mismatched = builtColored.filter(
      ({ after }) =>
        Math.abs(saturationOf(after.left) - saturationOf(after.right)) > 0.15
    );
    expect(mismatched.length).toBeGreaterThan(builtColored.length * 0.1);
  });

  it("builds deep blues and violets, pale to deep, round each arc", () => {
    expect(new Set(builtTints).size).toBeGreaterThan(builtTints.length * 0.9);
    const lightnesses = builtTints.map((hex) => hexToOklch(hex).l);
    expect(Math.max(...lightnesses) - Math.min(...lightnesses)).toBeGreaterThan(
      0.2
    );
    const deepBlues = builtTints.filter((hex) => {
      const { l, c, h } = hexToOklch(hex);
      return h >= 250 && h <= 300 && c > 0.15 && l < (darkMode ? 0.66 : 0.5);
    });
    expect(deepBlues.length).toBeGreaterThan(builtColored.length * 0.05);
    // Every 30-degree stretch of both arcs comes up.
    for (const [arc, hand] of [
      [ranges.cool, "left"],
      [ranges.warm, "right"],
    ] as const) {
      const hues = builtColored.map(({ after }) => {
        const hue = hexToOklch(after[hand]).h;
        return hue < arc.from - HUE_TOLERANCE ? hue + 360 : hue;
      });
      for (let start = arc.from; start < arc.to; start += 30) {
        expect(hues.some((hue) => hue >= start && hue < start + 30)).toBe(true);
      }
    }
  });

  it("reads the current colors in either letter case", () => {
    const shouted = {
      left: DEFAULT_PAIR.left.toUpperCase(),
      right: DEFAULT_PAIR.right.toUpperCase(),
    };
    expect(randomCoolWarmPair(shouted, darkMode, seeded(3))).toEqual(
      randomCoolWarmPair(DEFAULT_PAIR, darkMode, seeded(3))
    );
  });

  it("rolls a pair when no colors are set yet", () => {
    const pair = randomCoolWarmPair(null, darkMode, seeded(11));
    expect(contrastRatio(pair.left, surface)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(pair.right, surface)).toBeGreaterThanOrEqual(3);
  });
});
