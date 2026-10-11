import { describe, expect, it } from "vitest";

import type { GaitReport } from "#lib/shared/3d/diagnostics/gait/gait-analysis.js";
import { EMPTY_KNEE_ANATOMY } from "#lib/shared/3d/diagnostics/gait/knee-anatomy.js";
import { verdictRows } from "#lib/shared/3d/diagnostics/gait/gait-verdicts.js";

const report: GaitReport = {
  frameCount: 120,
  duration: 2,
  groundY: 0,
  stances: [{} as GaitReport["stances"][number]],
  cadence: 110,
  stepLengths: [0.7],
  meanStepLength: 0.7,
  stepLengthSpread: 0.05,
  dutyFactor: 0.6,
  doubleSupportFraction: 0.2,
  peakSlip: 0.01,
  meanSlip: 0.01,
  slipRatio: 0.02,
  peakHeelLift: 0.01,
  heelLiftBehindHips: 0.2,
  hasToes: true,
  twitches: [],
  twitchesPerSecond: 0,
  kneeJerkRms: 500,
  jolts: [],
  joltsPerSecond: 0,
  peakJolt: 0,
  peakJoltJoint: null,
  peakJoltStep: 0,
  legCrossingSeconds: 0,
  legCrossingFraction: 0,
  minimumLegOrderMargin: 0.1,
  maximumLegOrderMargin: 0.2,
  minimumFootSeparation: 0.14,
  minimumLegSegmentSeparation: 0.05,
  legOrderAlternates: true,
  inPlaceCyclingSeconds: 0,
  inPlaceCyclingFraction: 0,
  weightShiftAmplitude: 0.08,
  overSupportFraction: 0.8,
  weightShiftAlternates: true,
  // No frames, so no knees to grade. The gate in `verdictRows` reads this as
  // unmeasured and reports the anatomy rows without a verdict, which is the
  // honest answer for a fixture whose numbers were written by hand.
  anatomy: EMPTY_KNEE_ANATOMY,
};

describe("maneuver-aware gait verdicts", () => {
  it("does not grade a turn-in-place as a forward walk", () => {
    const names = verdictRows(report, "gait", "turn-in-place").map(
      (row) => row.name
    );

    expect(names).toContain("Foot slip per step");
    expect(names).toContain("Leg self-crossing");
    expect(names).not.toContain("Cadence");
    expect(names).not.toContain("Step length");
    expect(names).not.toContain("Cycling on the spot");
  });

  it("keeps collision and root-travel safety rows for sidesteps", () => {
    const names = verdictRows(report, "gait", "lateral").map((row) => row.name);

    expect(names).toContain("Leg self-crossing");
    expect(names).toContain("Cycling on the spot");
    expect(names).not.toContain("Step length");
    expect(names).not.toContain("Duty factor");
  });

  it("grades an intentional crossover by order and 3D clearance", () => {
    const rows = verdictRows(report, "gait", "crossover");
    const byName = new Map(rows.map((row) => [row.name, row]));

    expect(byName.has("Leg self-crossing")).toBe(false);
    expect(byName.get("Crossing order")?.verdict).toBe("good");
    expect(byName.get("Foot clearance")?.verdict).toBe("good");
    expect(byName.get("Leg clearance")?.verdict).toBe("good");
  });
});
