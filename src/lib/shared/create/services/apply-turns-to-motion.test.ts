import { describe, it, expect, vi } from "vitest";
import { createMotionData } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
import {
  MotionType,
  RotationDirection,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";

// Deterministic orientation: "in" at 0 turns, "out" otherwise — lets us assert
// that turns flow through to an end-orientation recompute.
vi.mock("#lib/shared/pictograph/prop/services/orientation-calculator.js", () => ({
  calculateEndOrientation: (m: { turns: number | "fl" }) =>
    m.turns === 0 || m.turns === "fl" ? "in" : "out",
}));

import { applyPendingTurnsToOption } from "./apply-turns-to-motion";

const CW = RotationDirection.CLOCKWISE;
const CCW = RotationDirection.COUNTER_CLOCKWISE;
const NONE = RotationDirection.NO_ROTATION;

function makeMotionOption(
  leftType: MotionType,
  rightType: MotionType
): PictographData {
  return {
    letter: "X",
    motions: {
      left: createMotionData({
        motionType: leftType,
        rotationDirection:
          leftType === MotionType.PRO ? CW : NONE,
        turns: 0,
        startOrientation: "in",
        endOrientation: "in",
        startLocation: "n",
        endLocation: "s",
      }),
      right: createMotionData({
        motionType: rightType,
        rotationDirection:
          rightType === MotionType.PRO ? CCW : NONE,
        turns: 0,
        startOrientation: "in",
        endOrientation: "in",
        startLocation: "e",
        endLocation: "w",
      }),
    },
  } as unknown as PictographData;
}

describe("applyPendingTurnsToOption", () => {
  it("applies turns per hand and recomputes end orientation", () => {
    const opt = makeMotionOption(MotionType.PRO, MotionType.PRO);
    const result = applyPendingTurnsToOption(opt, 1, 0, CW, CW);
    expect(result.motions.left!.turns).toBe(1);
    expect(result.motions.left!.endOrientation).toBe("out");
    expect(result.motions.right!.turns).toBe(0);
    expect(result.motions.right!.endOrientation).toBe("in");
  });

  it("returns a new object and does not mutate the input", () => {
    const opt = makeMotionOption(MotionType.PRO, MotionType.PRO);
    const result = applyPendingTurnsToOption(opt, 1, 1, CW, CW);
    expect(result).not.toBe(opt);
    expect(opt.motions.left!.turns).toBe(0);
  });

  it("returns the option unchanged when a motion is missing", () => {
    const input = { letter: "A", motions: { left: undefined, right: undefined } } as unknown as PictographData;
    expect(applyPendingTurnsToOption(input, 1, 1, CW, CW)).toBe(input);
  });

  it("applies the chosen spin direction to a dash/static hand with turns", () => {
    const opt = makeMotionOption(MotionType.STATIC, MotionType.DASH);
    const cw = applyPendingTurnsToOption(opt, 1, 1, CW, CW);
    expect(cw.motions.left!.rotationDirection).toBe(CW);
    expect(cw.motions.right!.rotationDirection).toBe(CW);

    const ccw = applyPendingTurnsToOption(opt, 1, 1, CCW, CCW);
    expect(ccw.motions.left!.rotationDirection).toBe(CCW);
    expect(ccw.motions.right!.rotationDirection).toBe(CCW);
  });

  it("leaves a shift hand's intrinsic direction alone (override ignored)", () => {
    const opt = makeMotionOption(MotionType.PRO, MotionType.STATIC);
    // blue is a shift (intrinsic CW); passing CCW must not flip it
    const result = applyPendingTurnsToOption(opt, 1, 1, CCW, CCW);
    expect(result.motions.left!.rotationDirection).toBe(CW);
    expect(result.motions.right!.rotationDirection).toBe(CCW);
  });

  it("a dash/static hand at 0 turns stays at no-rotation regardless of direction", () => {
    const opt = makeMotionOption(MotionType.STATIC, MotionType.STATIC);
    const result = applyPendingTurnsToOption(opt, 0, 0, CW, CW);
    expect(result.motions.left!.rotationDirection).toBe(NONE);
    expect(result.motions.right!.rotationDirection).toBe(NONE);
  });
});
