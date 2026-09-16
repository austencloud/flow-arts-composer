import { describe, it, expect } from "vitest";
import { PlacementContinuityConstraint } from "../../../../src/generation/constraints/domain/PlacementContinuityConstraint.js";
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

function makePictograph(
  overrides: Partial<PictographData>,
): PictographData {
  return {
    letter: "A",
    startPlacement: "alpha1",
    endPlacement: "alpha1",
    timing: "together",
    direction: "same",
    leftMotion: EMPTY_MOTION,
    rightMotion: EMPTY_MOTION,
    ...overrides,
  };
}

function makeContext(
  overrides: Partial<ConstraintContext>,
): ConstraintContext {
  const defaults: ConstraintContext = {
    stepIndex: 0,
    totalSteps: 4,
    previousSteps: [],
    candidate: makePictograph({}),
    letter: "A",
  };
  return { ...defaults, ...overrides };
}

describe("PlacementContinuityConstraint", () => {
  const constraint = new PlacementContinuityConstraint();

  it("is a hard constraint", () => {
    expect(constraint.mode).toBe("hard");
  });

  it("satisfied on first step", () => {
    const result = constraint.evaluate(
      makeContext({ previousSteps: [] }),
    );
    expect(result.satisfied).toBe(true);
    expect(result.score).toBe(1);
  });

  it("satisfied when placements match", () => {
    const prev = makePictograph({
      startPlacement: "alpha1",
      endPlacement: "beta5",
    });
    const candidate = makePictograph({
      startPlacement: "beta5",
      endPlacement: "gamma11",
    });

    const result = constraint.evaluate(
      makeContext({
        stepIndex: 1,
        previousSteps: [prev],
        candidate,
      }),
    );
    expect(result.satisfied).toBe(true);
    expect(result.score).toBe(1);
  });

  it("not satisfied when placements don't match", () => {
    const prev = makePictograph({
      startPlacement: "alpha1",
      endPlacement: "beta5",
    });
    const candidate = makePictograph({
      startPlacement: "gamma11",
      endPlacement: "alpha1",
    });

    const result = constraint.evaluate(
      makeContext({
        stepIndex: 1,
        previousSteps: [prev],
        candidate,
      }),
    );
    expect(result.satisfied).toBe(false);
    expect(result.score).toBe(0);
    expect(result.reason).toContain("beta5");
    expect(result.reason).toContain("gamma11");
  });

  it("checks only the last previous step", () => {
    const step1 = makePictograph({
      startPlacement: "alpha1",
      endPlacement: "beta5",
    });
    const step2 = makePictograph({
      startPlacement: "beta5",
      endPlacement: "gamma11",
    });
    const candidate = makePictograph({
      startPlacement: "gamma11",
      endPlacement: "alpha1",
    });

    const result = constraint.evaluate(
      makeContext({
        stepIndex: 2,
        previousSteps: [step1, step2],
        candidate,
      }),
    );
    expect(result.satisfied).toBe(true);
  });
});
