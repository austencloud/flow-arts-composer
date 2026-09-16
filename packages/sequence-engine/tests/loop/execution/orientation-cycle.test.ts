import { describe, expect, it } from "vitest";
import { calculateEndOrientation } from "../../../src/core/orientation/OrientationCalculator.js";
import type {
  MotionData,
  Orientation,
  SequenceStep,
} from "../../../src/core/types/sequence-engine-types.js";
import {
  analyzeOrientationCycle,
  closeOrientationCycle,
} from "../../../src/loop/execution/orientation-cycle.js";

function motion(
  turns: number,
  startOrientation: Orientation = "in"
): MotionData {
  const base = {
    motionType: "pro",
    startLocation: "n",
    endLocation: "n",
    rotationDirection: "cw",
    startOrientation,
    turns,
  };
  return {
    ...base,
    endOrientation: calculateEndOrientation(base),
  } as MotionData;
}

function closedPlacementPattern(
  leftTurns: number,
  rightTurns = leftTurns
): SequenceStep[] {
  return [
    {
      id: "start",
      stepNumber: 0,
      letter: null,
      startPlacement: "beta1",
      endPlacement: "beta1",
      motions: {
        left: motion(0),
        right: motion(0),
      },
    },
    {
      id: "step-1",
      stepNumber: 1,
      letter: "A",
      startPlacement: "beta1",
      endPlacement: "beta1",
      motions: {
        left: motion(leftTurns),
        right: motion(rightTurns),
      },
    },
  ] as SequenceStep[];
}

describe("orientation cycle ownership", () => {
  it("analyzes the least common cycle required by both props", () => {
    const result = analyzeOrientationCycle(closedPlacementPattern(1, 0.5));

    expect(result.cycleCount).toBe(4);
    expect(result.leftOrientations.at(-1)).toBe("in");
    expect(result.rightOrientations.at(-1)).toBe("in");
  });

  it("supports all eight radial orientation states", () => {
    const result = analyzeOrientationCycle(closedPlacementPattern(0.25));

    expect(result.cycleCount).toBe(8);
    expect(result.leftOrientations).toHaveLength(9);
    expect(result.leftOrientations.at(-1)).toBe("in");
    expect(result.rightOrientations.at(-1)).toBe("in");
  });

  it("emits repeated steps until orientations close", () => {
    const result = closeOrientationCycle(closedPlacementPattern(1), {
      seedStepCount: 1,
    });

    expect(result.steps).toHaveLength(3);
    expect(result.orientationCycleCount).toBe(2);
    expect(result.patternRepetitions).toBe(2);
    expect(result.expansionMultiplier).toBe(2);
    expect(result.steps[2]!.stepNumber).toBe(2);
    expect(result.steps[2]!.motions.left.startOrientation).toBe("out");
    expect(result.steps[2]!.motions.left.endOrientation).toBe("in");
    expect(result.steps[2]!.motions.right.endOrientation).toBe("in");
    expect(new Set(result.steps.map((step) => step.id)).size).toBe(3);
  });

  it("honors the larger multiplier chosen for an exact total length", () => {
    const result = closeOrientationCycle(closedPlacementPattern(1), {
      seedStepCount: 1,
      minimumExpansionMultiplier: 4,
    });

    expect(result.steps).toHaveLength(5);
    expect(result.orientationCycleCount).toBe(2);
    expect(result.patternRepetitions).toBe(4);
    expect(result.expansionMultiplier).toBe(4);
    expect(result.steps[4]!.motions.left.endOrientation).toBe("in");
    expect(result.steps[4]!.motions.right.endOrientation).toBe("in");
  });

  it("refuses to repeat a placement pattern that is still open", () => {
    const open = closedPlacementPattern(1);
    open[1] = {
      ...open[1]!,
      endPlacement: "beta3",
    };

    expect(() => closeOrientationCycle(open)).toThrow(
      /open placement pattern/
    );
  });
});
