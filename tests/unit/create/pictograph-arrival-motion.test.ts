import { describe, expect, it } from "vitest";
import {
  getPictographArrivalPropMotionDurationMs,
  PICTOGRAPH_ARRIVAL_PROP_MOTION_MAX_MS,
  PICTOGRAPH_ARRIVAL_PROP_MOTION_MIN_MS,
} from "#lib/features/create/shared/workspace-panel/sequence-display/domain/pictograph-arrival-motion.js";
import { createStepData } from "#lib/shared/foundation/domain/factories/create-step-data.js";
import { GridLocation } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import {
  HandSide,
  MotionType,
  RotationDirection,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import { createMotionData } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";

function staticSpin(color: HandSide, turns: number) {
  return createMotionData({
    hand: color,
    motionType: MotionType.STATIC,
    rotationDirection: RotationDirection.CLOCKWISE,
    turns,
  });
}

describe("pictograph arrival prop timing", () => {
  it("keeps ordinary motions on the readable 850ms floor", () => {
    const step = createStepData({
      motions: {
        left: staticSpin(HandSide.LEFT, 1),
        right: staticSpin(HandSide.RIGHT, 0),
      },
    });

    expect(getPictographArrivalPropMotionDurationMs(step)).toBe(
      PICTOGRAPH_ARRIVAL_PROP_MOTION_MIN_MS
    );
  });

  it("extends the shared clock for the prop with the larger effective rotation", () => {
    const step = createStepData({
      motions: {
        left: staticSpin(HandSide.LEFT, 2),
        right: staticSpin(HandSide.RIGHT, 3),
      },
    });

    expect(getPictographArrivalPropMotionDurationMs(step)).toBe(1500);
  });

  it("includes a shift's base rotation instead of timing from turns alone", () => {
    const step = createStepData({
      motions: {
        left: createMotionData({
          hand: HandSide.LEFT,
          motionType: MotionType.PRO,
          rotationDirection: RotationDirection.CLOCKWISE,
          startLocation: GridLocation.NORTH,
          endLocation: GridLocation.EAST,
          turns: 3,
        }),
      },
    });

    expect(getPictographArrivalPropMotionDurationMs(step)).toBe(1750);
  });

  it("caps extreme imported motion data at two seconds", () => {
    const step = createStepData({
      motions: { left: staticSpin(HandSide.LEFT, 10) },
    });

    expect(getPictographArrivalPropMotionDurationMs(step)).toBe(
      PICTOGRAPH_ARRIVAL_PROP_MOTION_MAX_MS
    );
  });
});
