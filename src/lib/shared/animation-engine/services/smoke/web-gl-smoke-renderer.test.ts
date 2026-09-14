import { describe, expect, it } from "vitest";
import {
  computeSmokeDensityDissipation,
  computeSmokeSimulationResolution,
  computeSmokeEmitterMetrics,
  hexToLinearRgb,
} from "./web-gl-smoke-renderer";

describe("fluid smoke quality", () => {
  it("maps existing pool tiers to bounded simulation grids", () => {
    expect(computeSmokeSimulationResolution(512)).toBe(96);
    expect(computeSmokeSimulationResolution(1024)).toBe(160);
    expect(computeSmokeSimulationResolution(2048)).toBe(224);
  });

  it("lets long-lived palettes retain density longer", () => {
    expect(computeSmokeDensityDissipation(6)).toBeGreaterThan(
      computeSmokeDensityDissipation(2)
    );
  });

  it("converts palette colors into linear-light shader values", () => {
    expect(hexToLinearRgb("#fff")).toEqual([1, 1, 1]);
    expect(hexToLinearRgb("#000")).toEqual([0, 0, 0]);
    expect(hexToLinearRgb("#808080")[0]).toBeCloseTo(0.216, 2);
  });

  // The disassemble view renders the hero at twice the width of the solo
  // panes. Emission is authored in reference-canvas pixels, so the resolved
  // grid-space metrics must be identical for both sizes or the solo panes
  // get a puff twice the radius (4x the mass) relative to their props.
  it("resolves identical grid-space emission for panes of different sizes", () => {
    const params = {
      baseRadius: 18,
      intensity: 0.7,
      resolvedRiseSpeed: 280,
      motionReferenceSpeed: 3,
    };
    const hero = computeSmokeEmitterMetrics(params, 800, 800, 160);
    const solo = computeSmokeEmitterMetrics(params, 400, 400, 160);
    expect(solo.splatRadius).toBeCloseTo(hero.splatRadius, 6);
    expect(solo.riseGridVelocity).toBeCloseTo(hero.riseGridVelocity, 6);
    // Tip speed is measured in pane pixels, so the saturation threshold must
    // shrink with the pane for the motion term to match.
    expect(solo.motionReferenceSpeedPx).toBeCloseTo(
      hero.motionReferenceSpeedPx / 2,
      6
    );
  });
});
