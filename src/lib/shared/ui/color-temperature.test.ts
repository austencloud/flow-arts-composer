import { describe, expect, it } from "vitest";
import {
  DICE_RANGES,
  randomCoolWarmPair,
  type CoolWarmPair,
} from "./color-temperature";
import { hexToOklch, oklabDistance } from "./oklch";
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

describe.each([
  ["dark", true, DARK_SURFACE_ANCHOR, DICE_RANGES.dark],
  ["light", false, "#ffffff", DICE_RANGES.light],
] as const)("the dice on a %s theme", (_, darkMode, surface, ranges) => {
  const chain = rollChain(darkMode);
  const colors = chain.flatMap(({ after }) => [after.left, after.right]);

  it("puts a cool color on the left and a warm one on the right", () => {
    for (const { after } of chain) {
      expect(inArc(hexToOklch(after.left).h, ranges.cool)).toBe(true);
      expect(inArc(hexToOklch(after.right).h, ranges.warm)).toBe(true);
    }
  });

  it("only rolls colors that stand out from the page", () => {
    for (const hex of colors) {
      expect(contrastRatio(hex, surface)).toBeGreaterThanOrEqual(3);
    }
  });

  it("keeps the two hues at least a quarter turn apart", () => {
    for (const { after } of chain) {
      const gap = hueGap(hexToOklch(after.left).h, hexToOklch(after.right).h);
      expect(gap).toBeGreaterThanOrEqual(90 - HUE_TOLERANCE);
    }
  });

  it("visibly changes both hands on every roll", () => {
    for (const { before, after } of chain) {
      const moved = (from: string, to: string) =>
        oklabDistance(hexToOklch(from), hexToOklch(to));
      expect(moved(before.left, after.left)).toBeGreaterThanOrEqual(0.1);
      expect(moved(before.right, after.right)).toBeGreaterThanOrEqual(0.1);
    }
  });

  it("ranges from soft to vivid, pale to deep, and round each arc", () => {
    const shades = colors.map(hexToOklch);
    const chromas = shades.map((shade) => shade.c);
    const lightnesses = shades.map((shade) => shade.l);
    expect(new Set(colors).size).toBeGreaterThan(colors.length * 0.9);
    expect(Math.min(...chromas)).toBeLessThan(0.07);
    expect(Math.max(...chromas)).toBeGreaterThan(0.17);
    expect(Math.max(...lightnesses) - Math.min(...lightnesses)).toBeGreaterThan(
      0.2
    );
    // Every 30-degree stretch of both arcs comes up.
    for (const [arc, hand] of [
      [ranges.cool, "left"],
      [ranges.warm, "right"],
    ] as const) {
      const hues = chain.map(({ after }) => {
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
    expect(inArc(hexToOklch(pair.left).h, ranges.cool)).toBe(true);
    expect(inArc(hexToOklch(pair.right).h, ranges.warm)).toBe(true);
  });
});
