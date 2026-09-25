import { describe, expect, it } from "vitest";

import {
  createPatternTerminalStepPlan,
  samplePatternTerminalTravel,
} from "$lib/shared/3d/locomotion/pattern-terminal-step-plan";

/**
 * Drive a scripted root at a constant speed toward its mark, the way the walk
 * lab's patterns do, and return the first plan that arms.
 */
function armAlong(speed: number, cadence: number) {
  const dt = 1 / 60;
  let remaining = 4;
  let gaitStep = 0;
  while (remaining > 0) {
    const plan = createPatternTerminalStepPlan({
      intent: { id: "stop", remainingDistance: remaining, targetFacing: 0 },
      gaitStep,
      cadence,
      speed,
    });
    if (plan) return { plan, remaining, gaitStep };
    remaining -= speed * dt;
    gaitStep += cadence * dt;
  }
  throw new Error("the stop never armed");
}

const PENULTIMATE_SHARE = 0.95;

describe("pattern terminal step planning", () => {
  // The stop covers the capture's share of the walk's stride, about one and a
  // half strides, from whichever gait boundary sits nearest that.
  it.each([
    [1, 1.45],
    [1, 1.8],
    [0.6, 1.3],
    [1.4, 1.9],
  ])(
    "brakes over about one and a half strides (%s m/s, %s steps/s)",
    (speed, cadence) => {
      const { plan } = armAlong(speed, cadence);
      const stride = speed / cadence;
      expect(plan.remainingDistance).toBeGreaterThan(stride);
      expect(plan.remainingDistance).toBeLessThanOrEqual(2 * stride + 1e-9);
    }
  );

  // The root follows the captured stop, so it enters the brake at a speed set
  // by the first braking step's length times the braking cadence. A stop that
  // armed half a stride long, played at walking cadence, entered at 1.7 m/s
  // from a 1 m/s walk on ch44.
  it.each([
    [1, 1.45],
    [1, 1.57],
    [0.6, 1.3],
    [1.4, 1.9],
  ])(
    "enters the brake at the pace of a one-and-a-half-stride stop (%s m/s, %s steps/s)",
    (speed, cadence) => {
      const { plan } = armAlong(speed, cadence);
      const nominal = (PENULTIMATE_SHARE * speed) / cadence;
      expect(plan.stepDistances[0] * plan.cadence).toBeCloseTo(
        nominal * cadence,
        6
      );
    }
  );

  it("waits for the next gait boundary and assigns the correct terminal foot", () => {
    const intent = {
      id: "shuttle:outbound-stop",
      remainingDistance: 1.35,
      targetFacing: 0,
    };

    expect(
      createPatternTerminalStepPlan({
        intent: { ...intent, remainingDistance: 2.1 },
        gaitStep: 10.2,
        cadence: 2,
        speed: 1,
      })
    ).toBeNull();

    const plan = createPatternTerminalStepPlan({
      intent,
      gaitStep: 10.2,
      cadence: 2,
      speed: 1,
    });

    expect(plan).toMatchObject({
      id: intent.id,
      startAtGaitStep: 11,
      landAtGaitStep: 13,
      terminalFoot: "right",
      targetFacing: 0,
    });
    expect(plan!.stepDistances[0] + plan!.stepDistances[1]).toBeCloseTo(
      plan!.remainingDistance,
      10
    );
    expect(plan!.stepDistances[0]).toBeGreaterThan(plan!.stepDistances[1]);
  });

  it("keeps an exact boundary on that boundary", () => {
    const plan = createPatternTerminalStepPlan({
      intent: {
        id: "shuttle:return-stop",
        remainingDistance: 1,
        targetFacing: Math.PI,
      },
      gaitStep: 20,
      cadence: 2,
      speed: 1,
    });

    expect(plan?.startAtGaitStep).toBe(20);
    expect(plan?.landAtGaitStep).toBe(22);
    expect(plan?.terminalFoot).toBe("left");
  });

  it("does not mistake startup blend cadence for a multi-metre braking window", () => {
    const plan = createPatternTerminalStepPlan({
      intent: {
        id: "shuttle:outbound-stop",
        remainingDistance: 3.5,
        targetFacing: 0,
      },
      gaitStep: 0.1,
      cadence: 0.2,
      speed: 1,
    });

    expect(plan).toBeNull();
  });
});

describe("pattern terminal travel", () => {
  const plan = createPatternTerminalStepPlan({
    intent: { id: "stop", remainingDistance: 1, targetFacing: 0 },
    gaitStep: 20,
    cadence: 2,
    speed: 1,
  })!;

  it("covers each braking step's share as the animator's distance step crosses it", () => {
    const share = plan.stepDistances[0] / plan.remainingDistance;
    expect(samplePatternTerminalTravel(plan, 20)).toBe(0);
    expect(samplePatternTerminalTravel(plan, 20.5)).toBeCloseTo(share / 2, 10);
    expect(samplePatternTerminalTravel(plan, 21)).toBeCloseTo(share, 10);
    expect(samplePatternTerminalTravel(plan, 22)).toBe(1);
  });

  it("holds the root on the mark before and after the stop", () => {
    expect(samplePatternTerminalTravel(plan, 18)).toBe(0);
    expect(samplePatternTerminalTravel(plan, 23)).toBe(1);
  });
});
