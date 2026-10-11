import { describe, expect, it } from "vitest";
import {
  TILE_H,
  TILE_W,
  blob,
  css,
  cssToRgb,
  ground,
  hexToRgb,
  lcg,
  mix,
  mulberry32,
  withAlpha,
} from "./tile-paint";
import { makeTileCanvas } from "./tile-test-utils";

describe("tile-paint kit", () => {
  it("has the tile size every portrait is drawn at", () => {
    expect([TILE_W, TILE_H]).toEqual([720, 270]);
  });

  it("seeded generators repeat for the same seed and differ across seeds", () => {
    const a = lcg(42);
    const b = lcg(42);
    const c = lcg(43);
    const first = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(first);
    expect([c(), c(), c()]).not.toEqual(first);
    const m1 = mulberry32(7);
    const m2 = mulberry32(7);
    expect([m1(), m1()]).toEqual([m2(), m2()]);
    for (let i = 0; i < 100; i += 1) {
      const v = a();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("converts colors the way the Fire and Bloom tiles did", () => {
    expect(hexToRgb("#ff8000")).toEqual([1, 128 / 255, 0]);
    expect(hexToRgb("#f80")).toEqual([1, 136 / 255, 0]);
    expect(css([1, 0.5, 0], 0.5)).toBe("rgba(255, 128, 0, 0.5)");
    expect(mix([0, 0, 0], [1, 1, 1], 0.25)).toEqual([0.25, 0.25, 0.25]);
    expect(withAlpha("#ff8000", 0.5)).toBe("rgba(255, 128, 0, 0.5)");
    expect(withAlpha("hsl(350, 85%, 62%)", 0.3)).toBe(
      "hsla(350, 85%, 62%, 0.3)"
    );
    const [r, g, b] = cssToRgb("hsl(120, 100%, 50%)");
    expect(r).toBeCloseTo(0, 5);
    expect(g).toBeCloseTo(1, 5);
    expect(b).toBeCloseTo(0, 5);
  });

  it("paints ground and a blob onto a real canvas", () => {
    const ctx = makeTileCanvas();
    ground(ctx, [0.04, 0.03, 0.05]);
    blob(ctx, 360, 135, 200, 100, [1, 0.5, 0.2], 0.8);
    const center = ctx.getImageData(360, 135, 1, 1).data;
    const corner = ctx.getImageData(2, 2, 1, 1).data;
    expect(center[0]!).toBeGreaterThan(corner[0]! + 40);
  });
});
