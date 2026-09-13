import { describe, expect, it } from "vitest";
import {
  computeResidualHeatFloor,
  countResidualFadeFrames,
  decayResidualHeat,
  FIRE_DISPLAY_HEAT_GATE,
  FIRE_RESIDUAL_PEAK_HEAT,
} from "./fire-emitter-fade";
import { DEFAULT_PHYSICS } from "../../domain/types/fire-types";
import {
  computeFireEmissionMultiplier,
  computeFireSubStepping,
} from "./web-gl-fire-renderer";

/** What the solver actually advects temperature with on the default profile. */
const CINEMATIC_TEMPERATURE_DISSIPATION = Math.max(
  DEFAULT_PHYSICS.temperatureDissipation,
  0.972
);

/** Display intensity at the default brightness of 0.5. */
const DEFAULT_DISPLAY_INTENSITY = computeFireEmissionMultiplier(0.5);
const DEFAULT_FLOOR = computeResidualHeatFloor(DEFAULT_DISPLAY_INTENSITY);

/**
 * Independent reference for what the temperature field actually does, written
 * from the solver's documented law rather than from the estimate's code:
 * `advect` passes its dissipation through `computeFluidStepDissipation`, which
 * raises the configured base to `dt / (1/60)` — so one sub-step of `subDt`
 * seconds multiplies the field by `base ** (60 * subDt)`, and a frame applies
 * that once per sub-step.
 *
 * This is the fake simulation the fade estimate has to stay honest against. A
 * per-call fixed decay (`base ** subSteps`) matches it only at exactly 60Hz,
 * which is why these cases are here.
 */
function advanceReferenceField(
  heat: number,
  base: number,
  subDtSeconds: number,
  subSteps: number
): number {
  return heat * base ** (60 * subDtSeconds * subSteps);
}

/** Cadences the mounted renderer really sees. */
const CADENCES = [
  { label: "60Hz", fps: 60, reducedMotion: false },
  { label: "120Hz", fps: 120, reducedMotion: false },
  { label: "144Hz", fps: 144, reducedMotion: false },
  { label: "30Hz", fps: 30, reducedMotion: false },
  { label: "reduced motion 60Hz", fps: 60, reducedMotion: true },
  { label: "reduced motion 120Hz", fps: 120, reducedMotion: true },
] as const;

/** Run a fade to settle, tracking the reference field alongside the estimate. */
function runFade(fps: number, reducedMotion: boolean) {
  const { subDtSeconds, subSteps } = computeFireSubStepping(
    1 / fps,
    reducedMotion
  );
  let estimate = FIRE_RESIDUAL_PEAK_HEAT;
  let field = FIRE_RESIDUAL_PEAK_HEAT;
  let frames = 0;
  let fieldWhenEstimateSettled = field;

  while (estimate > 0 && frames < 200_000) {
    estimate = decayResidualHeat(
      estimate,
      CINEMATIC_TEMPERATURE_DISSIPATION,
      subDtSeconds,
      subSteps,
      DEFAULT_FLOOR
    );
    field = advanceReferenceField(
      field,
      CINEMATIC_TEMPERATURE_DISSIPATION,
      subDtSeconds,
      subSteps
    );
    frames++;
    fieldWhenEstimateSettled = field;
  }

  return {
    subDtSeconds,
    subSteps,
    frames,
    seconds: frames / fps,
    fieldWhenEstimateSettled,
  };
}

