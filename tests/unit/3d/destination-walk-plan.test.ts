import { describe, expect, it } from "vitest";

import {
  createDestinationWalkPlan,
  createTerminalStepPlan,
  sampleDestinationWalkPlan,
} from "#lib/shared/3d/locomotion/destination-walk-plan.js";

describe("destination walk plan", () => {
  it("reserves two shorter placements for a real braking window", () => {
    const plan = createDestinationWalkPlan({
      from: { x: -1, z: 2 },
      to: { x: 3, z: 5 },
      steps: 5,
      cadence: 2,
    });

    expect(plan.distance).toBeCloseTo(5, 10);
    expect(plan.stepLength).toBeCloseTo(1, 10);
    expect(plan.duration).toBeCloseTo(2.5, 10);

    expect(plan.stepDistances.slice(0, 3)).toEqual([3.5 / 3, 3.5 / 3, 3.5 / 3]);
    expect(plan.stepDistances[3]).toBeCloseTo(0.95, 10);
    expect(plan.stepDistances[4]).toBeCloseTo(0.55, 10);
    expect(plan.terminalStartStep).toBe(3);
    expect(plan.terminalDistance).toBeCloseTo(1.5, 10);

    for (let step = 0; step <= plan.steps; step++) {
      const sample = sampleDestinationWalkPlan(plan, step);
      const distance = plan.stepBoundaries[step]!;
      expect(sample.position.x).toBeCloseTo(-1 + 0.8 * distance, 10);
      expect(sample.position.z).toBeCloseTo(2 + 0.6 * distance, 10);
    }
  });

  it("arms the matching terminal foot exactly two steps before arrival", () => {
    const plan = createDestinationWalkPlan({
      from: { x: 0, z: 0 },
      to: { x: 0, z: 8 },
      steps: 12,
    });
    const terminal = createTerminalStepPlan(plan, 4, "walk-17", 0, "phrase-17");

    expect(terminal).toMatchObject({
      id: "walk-17",
      startAtGaitStep: 14,
      landAtGaitStep: 16,
      terminalFoot: "left",
      cadence: plan.cadence,
      targetFacing: 0,
      timingPlanId: "phrase-17",
    });
    expect(terminal.stepDistances).toEqual(plan.stepDistances.slice(-2));
    expect(terminal.remainingDistance).toBeCloseTo(plan.terminalDistance, 10);
  });

  it("reaches the destination exactly without an overshoot correction", () => {
    const destination = { x: 1.25, z: -3.75 };
    const plan = createDestinationWalkPlan({
      from: { x: 0, z: 0 },
      to: destination,
      steps: 6,
    });

    const atStrike = sampleDestinationWalkPlan(plan, 6);
    const afterDelayedFrame = sampleDestinationWalkPlan(plan, 6.08);

    expect(atStrike.position).toEqual(destination);
    expect(afterDelayedFrame.position).toEqual(destination);
    expect(afterDelayedFrame.speed).toBe(0);
    expect(afterDelayedFrame.arrived).toBe(true);
  });

  it("depends on gait progress, not on how frames partition elapsed time", () => {
    const plan = createDestinationWalkPlan({
      from: { x: 2, z: -1 },
      to: { x: -4, z: 7 },
      steps: 8,
    });

    const oneFrame = sampleDestinationWalkPlan(plan, 3.625);
    const manyFrames = [0.2, 0.65, 1.4, 2.1, 3.625]
      .map((step) => sampleDestinationWalkPlan(plan, step))
      .at(-1)!;

    expect(manyFrames).toEqual(oneFrame);
  });

  it("follows authored root distance without changing the footfall count", () => {
    const plan = createDestinationWalkPlan({
      from: { x: 0, z: 0 },
      to: { x: 0, z: 6 },
      steps: 6,
    });

    // Halfway through the second footfall in clip time, the captured root has
    // completed only a quarter of that step's travel.
    const sample = sampleDestinationWalkPlan(plan, 1.5, 1.25);

    expect(sample.step).toBe(1.5);
    expect(sample.position.z).toBeCloseTo(
      plan.stepBoundaries[1]! + plan.stepDistances[1]! * 0.25,
      10
    );
    expect(sample.remainingSteps).toBe(4.5);
  });

  it("uses the timing plan's local cadence for world speed", () => {
    const plan = createDestinationWalkPlan({
      from: { x: 0, z: 0 },
      to: { x: 0, z: 6 },
      steps: 6,
    });

    const sample = sampleDestinationWalkPlan(plan, 2.25, 2.25, 1);
    expect(sample.speed).toBeCloseTo(plan.stepDistances[2]!, 10);
  });

  it("clamps observations before departure without walking backwards", () => {
    const plan = createDestinationWalkPlan({
      from: { x: 4, z: 9 },
      to: { x: 4, z: 1 },
      steps: 10,
    });

    const sample = sampleDestinationWalkPlan(plan, -0.25);
    expect(sample.position).toEqual(plan.from);
    expect(sample.step).toBe(0);
    expect(sample.remainingSteps).toBe(10);
  });

  it("rejects requests that cannot define a real walk", () => {
    const base = {
      from: { x: 0, z: 0 },
      to: { x: 4, z: 0 },
      steps: 6,
    };

    expect(() => createDestinationWalkPlan({ ...base, steps: 0 })).toThrow(
      "positive integer"
    );
    expect(() => createDestinationWalkPlan({ ...base, steps: 2.5 })).toThrow(
      "positive integer"
    );
    expect(() =>
      createDestinationWalkPlan({ ...base, cadence: Number.NaN })
    ).toThrow("cadence");
    expect(() =>
      createDestinationWalkPlan({ ...base, to: { ...base.from } })
    ).toThrow("destination");
    expect(() =>
      createDestinationWalkPlan({
        ...base,
        from: { x: Number.POSITIVE_INFINITY, z: 0 },
      })
    ).toThrow("finite");
    expect(() =>
      sampleDestinationWalkPlan(createDestinationWalkPlan(base), NaN)
    ).toThrow("step must be finite");
    expect(() =>
      sampleDestinationWalkPlan(
        createDestinationWalkPlan(base),
        1,
        Number.POSITIVE_INFINITY
      )
    ).toThrow("distanceStep must be finite");
    expect(() =>
      sampleDestinationWalkPlan(createDestinationWalkPlan(base), 1, 1, -1)
    ).toThrow("cadence");
  });
});
