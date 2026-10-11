import { describe, it, expect } from "vitest";
import { analyzeDifficulty, calculateDifficultyLevel } from "#lib/shared/browse/services/sequence-difficulty-calculator.js";
import {
  HandSide,
  Orientation,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";

// Minimal StepData factory - only the fields the calculator reads.
function makeStep(
  leftTurns: number | "fl" | null,
  rightTurns: number | "fl" | null,
  leftStartOri: Orientation = Orientation.IN,
  leftEndOri: Orientation = Orientation.IN,
  rightStartOri: Orientation = Orientation.IN,
  rightEndOri: Orientation = Orientation.IN,
): StepData {
  return {
    stepNumber: 1,
    duration: 1,
    leftReversal: false,
    rightReversal: false,
    isBlank: false,
    motions: {
      [HandSide.LEFT]: {
        turns: leftTurns,
        startOrientation: leftStartOri,
        endOrientation: leftEndOri,
      },
      [HandSide.RIGHT]: {
        turns: rightTurns,
        startOrientation: rightStartOri,
        endOrientation: rightEndOri,
      },
    },
  } as unknown as StepData;
}

describe("analyzeDifficulty", () => {
  it("returns level 1 / trigger 'none' for an empty sequence", () => {
    expect(analyzeDifficulty([])).toEqual({ level: 1, trigger: "none" });
  });

  it("returns level 1 / trigger 'none' when there are no turns and only radial orientations", () => {
    const steps = [makeStep(0, 0)];
    expect(analyzeDifficulty(steps)).toEqual({ level: 1, trigger: "none" });
  });

  it("returns level 2 / trigger 'turns' when a whole turn is present with radial orientations", () => {
    const steps = [makeStep(1, 0)];
    expect(analyzeDifficulty(steps)).toEqual({ level: 2, trigger: "turns" });
  });

  it("returns level 3 / trigger 'nonRadial' when any orientation is CLOCK or COUNTER", () => {
    const steps = [makeStep(0, 0, Orientation.IN, Orientation.CLOCK)];
    expect(analyzeDifficulty(steps)).toEqual({
      level: 3,
      trigger: "nonRadial",
    });
  });

  it("returns level 2 / trigger 'turns' for a float value", () => {
    const steps = [makeStep("fl", 0)];
    expect(analyzeDifficulty(steps)).toEqual({ level: 2, trigger: "turns" });
  });

  it("prefers nonRadial over turns when both are present (L3 wins)", () => {
    const steps = [makeStep(1, 0, Orientation.IN, Orientation.CLOCK)];
    expect(analyzeDifficulty(steps)).toEqual({
      level: 3,
      trigger: "nonRadial",
    });
  });
});

describe("calculateDifficultyLevel (unchanged behavior)", () => {
  it("still returns a plain number", () => {
    expect(calculateDifficultyLevel([])).toBe(1);
    expect(calculateDifficultyLevel([makeStep(1, 0)])).toBe(2);
  });
});
