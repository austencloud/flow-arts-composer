import { describe, expect, it } from "vitest";
import {
  COOL_PRESETS,
  WARM_PRESETS,
  coolWarmPairs,
  randomCoolWarmPair,
} from "./color-temperature";
import {
  DARK_SURFACE_ANCHOR,
  contrastRatio,
} from "$lib/shared/settings/utils/background-theme-calculator";

const rowOf = (hex: string) =>
  [...COOL_PRESETS, ...WARM_PRESETS].find((preset) => preset.hex === hex)?.row;

/** Every value a random source can hand back, at the pool's resolution. */
function draws(count: number) {
  return Array.from({ length: count }, (_, index) => () => index / count);
}

describe.each([
  ["dark", true, DARK_SURFACE_ANCHOR],
  ["light", false, "#ffffff"],
])("cool-warm pairs on a %s theme", (_, darkMode, surface) => {
  const pairs = coolWarmPairs(darkMode);

  it("puts a cool color on the left and a warm one on the right", () => {
    const cool = new Set(COOL_PRESETS.map((preset) => preset.hex));
    const warm = new Set(WARM_PRESETS.map((preset) => preset.hex));
    expect(pairs.length).toBeGreaterThan(20);
    for (const pair of pairs) {
      expect(cool.has(pair.left)).toBe(true);
      expect(warm.has(pair.right)).toBe(true);
    }
  });

  it("only offers colors that stand out from the page", () => {
    for (const pair of pairs) {
      expect(contrastRatio(pair.left, surface)).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(pair.right, surface)).toBeGreaterThanOrEqual(3);
    }
  });

  it("matches the two hands from one row", () => {
    for (const pair of pairs) {
      expect(rowOf(pair.left)).toBe(rowOf(pair.right));
    }
  });

  it("changes both hands on every roll", () => {
    const current = pairs[0]!;
    for (const random of draws(pairs.length)) {
      const next = randomCoolWarmPair(current, darkMode, random);
      expect(next.left).not.toBe(current.left);
      expect(next.right).not.toBe(current.right);
    }
  });

  it("ignores letter case in the current colors", () => {
    const current = pairs[0]!;
    const shouted = {
      left: current.left.toUpperCase(),
      right: current.right.toUpperCase(),
    };
    for (const random of draws(pairs.length)) {
      const next = randomCoolWarmPair(shouted, darkMode, random);
      expect(next.left).not.toBe(current.left);
      expect(next.right).not.toBe(current.right);
    }
  });

  it("reaches every pair it could roll", () => {
    const current = { left: "#2e3192", right: "#ed1c24" };
    const seen = new Set(
      draws(pairs.length).map((random) => {
        const pair = randomCoolWarmPair(current, darkMode, random);
        return `${pair.left}|${pair.right}`;
      })
    );
    expect(seen.size).toBe(pairs.length);
  });
});
