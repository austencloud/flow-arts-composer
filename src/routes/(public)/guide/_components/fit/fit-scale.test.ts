import { describe, expect, it } from "vitest";
import { fitScale } from "./fit-scale";

// Content 300px of text plus figures that are 200px tall at scale 1.
const content = (areaWidth: number) => (s: number) => ({
  height: 300 + 200 * s,
  overflowsWidth: 400 * s > areaWidth,
});

describe("fitScale", () => {
  it("grows figures until the screen is full", () => {
    const r = fitScale(content(4000), 900);
    expect(r.fits).toBe(true);
    expect(r.scale).toBeGreaterThan(2.95);
    expect(r.scale).toBeLessThanOrEqual(3.01);
  });

  it("stops at the width when the height has room", () => {
    const r = fitScale(content(800), 2000);
    expect(r.scale).toBeGreaterThan(1.95);
    expect(r.scale).toBeLessThanOrEqual(2);
  });

  it("takes the ceiling when everything fits", () => {
    expect(fitScale(content(9000), 9000)).toEqual({ scale: 4, fits: true });
  });

  it("reports a screen that cannot fit, at the floor", () => {
    expect(fitScale(content(4000), 200)).toEqual({ scale: 0.45, fits: false });
  });
});
