import { describe, it, expect } from "vitest";
import { stripToSequence } from "./guide-sequence-adapter";
import { createMotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import {
  MotionType,
  HandSide,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { GridMode, GridLocation } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";

const mk = (step: number | null): StepData =>
  ({
    id: `b${step}`,
    letter: null,
    gridMode: GridMode.DIAMOND,
    startPlacement: null,
    endPlacement: null,
    motions: {
      left: createMotionData({
        motionType: MotionType.PRO,
        startLocation: GridLocation.SOUTH,
        endLocation: GridLocation.NORTH,
        hand: HandSide.LEFT,
      }),
      right: createMotionData({
        motionType: MotionType.PRO,
        startLocation: GridLocation.NORTH,
        endLocation: GridLocation.EAST,
        hand: HandSide.RIGHT,
      }),
    },
    stepNumber: step,
    duration: 1,
    leftReversal: false,
    rightReversal: false,
    isBlank: false,
  }) as unknown as StepData;

describe("stripToSequence", () => {
  it("splits the start box out of steps and renumbers steps 1..N", () => {
    const seq = stripToSequence([mk(0), mk(1), mk(2)], { word: "α→γ" });
    expect(seq.steps).toHaveLength(2);
    expect(seq.steps.map((s) => s.stepNumber)).toEqual([1, 2]);
    expect(seq.startPlacement).toBeTruthy();
    expect((seq.startPlacement as { isStartPlacement?: boolean }).isStartPlacement).toBe(true);
    expect(seq.word).toBe("α→γ");
    expect(seq.gridMode).toBe(GridMode.DIAMOND);
  });

  it("handles a strip with no explicit start box (all steps)", () => {
    const seq = stripToSequence([mk(1), mk(2)]);
    expect(seq.steps).toHaveLength(2);
    expect(seq.startPlacement).toBeUndefined();
  });
});
