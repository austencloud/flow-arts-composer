import { describe, it, expect } from "vitest";
import {
  stepDataToStep,
  motionDataToMotion,
  stepToStepData,
} from "../step-bridge";
import { createStepData } from "../../factories/create-step-data";
import { createMotionData } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
import { HandSide } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";

describe("motionDataToMotion", () => {
  it("maps structural fields and drops embedded render data", () => {
    const md = createMotionData({ hand: HandSide.LEFT });
    const m = motionDataToMotion(md);
    expect(m.motionType).toBe(md.motionType);
    expect(m.startLocation).toBe(md.startLocation);
    expect(m.endLocation).toBe(md.endLocation);
    expect(m.rotationDirection).toBe(md.rotationDirection);
    expect(m.turns).toBe(md.turns);
    // render-only fields must not survive onto the lean Motion
    expect("arrowPlacementData" in m).toBe(false);
    expect("propPlacementData" in m).toBe(false);
    expect("isVisible" in m).toBe(false);
    expect("propType" in m).toBe(false);
    expect(Object.isFrozen(m)).toBe(true);
  });
});

describe("stepDataToStep", () => {
  it("converts a StepData with both motions into a frozen Step", () => {
    const sd = createStepData({
      stepNumber: 1,
      duration: 1,
      motions: {
        [HandSide.LEFT]: createMotionData({ hand: HandSide.LEFT }),
        [HandSide.RIGHT]: createMotionData({ hand: HandSide.RIGHT }),
      },
    });
    const step = stepDataToStep(sd);
    expect(step.stepNumber).toBe(1);
    expect(step.motions.left.motionType).toBe(sd.motions.left!.motionType);
    expect(step.motions.right.motionType).toBe(sd.motions.right!.motionType);
    expect(Object.isFrozen(step)).toBe(true);
    expect(Object.isFrozen(step.motions)).toBe(true);
    // dropped: stored reversal state
    expect("blueReversal" in step).toBe(false);
  });

  it("factory placeholder-fill means one-hand input still constructs (invisible red)", () => {
    // Since 2026-07-02 the factory fills a missing hand with an invisible
    // static placeholder (both-required canonical Step shape), so the bridge
    // no longer sees absent motions from factory-built steps.
    const sd = createStepData({
      stepNumber: 1,
      motions: { [HandSide.LEFT]: createMotionData({ hand: HandSide.LEFT }) },
    });
    expect(sd.motions.right.isVisible).toBe(false);
    const step = stepDataToStep(sd);
    expect(step.motions.right.motionType).toBe("static");
  });

  it("still throws for a RAW step (never through the factory) missing a hand", () => {
    const sd = {
      ...createStepData({ stepNumber: 1 }),
      motions: { [HandSide.LEFT]: createMotionData({ hand: HandSide.LEFT }) },
    } as unknown as Parameters<typeof stepDataToStep>[0];
    expect(() => stepDataToStep(sd)).toThrow(/missing its red motion/);
  });
});

describe("stepToStepData (reverse) + round-trip", () => {
  it("rebuilds a StepData from a Step, render fields defaulted, reversal false", () => {
    const original = createStepData({
      stepNumber: 2,
      duration: 1,
      motions: {
        [HandSide.LEFT]: createMotionData({ hand: HandSide.LEFT, turns: 1 }),
        [HandSide.RIGHT]: createMotionData({ hand: HandSide.RIGHT }),
      },
    });
    const step = stepDataToStep(original);
    const back = stepToStepData(step);

    // structural fields survive the round trip
    expect(back.stepNumber).toBe(2);
    expect(back.duration).toBe(1);
    expect(back.motions[HandSide.LEFT]!.motionType).toBe(
      original.motions.left!.motionType
    );
    expect(back.motions[HandSide.LEFT]!.turns).toBe(1);
    expect(back.motions[HandSide.RIGHT]!.startLocation).toBe(
      original.motions.right!.startLocation
    );

    // render cache rebuilt with defaults (recomputed downstream), present + valid
    expect(back.motions[HandSide.LEFT]!.arrowPlacementData).toBeDefined();
    expect(back.motions[HandSide.LEFT]!.propPlacementData).toBeDefined();

    // reversal flags default false (filled by the reversal pipeline)
    expect(back.leftReversal).toBe(false);
    expect(back.rightReversal).toBe(false);
  });
});
