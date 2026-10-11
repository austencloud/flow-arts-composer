import { describe, expect, it } from "vitest";

import {
  assertGaitTimingPlanMatchesSteps,
  createCountedGaitTimingPlan,
  createGaitTimingPlan,
  sampleGaitTimingPlan,
} from "#lib/shared/3d/locomotion/gait-timing-plan.js";

describe("gait timing plan", () => {
  it("places every even footfall on its declared musical count", () => {
    const plan = createCountedGaitTimingPlan({
      id: "phrase-1",
      steps: 4,
      tempoBpm: 120,
      departureBeat: 1,
      schedule: "even",
    });

    expect(plan.footfalls.map((event) => event.plantBeat)).toEqual([
      2, 3, 4, 5,
    ]);
    expect(plan.footfalls.map((event) => event.plantTimeSeconds)).toEqual([
      1, 1.5, 2, 2.5,
    ]);
    for (const event of plan.footfalls) {
      expect(sampleGaitTimingPlan(plan, event.plantTimeSeconds).step).toBe(
        event.step
      );
    }
  });

  it("expresses a held middle count as a longer local gait interval", () => {
    const plan = createCountedGaitTimingPlan({
      id: "phrase-held",
      steps: 6,
      tempoBpm: 120,
      departureBeat: 0,
      schedule: "hold-middle",
    });

    expect(plan.footfalls.map((event) => event.plantBeat)).toEqual([
      1, 2, 3, 5, 6, 7,
    ]);
    expect(sampleGaitTimingPlan(plan, 1.75)).toMatchObject({
      step: 3.25,
      cadence: 1,
      arrived: false,
    });
  });

  it("lands and settles on separate score-time boundaries", () => {
    const plan = createCountedGaitTimingPlan({
      id: "phrase-stop",
      steps: 2,
      tempoBpm: 120,
      departureBeat: 0,
      schedule: "even",
    });

    expect(sampleGaitTimingPlan(plan, 1)).toMatchObject({
      step: 2,
      cadence: 0,
      arrived: true,
      settled: false,
      settleProgress: 0,
    });
    expect(sampleGaitTimingPlan(plan, 1.125).settleProgress).toBeCloseTo(0.5);
    expect(sampleGaitTimingPlan(plan, 1.25)).toMatchObject({
      step: 2,
      arrived: true,
      settled: true,
      settleProgress: 1,
    });
  });

  it("is independent of frame partitions and a 100ms render stall", () => {
    const plan = createCountedGaitTimingPlan({
      id: "phrase-stall",
      steps: 8,
      tempoBpm: 150,
      departureBeat: 2,
      schedule: "hold-middle",
    });
    const direct = sampleGaitTimingPlan(plan, 2.1);
    const partitioned = [0.016, 0.033, 0.1, 0.45, 1.2, 2.1]
      .map((scoreTime) => sampleGaitTimingPlan(plan, scoreTime))
      .at(-1)!;

    expect(partitioned).toEqual(direct);
  });

  it("rejects malformed plans and step-count mismatches", () => {
    expect(() =>
      createGaitTimingPlan({
        id: "bad",
        departureBeat: 0,
        departureTimeSeconds: 0,
        footfalls: [{ step: 2, plantBeat: 1, plantTimeSeconds: 0.5 }],
        settledBeat: 2,
        settledTimeSeconds: 1,
      })
    ).toThrow("consecutive");

    const plan = createCountedGaitTimingPlan({
      id: "counted",
      steps: 4,
      tempoBpm: 120,
      departureBeat: 0,
      schedule: "even",
    });
    expect(() => assertGaitTimingPlanMatchesSteps(plan, 5)).toThrow(
      "4 footfalls for 5 steps"
    );
  });
});
