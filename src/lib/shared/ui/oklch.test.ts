import { describe, expect, it } from "vitest";
import { COLOR_PRESETS } from "./color-presets";
import { hexToOklch, oklabDistance, oklchToHex } from "./oklch";

describe("oklch", () => {
  it("reads every swatch back to the same hex", () => {
    for (const { hex } of COLOR_PRESETS) {
      const { l, c, h } = hexToOklch(hex);
      expect(oklchToHex(l, c, h)).toBe(hex);
    }
  });

  it("puts white and black at the ends of lightness with no chroma", () => {
    expect(hexToOklch("#ffffff").l).toBeCloseTo(1, 3);
    expect(hexToOklch("#ffffff").c).toBeLessThan(1e-4);
    expect(hexToOklch("#000000").l).toBeCloseTo(0, 6);
  });

  it("measures no distance between a color and itself", () => {
    const red = hexToOklch("#ed1c24");
    expect(oklabDistance(red, red)).toBe(0);
    expect(oklabDistance(red, hexToOklch("#2e3192"))).toBeGreaterThan(0.3);
  });
});
