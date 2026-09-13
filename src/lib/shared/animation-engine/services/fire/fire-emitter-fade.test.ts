import { describe, expect, it } from "vitest";
import {
  decayResidualHeat,
  estimateResidualFadeSeconds,
  FIRE_RESIDUAL_PEAK_HEAT,
  FIRE_RESIDUAL_VISIBILITY_FLOOR,
} from "./fire-emitter-fade";
import { DEFAULT_PHYSICS } from "../../domain/types/fire-types";

/** What the solver actually advects temperature with on the default profile. */
const CINEMATIC_TEMPERATURE_DISSIPATION = Math.max(
  DEFAULT_PHYSICS.temperatureDissipation,
  0.972
);

/** One 60fps frame is one ≤17ms solver sub-step. */
const SUB_STEPS_PER_SECOND = 60;

describe("fire residual-heat fade", () => {
  it("decays toward the floor instead of cutting off at once", () => {
    const afterOneFrame = decayResidualHeat(
      FIRE_RESIDUAL_PEAK_HEAT,
      CINEMATIC_TEMPERATURE_DISSIPATION,
      1
    );

    expect(afterOneFrame).toBeLessThan(FIRE_RESIDUAL_PEAK_HEAT);
    expect(afterOneFrame).toBeGreaterThan(FIRE_RESIDUAL_PEAK_HEAT * 0.9);
  });

  it("reports zero only once nothing visible is left", () => {
    let heat = FIRE_RESIDUAL_PEAK_HEAT;
    let lastNonZero = heat;
    while (heat > 0) {
      lastNonZero = heat;
      heat = decayResidualHeat(heat, CINEMATIC_TEMPERATURE_DISSIPATION, 1);
    }

    // The last frame that still claimed heat was already at the edge of what an
    // 8-bit canvas can show, so the hard clear that follows it is invisible.
    expect(lastNonZero).toBeLessThan(FIRE_RESIDUAL_VISIBILITY_FLOOR * 40);
    expect(heat).toBe(0);
  });

  it("fades over seconds, not frames, at the default physics", () => {
    const seconds = estimateResidualFadeSeconds(
      CINEMATIC_TEMPERATURE_DISSIPATION,
      SUB_STEPS_PER_SECOND
    );

    // Long enough that a live plume is never cut off mid-flame, short enough
    // that a swapped-out emitter never keeps the solver running indefinitely.
    expect(seconds).toBeGreaterThan(1);
    expect(seconds).toBeLessThan(8);
  });

  it("spends heat faster when a frame runs several sub-steps", () => {
    const oneStep = decayResidualHeat(
      FIRE_RESIDUAL_PEAK_HEAT,
      CINEMATIC_TEMPERATURE_DISSIPATION,
      1
    );
    const fourSteps = decayResidualHeat(
      FIRE_RESIDUAL_PEAK_HEAT,
      CINEMATIC_TEMPERATURE_DISSIPATION,
      4
    );

    expect(fourSteps).toBeLessThan(oneStep);
    expect(fourSteps).toBeCloseTo(
      FIRE_RESIDUAL_PEAK_HEAT * CINEMATIC_TEMPERATURE_DISSIPATION ** 4,
      10
    );
  });

  it("still terminates when configured dissipation never fades", () => {
    // A physics preset may set dissipation to 1.0 (heat is never advected
    // away). The estimate must not believe that, or the fade would run forever.
    const seconds = estimateResidualFadeSeconds(1, SUB_STEPS_PER_SECOND);

    expect(Number.isFinite(seconds)).toBe(true);
    expect(seconds).toBeLessThan(60);
  });

  it("treats an already-settled field as settled", () => {
    expect(decayResidualHeat(0, CINEMATIC_TEMPERATURE_DISSIPATION, 1)).toBe(0);
    expect(
      decayResidualHeat(Number.NaN, CINEMATIC_TEMPERATURE_DISSIPATION, 1)
    ).toBe(0);
  });
});
