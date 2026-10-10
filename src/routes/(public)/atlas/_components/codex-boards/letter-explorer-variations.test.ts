import { describe, expect, it, vi } from "vitest";
import { createMotionData } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
import {
  HandSide,
  MotionType,
  RotationDirection,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";

vi.mock("#lib/shared/pictograph/prop/services/orientation-calculator.js", () => ({
  calculateEndOrientation: (motion: { turns: number | "fl" }) =>
    motion.turns === 0 || motion.turns === "fl" ? "in" : "out",
}));

import {
  applyTurnsToVariations,
  motionAllowsFloat,
} from "./letter-explorer-variations";

const CW = RotationDirection.CLOCKWISE;
const CCW = RotationDirection.COUNTER_CLOCKWISE;

function variation(
  letter: "Z-",
  leftType: MotionType,
  rightType: MotionType
): PictographData {
  return {
    letter,
    motions: {
      left: createMotionData({
        motionType: leftType,
        rotationDirection:
          leftType === MotionType.DASH ? RotationDirection.NO_ROTATION : CW,
        turns: 0,
        startOrientation: "in",
        endOrientation: "in",
        startLocation: "n",
        endLocation: "s",
      }),
      right: createMotionData({
        motionType: rightType,
        rotationDirection:
          rightType === MotionType.DASH ? RotationDirection.NO_ROTATION : CCW,
        turns: 0,
        startOrientation: "out",
        endOrientation: "out",
        startLocation: "e",
        endLocation: "w",
      }),
    },
  } as unknown as PictographData;
}

describe("applyTurnsToVariations", () => {
  it("applies the family turn state to every related pictograph", () => {
    const inputs = [
      variation("Z-", MotionType.DASH, MotionType.ANTI),
      variation("Z-", MotionType.ANTI, MotionType.DASH),
    ];

    const results = applyTurnsToVariations(inputs, 1, 2, CW, CCW);

    expect(results).toHaveLength(2);
    expect(results.map((result) => result.motions.left?.turns)).toEqual([1, 1]);
    expect(results.map((result) => result.motions.right?.turns)).toEqual([2, 2]);
    expect(results[0]?.motions.left?.rotationDirection).toBe(CW);
    expect(results[1]?.motions.right?.rotationDirection).toBe(CCW);
    expect(inputs[0]?.motions.left?.turns).toBe(0);
    expect(inputs[1]?.motions.right?.turns).toBe(0);
  });

  it("uses the selected hand motion to decide whether float is available", () => {
    const input = variation("Z-", MotionType.DASH, MotionType.ANTI);

    expect(motionAllowsFloat(input, HandSide.LEFT)).toBe(false);
    expect(motionAllowsFloat(input, HandSide.RIGHT)).toBe(true);
  });
});
