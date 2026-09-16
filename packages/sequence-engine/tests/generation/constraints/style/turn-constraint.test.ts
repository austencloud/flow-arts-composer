import { describe, it, expect } from "vitest";
import { TurnConstraint } from "../../../../src/generation/constraints/style/turn-constraint.js";
import type { ConstraintContext } from "../../../../src/generation/constraints/types.js";

function makeCandidate(leftTurns?: number | "fl", rightTurns?: number | "fl"): ConstraintContext {
  return {
    stepIndex: 0,
    totalSteps: 4,
    previousSteps: [],
    letter: "A",
    candidate: {
      letter: "A",
      startPlacement: "alpha1",
      endPlacement: "beta3",
      timing: "together",
      direction: "together",
      leftMotion: {
        motionType: "pro",
        startLocation: "n",
        endLocation: "s",
        rotationDirection: "cw",
        turns: leftTurns,
      },
      rightMotion: {
        motionType: "pro",
        startLocation: "s",
        endLocation: "n",
        rotationDirection: "ccw",
        turns: rightTurns,
      },
    },
  };
}

describe("TurnConstraint", () => {
  it("satisfies when both hands match required turns", () => {
    const constraint = new TurnConstraint(0);
    const result = constraint.evaluate(makeCandidate(0, 0));
    expect(result.satisfied).toBe(true);
    expect(result.score).toBe(1);
  });

  it("rejects when turns don't match", () => {
    const constraint = new TurnConstraint(0);
    const result = constraint.evaluate(makeCandidate(1, 0));
    expect(result.satisfied).toBe(false);
  });

  it("treats undefined turns as 0", () => {
    const constraint = new TurnConstraint(0);
    const result = constraint.evaluate(makeCandidate(undefined, undefined));
    expect(result.satisfied).toBe(true);
  });

  it("rejects float turns when requiring 0", () => {
    const constraint = new TurnConstraint(0);
    const result = constraint.evaluate(makeCandidate("fl", 0));
    expect(result.satisfied).toBe(false);
  });

  it("is always a hard constraint", () => {
    const constraint = new TurnConstraint(0);
    expect(constraint.mode).toBe("hard");
  });

  it("couldSatisfy returns true for matching candidates", () => {
    const constraint = new TurnConstraint(0);
    expect(constraint.couldSatisfy(makeCandidate(0, 0).candidate)).toBe(true);
    expect(constraint.couldSatisfy(makeCandidate(1, 0).candidate)).toBe(false);
  });
});
