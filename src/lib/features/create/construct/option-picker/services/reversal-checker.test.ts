import { describe, it, expect } from "vitest";
import {
  countDirectionReversals,
  filterDirectionContinuousOptions,
  getReversalCount,
} from "./reversal-checker";
import { createMotionData } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
import {
  MotionType,
  RotationDirection,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";

function step(
  leftDir: RotationDirection,
  rightDir = RotationDirection.NO_ROTATION
): PictographData {
  return {
    letter: "X",
    motions: {
      left: createMotionData({
        motionType: MotionType.DASH,
        rotationDirection: leftDir,
        turns: leftDir === RotationDirection.NO_ROTATION ? 0 : 2,
      }),
      right: createMotionData({
        motionType: MotionType.DASH,
        rotationDirection: rightDir,
        turns: rightDir === RotationDirection.NO_ROTATION ? 0 : 2,
      }),
    },
  } as unknown as PictographData;
}

function floatStep(prefloatDirection: RotationDirection): PictographData {
  const motion = {
    ...createMotionData({
      motionType: MotionType.FLOAT,
      rotationDirection: RotationDirection.NO_ROTATION,
      turns: "fl",
    }),
    prefloatRotationDirection: prefloatDirection,
  };
  return {
    letter: "M",
    motions: {
      left: motion,
      right: createMotionData({
        motionType: MotionType.STATIC,
        rotationDirection: RotationDirection.NO_ROTATION,
        turns: 0,
      }),
    },
  } as unknown as PictographData;
}

describe("countDirectionReversals", () => {
  it("is 0 when there is no prior rotation context", () => {
    const option = step(RotationDirection.CLOCKWISE);
    expect(countDirectionReversals(option, [])).toBe(0);
  });

  it("is 0 when the spin direction continues the previous step", () => {
    const prev = step(RotationDirection.CLOCKWISE);
    const option = step(RotationDirection.CLOCKWISE);
    expect(countDirectionReversals(option, [prev])).toBe(0);
  });

  it("is 1 when the spin direction opposes the previous step (a reversal)", () => {
    const prev = step(RotationDirection.CLOCKWISE);
    const option = step(RotationDirection.COUNTER_CLOCKWISE);
    expect(countDirectionReversals(option, [prev])).toBe(1);
  });

  it("ignores turn magnitude — high turns alone are not a direction reversal", () => {
    // Both spin CW, but at 2 turns. The turns>1 heuristic in getReversalCount
    // would flag this; countDirectionReversals must not.
    const prev = step(RotationDirection.CLOCKWISE);
    const option = step(RotationDirection.CLOCKWISE);
    expect(countDirectionReversals(option, [prev])).toBe(0);
  });

  it("uses a float's preserved pre-float prop direction for continuity", () => {
    const prev = step(RotationDirection.CLOCKWISE);

    expect(
      countDirectionReversals(floatStep(RotationDirection.CLOCKWISE), [prev])
    ).toBe(0);
    expect(
      countDirectionReversals(floatStep(RotationDirection.COUNTER_CLOCKWISE), [
        prev,
      ])
    ).toBe(1);
    expect(
      getReversalCount(floatStep(RotationDirection.CLOCKWISE), [prev])
    ).toBe(0);
    expect(
      getReversalCount(floatStep(RotationDirection.COUNTER_CLOCKWISE), [prev])
    ).toBe(1);
  });
});

describe("filterDirectionContinuousOptions", () => {
  it("reports only the options hidden by direction continuity", () => {
    const previous = step(RotationDirection.CLOCKWISE);
    const matching = step(RotationDirection.CLOCKWISE);
    const reversing = step(RotationDirection.COUNTER_CLOCKWISE);

    const result = filterDirectionContinuousOptions(
      [matching, reversing],
      [previous]
    );

    expect(result.options).toEqual([matching]);
    expect(result.totalCount).toBe(2);
    expect(result.hiddenCount).toBe(1);
  });

  it("keeps every option when there is no prior direction context", () => {
    const options = [
      step(RotationDirection.CLOCKWISE),
      step(RotationDirection.COUNTER_CLOCKWISE),
    ];

    const result = filterDirectionContinuousOptions(options);

    expect(result.options).toEqual(options);
    expect(result.totalCount).toBe(2);
    expect(result.hiddenCount).toBe(0);
  });
});
