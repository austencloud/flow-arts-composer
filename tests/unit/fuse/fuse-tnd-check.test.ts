import { describe, expect, it } from "vitest";
import { checkFuseTnD } from "$lib/features/fuse/domain/fuse-tnd-check";
import { createSequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import { GridLocation } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import {
  MotionType,
  RotationDirection,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { createMotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";

type Loc = GridLocation;

function shift(start: Loc, end: Loc) {
  return createMotionData({
    motionType: MotionType.PRO,
    rotationDirection: RotationDirection.CLOCKWISE,
    startLocation: start,
    endLocation: end,
    isVisible: true,
  });
}

function dash(start: Loc, end: Loc) {
  return createMotionData({
    motionType: MotionType.DASH,
    rotationDirection: RotationDirection.NO_ROTATION,
    startLocation: start,
    endLocation: end,
    isVisible: true,
  });
}

function step(
  stepNumber: number,
  left: ReturnType<typeof shift>,
  right: ReturnType<typeof shift>
): StepData {
  return {
    id: `s${stepNumber}`,
    stepNumber,
    letter: null,
    startPlacement: null,
    endPlacement: null,
    motions: { left, right },
    duration: 1,
    leftReversal: false,
    rightReversal: false,
    isBlank: false,
  };
}

const { NORTH: N, EAST: E, SOUTH: S, WEST: W } = GridLocation;

describe("checkFuseTnD", () => {
  it("passes when every beat carries the mode", () => {
    // Left N->E, right S->W: both cw, half a cycle apart. Split, same.
    const seq = createSequenceData({
      steps: [step(1, shift(N, E), shift(S, W)), step(2, shift(E, S), shift(W, N))],
    });
    expect(checkFuseTnD(seq, "SS")).toEqual({
      expected: "SS",
      firstMismatchBeat: null,
      undefinedBeats: [],
    });
  });

  it("lists dash beats as undefined, not mismatches", () => {
    const seq = createSequenceData({
      steps: [step(1, shift(N, E), shift(S, W)), step(2, dash(E, W), dash(W, E))],
    });
    expect(checkFuseTnD(seq, "SS")).toEqual({
      expected: "SS",
      firstMismatchBeat: null,
      undefinedBeats: [2],
    });
  });

  it("reports the first beat that breaks the mode, 1-based", () => {
    // Beat 2: left E->S cw, right E->S cw: together, same. Not SS.
    const seq = createSequenceData({
      steps: [
        step(1, shift(N, E), shift(S, W)),
        step(2, shift(E, S), shift(E, S)),
        step(3, shift(S, W), shift(S, W)),
      ],
    });
    expect(checkFuseTnD(seq, "SS").firstMismatchBeat).toBe(2);
  });

  it("returns a null mismatch for an empty sequence", () => {
    expect(checkFuseTnD(createSequenceData({ steps: [] }), "TO")).toEqual({
      expected: "TO",
      firstMismatchBeat: null,
      undefinedBeats: [],
    });
  });
});
