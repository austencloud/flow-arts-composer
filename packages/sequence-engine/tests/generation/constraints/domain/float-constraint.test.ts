import { describe, it, expect } from "vitest";
import { FloatConstraint } from "../../../../src/generation/constraints/domain/FloatConstraint.js";
import type { ConstraintContext } from "../../../../src/generation/constraints/types.js";

const EMPTY_MOTION = {
  hand: "",
  startLocation: "",
  endLocation: "",
  motionType: "",
  rotationDirection: "",
  startOrientation: "",
  endOrientation: "",
};

function makeContext(
  overrides: Partial<ConstraintContext>,
): ConstraintContext {
  const defaults: ConstraintContext = {
    stepIndex: 0,
    totalSteps: 4,
    previousSteps: [],
    candidate: {
      letter: "A",
      startPlacement: "alpha1",
      endPlacement: "alpha1",
      timing: "together",
      direction: "same",
      leftMotion: EMPTY_MOTION,
      rightMotion: EMPTY_MOTION,
    },
    letter: "A",
  };
  return { ...defaults, ...overrides };
}

describe("FloatConstraint", () => {
  const constraint = new FloatConstraint();

  it("is a hard constraint", () => {
    expect(constraint.mode).toBe("hard");
  });

  it("always satisfied (deferred to post-processing)", () => {
    const result = constraint.evaluate(makeContext({}));
    expect(result.satisfied).toBe(true);
    expect(result.score).toBe(1);
  });

  it("satisfied even with turn allocation present", () => {
    const result = constraint.evaluate(
      makeContext({ turnAllocation: { left: 1, right: -1 } }),
    );
    expect(result.satisfied).toBe(true);
  });
});
