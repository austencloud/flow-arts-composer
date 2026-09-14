import { describe, it, expect } from "vitest";
import { Type6Constraint } from "../../../../src/generation/constraints/domain/Type6Constraint.js";
import type {
  ConstraintContext,
  PictographData,
} from "../../../../src/generation/constraints/types.js";

const EMPTY_MOTION = {
  hand: "",
  startLocation: "",
  endLocation: "",
  motionType: "",
  rotationDirection: "",
  startOrientation: "",
  endOrientation: "",
};

function makeContext(overrides: Partial<ConstraintContext>): ConstraintContext {
  const defaults: ConstraintContext = {
    stepIndex: 0,
    totalSteps: 4,
    previousSteps: [],
    candidate: {
      letter: "A",
      startPosition: "alpha1",
      endPosition: "alpha1",
      timing: "together",
      direction: "same",
      leftMotion: EMPTY_MOTION,
      rightMotion: EMPTY_MOTION,
    },
    letter: "A",
  };
  return { ...defaults, ...overrides };
}

describe("Type6Constraint", () => {
  const constraint = new Type6Constraint();

  it("is a hard constraint", () => {
    expect(constraint.mode).toBe("hard");
  });

  it("rejects Type 6 at level 1", () => {
    const result = constraint.evaluate(makeContext({ letter: "α", level: 1 }));
    expect(result.satisfied).toBe(false);
    expect(result.score).toBe(0);
  });

  it("rejects Type 6 at default level (no level specified defaults to 1)", () => {
    const result = constraint.evaluate(makeContext({ letter: "β" }));
    expect(result.satisfied).toBe(false);
  });

  it("allows Type 6 at level 2 when turns > 0", () => {
    const result = constraint.evaluate(
      makeContext({
        letter: "γ",
        level: 2,
        turnAllocation: { left: 1, right: 0 },
      })
    );
    expect(result.satisfied).toBe(true);
    expect(result.score).toBe(1);
  });

  it("rejects Type 6 at level 2 when both turns are 0", () => {
    const result = constraint.evaluate(
      makeContext({
        letter: "α",
        level: 2,
        turnAllocation: { left: 0, right: 0 },
      })
    );
    expect(result.satisfied).toBe(false);
    expect(result.score).toBe(0);
  });

  it("allows Type 6 at level 3 when turns > 0", () => {
    const result = constraint.evaluate(
      makeContext({
        letter: "α",
        level: 3,
        turnAllocation: { left: 1, right: 0 },
      })
    );
    expect(result.satisfied).toBe(true);
    expect(result.score).toBe(1);
  });

  it("rejects Type 6 at level 3 when both turns are 0", () => {
    const result = constraint.evaluate(
      makeContext({
        letter: "β",
        level: 3,
        turnAllocation: { left: 0, right: 0 },
      })
    );
    expect(result.satisfied).toBe(false);
  });

  it("rejects Type 6 at level 2 when no turn allocation provided", () => {
    const result = constraint.evaluate(makeContext({ letter: "τ", level: 2 }));
    expect(result.satisfied).toBe(false);
  });

  it("allows non-Type-6 at any level", () => {
    // Type 1 letter at level 1
    const r1 = constraint.evaluate(makeContext({ letter: "A", level: 1 }));
    expect(r1.satisfied).toBe(true);

    // Type 2 letter at level 1
    const r2 = constraint.evaluate(makeContext({ letter: "W", level: 1 }));
    expect(r2.satisfied).toBe(true);

    // Type 4 letter at level 3
    const r3 = constraint.evaluate(makeContext({ letter: "Φ", level: 3 }));
    expect(r3.satisfied).toBe(true);
  });

  it("rejects float assignments that materialize as zero turns on static hands", () => {
    const result = constraint.evaluate(
      makeContext({
        letter: "β",
        level: 3,
        turnAllocation: { left: 1, right: 1 },
        assignedTurns: { left: "fl", right: "fl" },
      })
    );
    expect(result.satisfied).toBe(false);
  });

  it("allows one real prop turn alongside a float assignment", () => {
    const result = constraint.evaluate(
      makeContext({
        letter: "β",
        level: 3,
        turnAllocation: { left: 1, right: 1 },
        assignedTurns: { left: "fl", right: 1 },
      })
    );
    expect(result.satisfied).toBe(true);
  });
});
