import { describe, expect, it } from "vitest";
import { fitScale, fitScaleFromSeedAsync } from "./fit-scale";

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

describe("fitScaleFromSeedAsync", () => {
  const probe = (areaWidth: number, log: number[]) => async (s: number) => {
    log.push(s);
    return content(areaWidth)(s);
  };

  it("lands a nearby seed in a few probes, full to within 3%", async () => {
    const log: number[] = [];
    const r = await fitScaleFromSeedAsync(
      probe(4000, log),
      900,
      () => false,
      2.6
    );
    expect(r?.fits).toBe(true);
    expect(300 + 200 * r!.scale).toBeLessThanOrEqual(900.5);
    expect(300 + 200 * r!.scale).toBeGreaterThanOrEqual(900 * 0.97);
    expect(log.length).toBeLessThanOrEqual(3);
  });

  it("comes down from a seed that overflows", async () => {
    const log: number[] = [];
    const r = await fitScaleFromSeedAsync(
      probe(4000, log),
      900,
      () => false,
      3.8
    );
    expect(300 + 200 * r!.scale).toBeLessThanOrEqual(900.5);
    expect(300 + 200 * r!.scale).toBeGreaterThanOrEqual(900 * 0.97);
    expect(log.length).toBeLessThanOrEqual(4);
  });

  it("stops at the width when the height has room", async () => {
    const r = await fitScaleFromSeedAsync(probe(800, []), 2000, () => false, 1);
    expect(r?.fits).toBe(true);
    expect(r!.scale).toBeLessThanOrEqual(2);
    expect(r!.scale).toBeGreaterThan(1.9);
  });

  it("reports a screen that cannot fit, at the floor", async () => {
    const r = await fitScaleFromSeedAsync(
      probe(4000, []),
      200,
      () => false,
      1.2
    );
    expect(r).toEqual({ scale: 0.45, fits: false });
  });

  it("gives way to a newer fit", async () => {
    let calls = 0;
    const r = await fitScaleFromSeedAsync(
      probe(4000, []),
      900,
      () => ++calls > 2,
      1
    );
    expect(r).toBeNull();
  });
});
