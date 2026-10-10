import { describe, expect, it } from "vitest";

import { getOceanQualityConfig } from "#lib/shared/3d/environments/scenes/ocean/quality/ocean-quality.js";

describe("ocean quality budgets", () => {
  it("removes the authored reef and continuous runtime systems at LOW", () => {
    const low = getOceanQualityConfig("low");

    expect(low.enableAuthoredFlora).toBe(false);
    expect(low.enableWaterSurface).toBe(false);
    expect(low.enableAtmosphere).toBe(false);
    expect(low.enableFauna).toBe(false);
    expect(low.enableImageBasedLighting).toBe(false);
    expect(low.enableCaustics).toBe(false);
    expect(low.enableAbsorption).toBe(false);
    expect(low.maxFishCount).toBe(0);
    expect(low.particleCount).toBe(0);
  });

  it("keeps the authored reef behind the ULTRA budget", () => {
    const medium = getOceanQualityConfig("medium");
    const ultra = getOceanQualityConfig("ultra");

    expect(medium.enableAuthoredFlora).toBe(false);
    expect(ultra.enableAuthoredFlora).toBe(true);

    for (const quality of [medium, ultra]) {
      expect(quality.enableWaterSurface).toBe(true);
      expect(quality.enableAtmosphere).toBe(true);
      expect(quality.enableFauna).toBe(true);
    }
  });
});
