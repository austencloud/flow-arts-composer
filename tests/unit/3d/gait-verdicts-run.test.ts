import { describe, expect, it } from "vitest";

import type { GaitReport } from "#lib/shared/3d/diagnostics/gait/gait-analysis.js";
import { EMPTY_KNEE_ANATOMY } from "#lib/shared/3d/diagnostics/gait/knee-anatomy.js";
import { verdictRows } from "#lib/shared/3d/diagnostics/gait/gait-verdicts.js";

/**
 * The numbers x-bot actually produces on the run tier.
 *
 * Read off the walk lab on the circle at 3.90 m/s with the planter on, in the
 * same session that measured the walk baseline the bands are scaled against.
 * Keeping the real figures here means a regression in the profile shows up as
 * a verdict this run should not get, rather than as a fixture nobody believes.
 */
const runReport: GaitReport = {
  frameCount: 480,
  duration: 8,
  groundY: 0,
  stances: [{} as GaitReport["stances"][number]],
  cadence: 160,
  stepLengths: [1.48],
  meanStepLength: 1.48,
  stepLengthSpread: 0.05,
  dutyFactor: 0.28,
  doubleSupportFraction: 0,
  peakSlip: 0.06,
  meanSlip: 0.041,
  slipRatio: 0.03,
  peakHeelLift: 0.055,
  heelLiftBehindHips: 0.417,
  hasToes: true,
  twitches: [],
  twitchesPerSecond: 34.1,
  kneeJerkRms: 6251,
  jolts: [],
  joltsPerSecond: 0,
  peakJolt: 297,
  peakJoltJoint: "left toe",
  peakJoltStep: 0.05,
  legCrossingSeconds: 0,
  legCrossingFraction: 0,
  minimumLegOrderMargin: 0.1,
  maximumLegOrderMargin: 0.2,
  minimumFootSeparation: 0.14,
  minimumLegSegmentSeparation: 0.05,
  legOrderAlternates: true,
  inPlaceCyclingSeconds: 0,
  inPlaceCyclingFraction: 0,
  weightShiftAmplitude: 0.058,
  overSupportFraction: 0,
  weightShiftAlternates: false,
  // No frames, so no knees to grade. The gate in `verdictRows` reads this as
  // unmeasured and reports the anatomy rows without a verdict, which is the
  // honest answer for a fixture whose numbers were written by hand.
  anatomy: EMPTY_KNEE_ANATOMY,
};

const verdictOf = (
  report: GaitReport,
  maneuver: "walk" | "run",
  name: string
) => verdictRows(report, "gait", maneuver).find((row) => row.name === name);

describe("run-aware gait verdicts", () => {
  it("grades the shape of a running stride against running norms", () => {
    for (const name of [
      "Cadence",
      "Step length",
      "Duty factor",
      "Double support",
    ]) {
      expect(verdictOf(runReport, "walk", name)?.verdict, `${name} as walk`).toBe(
        "bad"
      );
      expect(verdictOf(runReport, "run", name)?.verdict, `${name} as run`).toBe(
        "good"
      );
    }
  });

  it("still fails a walk that lost its flight-free double support", () => {
    const brokenWalk: GaitReport = {
      ...runReport,
      cadence: 110,
      meanStepLength: 0.7,
      stepLengths: [0.7],
      dutyFactor: 0.3,
      doubleSupportFraction: 0,
    };

    expect(verdictOf(brokenWalk, "walk", "Duty factor")?.verdict).toBe("bad");
    expect(verdictOf(brokenWalk, "walk", "Double support")?.verdict).toBe("bad");
  });

  it("scales the walk-calibrated knee-jerk ceiling by the measured pace", () => {
    expect(verdictOf(runReport, "walk", "Knee jerk")?.verdict).toBe("bad");

    const asRun = verdictOf(runReport, "run", "Knee jerk");
    expect(asRun?.verdict).toBe("warn");

    const ceiling = Number(asRun?.human.replace(/\D+/g, ""));
    expect(ceiling).toBeGreaterThan(4000);
    expect(ceiling).toBeLessThan(6251);
  });

  it("scales the joint-acceleration ceiling the same way", () => {
    const hardJolt: GaitReport = { ...runReport, peakJolt: 800 };

    expect(verdictOf(hardJolt, "walk", "Worst teleport")?.verdict).toBe("warn");
    expect(verdictOf(hardJolt, "run", "Worst teleport")?.verdict).toBe("good");
  });

  it("stops counting knee pops once the detector bar sits inside the stride", () => {
    expect(verdictOf(runReport, "walk", "Knee twitches")?.verdict).toBe("bad");

    const asRun = verdictOf(runReport, "run", "Knee twitches");
    expect(asRun?.verdict).toBe("none");
    expect(asRun?.tell).toContain("Knee jerk");
  });

  it("leaves foot slip on its absolute band, because a slide is visible at any stride", () => {
    expect(verdictOf(runReport, "run", "Foot slip per step")?.verdict).toBe(
      verdictOf(runReport, "walk", "Foot slip per step")?.verdict
    );
  });

  it("reports every measurement a walk reports, rather than hiding rows", () => {
    expect(verdictRows(runReport, "gait", "run").map((row) => row.name)).toEqual(
      verdictRows(runReport, "gait", "walk").map((row) => row.name)
    );
  });
});
