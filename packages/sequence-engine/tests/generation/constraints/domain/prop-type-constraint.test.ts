import { describe, it, expect } from "vitest";
import { PropTypeConstraint } from "../../../../src/generation/constraints/domain/PropTypeConstraint.js";
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

describe("PropTypeConstraint", () => {
  const constraint = new PropTypeConstraint();

  it("is a hard constraint", () => {
    expect(constraint.mode).toBe("hard");
  });

  it("always satisfied when no propType specified", () => {
    const result = constraint.evaluate(makeContext({}));
    expect(result.satisfied).toBe(true);
    expect(result.score).toBe(1);
  });

  it("always satisfied when propType specified (delegated to provider)", () => {
    const result = constraint.evaluate(
      makeContext({ propType: "staff" }),
    );
    expect(result.satisfied).toBe(true);
    expect(result.score).toBe(1);
  });
});
