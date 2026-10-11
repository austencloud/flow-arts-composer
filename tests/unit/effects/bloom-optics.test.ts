import { describe, expect, it } from "vitest";
import {
  resolveBloomHistoryLifetime,
  resolveBloomRainbowHue,
  resolveBloomSourceNormalization,
} from "#lib/shared/effects/domain/bloom-optics.js";

describe("Bloom light path timing", () => {
  it("turns the history off at zero afterglow", () => {
    expect(resolveBloomHistoryLifetime(0)).toBe(0);
  });

  it("lengthens with afterglow and clears within about a second", () => {
    const short = resolveBloomHistoryLifetime(0.1);
    const long = resolveBloomHistoryLifetime(1);
    expect(short).toBeGreaterThan(0);
    expect(long).toBeGreaterThan(short);
    expect(long).toBeLessThanOrEqual(1.05);
  });
});

describe("Bloom shared optics", () => {
  it("normalizes energy by prop count", () => {
    expect(resolveBloomSourceNormalization(0)).toBe(1);
    expect(resolveBloomSourceNormalization(4)).toBe(0.5);
  });

  it("starts each tip of a pair on a different rainbow hue", () => {
    const hues = [0, 1, 2, 3].map((tip) => resolveBloomRainbowHue(0, tip));
    expect(new Set(hues).size).toBe(4);
    for (const hue of hues) {
      expect(hue).toBeGreaterThanOrEqual(0);
      expect(hue).toBeLessThan(1);
    }
  });
});
