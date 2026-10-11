import { describe, expect, it } from "vitest";

import {
  compileStageTravel,
  resolveStageTravel,
  sampleCompiledStageTravel,
} from "#lib/features/stage/domain/stage-travel-plan.js";
import type {
  FormationSpot,
  StageChoreography,
} from "#lib/features/stage/domain/stage-types.js";
import {
  chooseAutomaticExactSteps,
  exactStepRange,
} from "#lib/shared/3d/locomotion/straight-travel-constraints.js";

function spot(
  x: number,
  z: number,
  overrides: Partial<FormationSpot> = {}
): FormationSpot {
  return { x, z, walkStyle: "direct", easing: "linear", ...overrides };
}

function choreography(destination: FormationSpot): StageChoreography {
  return {
    id: "travel",
    name: "Travel",
    bpm: 120,
    stageWidth: 12,
    stageDepth: 10,
    environmentId: "void",
    performers: [
      { id: "a", index: 0, label: "A", color: "#f66", sequenceClips: [] },
    ],
    formations: [
      {
        id: "opening",
        atBeat: 0,
        transitionBeats: 0,
        spots: { a: spot(1, 5) },
      },
      {
        id: "arrival",
        atBeat: 16,
        transitionBeats: 12,
        spots: { a: destination },
      },
    ],
    sharedSequenceId: null,
  };
}

describe("Stage straight travel plan", () => {
  it("uses the shared stride and cadence range for Auto", () => {
    expect(exactStepRange(8, 6)).toEqual({ min: 10, max: 14 });
    expect(chooseAutomaticExactSteps(8, 6)).toBe(11);
    expect(exactStepRange(5, 8)).toBeNull();
  });

  it("preserves the legacy global transition until a performer authors Floor timing", () => {
    const resolved = resolveStageTravel(choreography(spot(9, 5)), "a", 1)!;

    expect(resolved).toMatchObject({
      departureBeat: 4,
      arrivalBeat: 16,
      requestedStepCount: null,
      resolvedStepCount: 11,
      exact: false,
    });
    expect(compileStageTravel(choreography(spot(9, 5)), "a", 1, 0)).toBeNull();
  });

  it("compiles authored beats into deterministic footfalls and the exact endpoint", () => {
    const value = choreography(
      spot(9, 5, {
        easing: "easeIn",
        travel: { departureBeat: 2, arrivalBeat: 14, stepCount: 12 },
      })
    );
    const plan = compileStageTravel(value, "a", 1, 0)!;

    expect(plan.timingPlan.footfalls).toHaveLength(12);
    expect(plan.timingPlan.footfalls[0]!.plantBeat).toBeGreaterThan(3);
    expect(plan.timingPlan.footfalls.at(-1)!.plantBeat).toBeCloseTo(14);

    const landed = sampleCompiledStageTravel(plan, 14, value.bpm);
    expect(landed.position).toEqual({ x: 3, z: 0 });
    expect(landed.progress).toBe(1);
    expect(landed.moving).toBe(false);
    expect(landed.gaitTimingSample.gaitStep).toBe(12);
    expect(landed.terminalStepPlan.landAtGaitStep).toBe(12);
  });

  it("refuses an authored step count that cannot fit the distance and time", () => {
    const resolved = resolveStageTravel(
      choreography(
        spot(9, 5, {
          travel: { departureBeat: 2, arrivalBeat: 14, stepCount: 3 },
        })
      ),
      "a",
      1
    )!;

    expect(resolved).toMatchObject({
      requestedStepCount: 3,
      resolvedStepCount: null,
      exact: false,
    });
  });
});