describe("fire residual-heat fade", () => {
  it.each(CADENCES)(
    "does not clear a still-visible plume at $label",
    ({ fps, reducedMotion }) => {
      const { fieldWhenEstimateSettled, frames } = runFade(fps, reducedMotion);

      // The regression: the estimate used to assume one full unit of decay per
      // sub-step, so at 120Hz it settled with the real field at 0.63 and under
      // reduced motion at 1.91 — 6x and 19x the gate, i.e. a plume still
      // plainly burning when clearSimulation() wiped it.
      expect(fieldWhenEstimateSettled).toBeLessThanOrEqual(
        FIRE_DISPLAY_HEAT_GATE / DEFAULT_DISPLAY_INTENSITY
      );
      expect(frames).toBeGreaterThan(0);
      expect(frames).toBeLessThan(200_000);
    }
  );

  it.each(CADENCES)(
    "holds the estimate above the floor while the field is visible at $label",
    ({ fps, reducedMotion }) => {
      const { subDtSeconds, subSteps } = computeFireSubStepping(
        1 / fps,
        reducedMotion
      );
      const visibleFloor = FIRE_DISPLAY_HEAT_GATE / DEFAULT_DISPLAY_INTENSITY;

      let estimate = FIRE_RESIDUAL_PEAK_HEAT;
      let field = FIRE_RESIDUAL_PEAK_HEAT;

      // Step frame by frame while the real field is still paintable; the
      // estimate must never reach zero first.
      for (let frame = 0; frame < 200_000 && field > visibleFloor; frame++) {
        estimate = decayResidualHeat(
          estimate,
          CINEMATIC_TEMPERATURE_DISSIPATION,
          subDtSeconds,
          subSteps,
          DEFAULT_FLOOR
        );
        field = advanceReferenceField(
          field,
          CINEMATIC_TEMPERATURE_DISSIPATION,
          subDtSeconds,
          subSteps
        );
        if (field > visibleFloor) {
          expect(estimate).toBeGreaterThan(0);
        }
      }
    }
  );

  it("takes the same wall-clock fade at 60Hz and 120Hz", () => {
    const at60 = runFade(60, false);
    const at120 = runFade(120, false);

    // Twice the frames, same seconds: the fade follows simulated time, not
    // frame count. Before the fix both settled at frame 130, so 120Hz cut the
    // fade in half.
    expect(at120.frames).toBeGreaterThan(at60.frames * 1.8);
    expect(at120.seconds).toBeCloseTo(at60.seconds, 1);
  });

  it("fades over seconds, not frames, at the default 60Hz physics", () => {
    const { seconds } = runFade(60, false);

    // Long enough that a live plume is never cut off mid-flame, short enough
    // that a swapped-out emitter never keeps the solver running indefinitely.
    expect(seconds).toBeGreaterThan(1);
    expect(seconds).toBeLessThan(4);
  });

  it("fades roughly five times slower under reduced motion", () => {
    const normal = runFade(60, false);
    const reduced = runFade(60, true);

    // Reduced motion runs the sim at 0.2x, so the field genuinely cools five
    // times more slowly. The estimate follows the field rather than the clock.
    expect(reduced.seconds / normal.seconds).toBeGreaterThan(4);
    expect(reduced.seconds / normal.seconds).toBeLessThan(6);
  });

  it("reports zero only once the display pass has gone dark", () => {
    const { subDtSeconds, subSteps } = computeFireSubStepping(1 / 60, false);
    let heat = FIRE_RESIDUAL_PEAK_HEAT;
    let lastNonZero = heat;
    while (heat > 0) {
      lastNonZero = heat;
      heat = decayResidualHeat(
        heat,
        CINEMATIC_TEMPERATURE_DISSIPATION,
        subDtSeconds,
        subSteps,
        DEFAULT_FLOOR
      );
    }

    expect(lastNonZero * DEFAULT_DISPLAY_INTENSITY).toBeLessThan(
      FIRE_DISPLAY_HEAT_GATE * 1.1
    );
    expect(heat).toBe(0);
  });

  it("holds a brighter plume alive longer than a dim one", () => {
    const { subDtSeconds, subSteps } = computeFireSubStepping(1 / 60, false);
    const bright = countResidualFadeFrames(
      CINEMATIC_TEMPERATURE_DISSIPATION,
      subDtSeconds,
      subSteps,
      computeResidualHeatFloor(computeFireEmissionMultiplier(1))
    );
    const dim = countResidualFadeFrames(
      CINEMATIC_TEMPERATURE_DISSIPATION,
      subDtSeconds,
      subSteps,
      computeResidualHeatFloor(computeFireEmissionMultiplier(0))
    );

    expect(bright).toBeGreaterThan(dim);
  });

  it("spends heat faster when one frame runs several sub-steps", () => {
    const { subDtSeconds } = computeFireSubStepping(1 / 60, false);
    const oneStep = decayResidualHeat(
      FIRE_RESIDUAL_PEAK_HEAT,
      CINEMATIC_TEMPERATURE_DISSIPATION,
      subDtSeconds,
      1,
      DEFAULT_FLOOR
    );
    const fourSteps = decayResidualHeat(
      FIRE_RESIDUAL_PEAK_HEAT,
      CINEMATIC_TEMPERATURE_DISSIPATION,
      subDtSeconds,
      4,
      DEFAULT_FLOOR
    );

    expect(fourSteps).toBeLessThan(oneStep);
    expect(fourSteps).toBeCloseTo(
      advanceReferenceField(
        FIRE_RESIDUAL_PEAK_HEAT,
        CINEMATIC_TEMPERATURE_DISSIPATION,
        subDtSeconds,
        4
      ),
      10
    );
  });

  it("still terminates when configured dissipation never fades", () => {
    const { subDtSeconds, subSteps } = computeFireSubStepping(1 / 60, false);
    // A physics preset may set dissipation to 1.0 (heat is never advected
    // away). The estimate must not believe that, or the fade would run forever.
    const frames = countResidualFadeFrames(
      1,
      subDtSeconds,
      subSteps,
      DEFAULT_FLOOR
    );

    expect(Number.isFinite(frames)).toBe(true);
    expect(frames / 60).toBeLessThan(120);
  });

  it("treats an already-settled or unusable field as settled", () => {
    const { subDtSeconds, subSteps } = computeFireSubStepping(1 / 60, false);
    expect(
      decayResidualHeat(
        0,
        CINEMATIC_TEMPERATURE_DISSIPATION,
        subDtSeconds,
        subSteps,
        DEFAULT_FLOOR
      )
    ).toBe(0);
    expect(
      decayResidualHeat(
        Number.NaN,
        CINEMATIC_TEMPERATURE_DISSIPATION,
        subDtSeconds,
        subSteps,
        DEFAULT_FLOOR
      )
    ).toBe(0);
  });

  it("falls back to the reference sub-step rather than stalling", () => {
    // Unreachable from the live path (computeFireStepDt floors a non-positive
    // dt at 16ms), but the estimate must still make progress if it ever is.
    const stalled = decayResidualHeat(
      FIRE_RESIDUAL_PEAK_HEAT,
      CINEMATIC_TEMPERATURE_DISSIPATION,
      0,
      1,
      DEFAULT_FLOOR
    );

    expect(stalled).toBeLessThan(FIRE_RESIDUAL_PEAK_HEAT);
    expect(stalled).toBeCloseTo(
      FIRE_RESIDUAL_PEAK_HEAT * CINEMATIC_TEMPERATURE_DISSIPATION,
      10
    );
  });
});
