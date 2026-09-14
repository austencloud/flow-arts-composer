import { describe, expect, it } from "vitest";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import {
  analyzeStartPick,
  getStartPickMessage,
  loopStartPickTarget,
} from "$lib/features/create/shared/services/choose-start-analyzer";

function sequenceOf(stepCount: number, isCircular: boolean): SequenceData {
  return {
    id: "seq",
    isCircular,
    steps: Array.from({ length: stepCount }, (_, i) => ({
      id: `s${i + 1}`,
      stepNumber: i + 1,
    })),
  } as unknown as SequenceData;
}

describe("analyzeStartPick", () => {
  describe("loop sequences", () => {
    const loop = sequenceOf(5, true);

    it("treats the start tile as the current start", () => {
      expect(analyzeStartPick(loop, 0)).toEqual({
        action: "no-op",
        reason: "That's already the start.",
      });
    });

    it("makes the step after the tapped pose the new step 1", () => {
      expect(analyzeStartPick(loop, 2)).toEqual({
        action: "immediate",
        targetStepNumber: 3,
      });
    });

    it("treats the last step's pose as the current start", () => {
      expect(analyzeStartPick(loop, 5)).toEqual({
        action: "no-op",
        reason: "That's already the start.",
      });
    });
  });

  describe("non-loop sequences", () => {
    const line = sequenceOf(5, false);

    it("treats the start tile as the current start", () => {
      expect(analyzeStartPick(line, 0)).toEqual({
        action: "no-op",
        reason: "That's already the start.",
      });
    });

    it("asks for confirmation and reports how many steps go", () => {
      expect(analyzeStartPick(line, 3)).toEqual({
        action: "confirm-needed",
        targetStepNumber: 4,
        stepsToRemove: 3,
      });
    });

    it("refuses the last step because nothing would remain", () => {
      expect(analyzeStartPick(line, 5)).toEqual({
        action: "no-op",
        reason: "Nothing would be left after this step.",
      });
    });
  });

  it("rejects tile indexes outside the sequence", () => {
    const loop = sequenceOf(3, true);
    expect(analyzeStartPick(loop, -1).action).toBe("no-op");
    expect(analyzeStartPick(loop, 4).action).toBe("no-op");
  });
});

describe("loopStartPickTarget", () => {
  it("maps a pose to the step after it", () => {
    expect(loopStartPickTarget(8, 1)).toBe(2);
    expect(loopStartPickTarget(8, 7)).toBe(8);
  });

  it("returns null for poses that are already the start", () => {
    expect(loopStartPickTarget(8, 0)).toBeNull();
    expect(loopStartPickTarget(8, 8)).toBeNull();
  });

  it("returns null outside the sequence", () => {
    expect(loopStartPickTarget(8, -1)).toBeNull();
    expect(loopStartPickTarget(8, 9)).toBeNull();
  });
});

describe("getStartPickMessage", () => {
  it("reports a plain success on loops", () => {
    expect(getStartPickMessage(sequenceOf(5, true), 3)).toEqual({
      success: true,
      stepsRemoved: 0,
      message: "New start set.",
    });
  });

  it("counts removed steps on non-loops", () => {
    expect(getStartPickMessage(sequenceOf(5, false), 4)).toEqual({
      success: true,
      stepsRemoved: 3,
      message: "New start set. Removed 3 steps.",
    });
    expect(getStartPickMessage(sequenceOf(5, false), 2).message).toBe(
      "New start set. Removed 1 step."
    );
  });
});
