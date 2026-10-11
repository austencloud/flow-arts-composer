import { describe, it, expect } from "vitest";
import {
  petalsPerStep,
  concaveRadiusProfile,
  BASE_DIP_RADIUS,
} from "#lib/shared/3d/services/petal-path.js";

describe("petalsPerStep", () => {
  it("maps turns to petal count (1 turn = 180° extra)", () => {
    expect(petalsPerStep(0)).toBe(1); // 4 petals per 4-step cycle
    expect(petalsPerStep(0.5)).toBe(1.5); // 6 per cycle
    expect(petalsPerStep(1)).toBe(2); // 8 per cycle
    expect(petalsPerStep(2)).toBe(3);
  });
});

describe("concaveRadiusProfile", () => {
  it("returns grid radius (1.0) at every petal boundary", () => {
    expect(concaveRadiusProfile(0, 1, 0)).toBeCloseTo(1, 6);
    expect(concaveRadiusProfile(0.5, 1, 0)).toBeCloseTo(1, 6);
    expect(concaveRadiusProfile(1, 1, 0)).toBeCloseTo(1, 6);
  });

  it("k=0 dips to the legacy reflection radius at petal midpoints", () => {
    expect(concaveRadiusProfile(0.5, 0, 0)).toBeCloseTo(BASE_DIP_RADIUS, 6);
    expect(concaveRadiusProfile(0.25, 1, 0)).toBeCloseTo(BASE_DIP_RADIUS, 6);
    expect(concaveRadiusProfile(0.75, 1, 0)).toBeCloseTo(BASE_DIP_RADIUS, 6);
  });

  it("k=1 dips to the center (radius 0) at petal midpoints", () => {
    expect(concaveRadiusProfile(0.5, 0, 1)).toBeCloseTo(0, 6);
    expect(concaveRadiusProfile(0.25, 1, 1)).toBeCloseTo(0, 6);
  });

  it("depth interpolates linearly between legacy and center", () => {
    const half = concaveRadiusProfile(0.5, 0, 0.5);
    expect(half).toBeCloseTo(BASE_DIP_RADIUS / 2, 6);
  });

  it("is monotonically deeper in k at any fixed progress", () => {
    for (const p of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      expect(concaveRadiusProfile(p, 1, 0.8)).toBeLessThanOrEqual(
        concaveRadiusProfile(p, 1, 0.2) + 1e-9
      );
    }
  });
});
