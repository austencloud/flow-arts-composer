import { describe, it, expect } from "vitest";
import { FusedExecutor } from "../../../src/loop/execution/FusedExecutor.js";
import type {
  SequenceStep,
  MotionData,
} from "../../../src/core/types/sequence-engine-types.js";

function makeMotion(overrides: Partial<MotionData> = {}): MotionData {
  return {
    motionType: "pro",
    startLocation: "n",
    endLocation: "e",
    rotationDirection: "cw",
    startOrientation: "in",
    endOrientation: "clock",
    turns: 1,
    ...overrides,
  } as MotionData;
}

function makeStep(
  stepNumber: number,
  overrides: Partial<SequenceStep> = {}
): SequenceStep {
  return {
    id: `step-${stepNumber}`,
    stepNumber,
    duration: 1,
    letter: "A" as SequenceStep["letter"],
    startPlacement: "alpha1",
    endPlacement: "alpha5",
    motions: {
      left: makeMotion(),
      right: makeMotion({
        startLocation: "s",
        endLocation: "w",
        rotationDirection: "ccw",
      }),
    },
    ...overrides,
  } as SequenceStep;
}

describe("FusedExecutor", () => {
  describe("invert only", () => {
    it("flips motionType pro→anti and rotDir cw→ccw", () => {
      const executor = new FusedExecutor({
        mirror: false,
        flip: false,
        swap: false,
        invert: true,
      });

      const seq = [makeStep(0), makeStep(1)];
      const result = executor.execute(seq, 2);

      expect(result.length).toBe(3);
      const transformed = result[2]!;
      expect(transformed.motions.left.motionType).toBe("anti");
      expect(transformed.motions.left.rotationDirection).toBe("ccw");
    });
  });

  describe("swap only", () => {
    it("left reads from right source and vice versa", () => {
      const executor = new FusedExecutor({
        mirror: false,
        flip: false,
        swap: true,
        invert: false,
      });

      const seq = [
        makeStep(0),
        makeStep(1, {
          motions: {
            left: makeMotion({ motionType: "pro" }),
            right: makeMotion({ motionType: "anti" }),
          },
        }),
      ];
      const result = executor.execute(seq, 2);

      const transformed = result[2]!;
      expect(transformed.motions.left.motionType).toBe("anti");
      expect(transformed.motions.right.motionType).toBe("pro");
    });
  });

  describe("mirror + invert cancellation", () => {
    it("rotation direction preserved when both mirror and invert are active", () => {
      const executor = new FusedExecutor({
        mirror: true,
        flip: false,
        swap: false,
        invert: true,
      });

      const seq = [makeStep(0), makeStep(1)];
      const result = executor.execute(seq, 2);

      const source = seq[1]!;
      const transformed = result[2]!;
      expect(transformed.motions.left.rotationDirection).toBe(
        source.motions.left.rotationDirection
      );
    });
  });

  describe("period 4", () => {
    it("generates 3 additional passes from 1 motif", () => {
      const executor = new FusedExecutor({
        mirror: true,
        flip: false,
        swap: false,
        invert: false,
      });

      const seq = [makeStep(0), makeStep(1)];
      const result = executor.execute(seq, 4);

      expect(result.length).toBe(5);
    });
  });

  describe("skewed hand paths", () => {
    it("preserves 45-degree path magnitude when transforming a step", () => {
      const executor = new FusedExecutor({
        mirror: false,
        flip: false,
        swap: false,
        invert: false,
      });
      const seq = [
        makeStep(0),
        makeStep(1, {
          motions: {
            left: makeMotion({ startLocation: "s", endLocation: "se" }),
            right: makeMotion({ startLocation: "n", endLocation: "ne" }),
          },
        }),
      ];

      const transformed = executor.execute(seq, 2)[2]!;

      expect(transformed.motions.left.startLocation).toBe("se");
      expect(transformed.motions.left.endLocation).toBe("e");
      expect(transformed.motions.right.startLocation).toBe("ne");
      expect(transformed.motions.right.endLocation).toBe("e");
    });

    it("reflects the 45-degree path direction without changing its magnitude", () => {
      const executor = new FusedExecutor({
        mirror: true,
        flip: false,
        swap: false,
        invert: false,
      });
      const seq = [
        makeStep(0),
        makeStep(1, {
          motions: {
            left: makeMotion({ startLocation: "s", endLocation: "se" }),
            right: makeMotion({ startLocation: "n", endLocation: "ne" }),
          },
        }),
      ];

      const transformed = executor.execute(seq, 2)[2]!;

      expect(transformed.motions.left.startLocation).toBe("se");
      expect(transformed.motions.left.endLocation).toBe("s");
      expect(transformed.motions.right.startLocation).toBe("ne");
      expect(transformed.motions.right.endLocation).toBe("n");
    });
  });
});
