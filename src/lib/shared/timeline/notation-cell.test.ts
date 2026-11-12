import { describe, expect, it } from "vitest";
import { buildNotationCells, reuseNotationCells } from "./notation-cell";
import { createStepData } from "#lib/shared/foundation/domain/factories/create-step-data.js";
import { createMotionData } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
import { createSequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { HandSide } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import {
  GridLocation,
  GridPlacement,
} from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";

function step(stepNumber: number) {
  return createStepData({
    stepNumber,
    startPlacement: GridPlacement.ALPHA1,
    endPlacement: GridPlacement.BETA1,
    motions: {
      [HandSide.LEFT]: createMotionData({
        hand: HandSide.LEFT,
        startLocation: GridLocation.NORTH,
        endLocation: GridLocation.NORTHEAST,
      }),
      [HandSide.RIGHT]: createMotionData({
        hand: HandSide.RIGHT,
        startLocation: GridLocation.SOUTH,
        endLocation: GridLocation.SOUTH,
      }),
    },
  });
}

// Create's player re-sends its props on every Play and Stop. A strip that
// rebuilt new cells for the same sequence re-prepared every pictograph in it
// inside the Stop tap (about 25 of them), though nothing on screen changed.
describe("rebuilding a strip's cells for an unchanged sequence", () => {
  const steps = [step(1), step(2), step(3)];

  it("hands back the previous cells, so nothing below them updates", () => {
    const sequence = createSequenceData({ id: "s", word: "ABC", steps });
    const first = buildNotationCells(sequence);
    const again = buildNotationCells(sequence);
    expect(again).not.toBe(first);
    expect(reuseNotationCells(first, again)).toBe(first);
  });

  it("keeps the start made from the first step when there is no start position", () => {
    const sequence = createSequenceData({ id: "s", word: "ABC", steps });
    expect(sequence.startPlacement ?? null).toBeNull();
    const first = buildNotationCells(sequence);
    const again = buildNotationCells({ ...sequence });
    expect(again[0]!.isStart).toBe(true);
    expect(again[0]!.data).toBe(first[0]!.data);
  });

  it("takes the new cells when a step changed", () => {
    const sequence = createSequenceData({ id: "s", word: "ABC", steps });
    const first = buildNotationCells(sequence);
    const edited = buildNotationCells({
      ...sequence,
      steps: [steps[0]!, step(2), steps[2]!],
    });
    const result = reuseNotationCells(first, edited);
    expect(result).toBe(edited);
    expect(result[2]!.data).not.toBe(first[2]!.data);
  });

  it("takes the new cells when a step was added", () => {
    const sequence = createSequenceData({ id: "s", word: "ABC", steps });
    const first = buildNotationCells(sequence);
    const longer = buildNotationCells({ ...sequence, steps: [...steps, step(4)] });
    expect(reuseNotationCells(first, longer)).toBe(longer);
  });
});
