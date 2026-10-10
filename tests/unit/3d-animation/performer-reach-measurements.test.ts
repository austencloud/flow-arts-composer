import { describe, expect, it } from "vitest";
import {
  fitStaffLengthForHug,
  measurePerformerReach,
  planHugReachGeometry,
} from "#lib/shared/3d/domain/performer-reach-measurements.js";

/** A synthetic skeleton sample: two arms of known segment lengths. */
function sample(overrides: Partial<Parameters<typeof measurePerformerReach>[0]> = {}) {
  return {
    leftUpperArmM: 0.28,
    leftForearmM: 0.32,
    rightUpperArmM: 0.28,
    rightForearmM: 0.32,
    shoulderWidthM: 0.44,
    ...overrides,
  };
}

describe("measurePerformerReach", () => {
  it("derives reach from the measured arm segments", () => {
    const measured = measurePerformerReach(sample());
    expect(measured).not.toBeNull();
    expect(measured!.upperArmM).toBeCloseTo(0.28, 10);
    expect(measured!.forearmM).toBeCloseTo(0.32, 10);
    expect(measured!.reachM).toBeCloseTo(0.6, 10);
  });

  it("averages an asymmetric rig instead of favouring one arm", () => {
    const measured = measurePerformerReach(
      sample({ leftUpperArmM: 0.26, rightUpperArmM: 0.3 })
    );
    expect(measured!.upperArmM).toBeCloseTo(0.28, 10);
  });

  it("returns null before the arm chains report real lengths", () => {
    expect(measurePerformerReach(sample({ leftUpperArmM: 0 }))).toBeNull();
    expect(measurePerformerReach(sample({ shoulderWidthM: 0 }))).toBeNull();
    expect(measurePerformerReach(sample({ rightForearmM: NaN }))).toBeNull();
  });
});

describe("planHugReachGeometry", () => {
  it("puts the grips inside the shoulders and out in front of the chest", () => {
    const measured = measurePerformerReach(sample())!;
    const hug = planHugReachGeometry(measured);

    expect(hug.laneM).toBeLessThan(hug.shoulderHalfSpanM);
    expect(hug.separationM).toBeCloseTo(hug.laneM * 2, 12);
    expect(hug.forwardM).toBeGreaterThan(0);
    expect(hug.forwardM).toBeLessThanOrEqual(measured.reachM + 1e-12);
  });

  it("scales the hug lane with the body rather than fixing it", () => {
    const narrow = planHugReachGeometry(
      measurePerformerReach(sample({ shoulderWidthM: 0.34 }))!
    );
    const broad = planHugReachGeometry(
      measurePerformerReach(sample({ shoulderWidthM: 0.52 }))!
    );
    expect(broad.laneM).toBeGreaterThan(narrow.laneM);
  });

  it("holds a floor so the two grips never share a point", () => {
    const tiny = planHugReachGeometry(
      measurePerformerReach(sample({ shoulderWidthM: 0.06 }))!
    );
    expect(tiny.laneM).toBeGreaterThan(0);
  });
});

describe("fitStaffLengthForHug", () => {
  it("returns a staff that clears the torso by the requested margin", () => {
    const measured = measurePerformerReach(sample())!;
    const fit = fitStaffLengthForHug(measured);
    expect(fit.fits).toBe(true);
    if (!fit.fits) return;

    const halfLengthM = fit.maxStaffLengthCm / 200;
    const torsoHalfDepthM = (0.55 * measured.shoulderWidthM) / 2;
    expect(fit.geometry.forwardM - halfLengthM - torsoHalfDepthM).toBeCloseTo(
      0.06,
      10
    );
  });

  it("gives a longer staff to a longer-armed body", () => {
    const short = fitStaffLengthForHug(measurePerformerReach(sample())!);
    const long = fitStaffLengthForHug(
      measurePerformerReach(sample({ leftForearmM: 0.4, rightForearmM: 0.4 }))!
    );
    expect(short.fits && long.fits).toBe(true);
    if (!short.fits || !long.fits) return;
    expect(long.maxStaffLengthCm).toBeGreaterThan(short.maxStaffLengthCm);
  });

  it("caps the recommendation at the supported maximum", () => {
    const fit = fitStaffLengthForHug(
      measurePerformerReach(
        sample({ leftForearmM: 0.9, rightForearmM: 0.9 })
      )!
    );
    expect(fit.fits).toBe(true);
    if (!fit.fits) return;
    expect(fit.recommendedStaffLengthCm).toBeLessThanOrEqual(152.4);
  });

  it("reports unfitness instead of clamping when the body is too small", () => {
    const fit = fitStaffLengthForHug(
      measurePerformerReach(
        sample({
          leftUpperArmM: 0.1,
          rightUpperArmM: 0.1,
          leftForearmM: 0.12,
          rightForearmM: 0.12,
          shoulderWidthM: 0.2,
        })
      )!
    );
    expect(fit.fits).toBe(false);
    if (fit.fits) return;
    expect(fit.reason).toBe("reach-too-short");
    expect(fit.maxStaffLengthCm).toBeLessThan(60.96);
  });
});
