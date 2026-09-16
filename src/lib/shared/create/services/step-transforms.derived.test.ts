import { describe, it, expect } from "vitest";
import { rotateBeat } from "./step-transforms";
import { createStepData } from "$lib/shared/foundation/domain/factories/create-step-data";
import { createMotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import {
  HandSide,
  MotionType,
  RotationDirection,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import {
  GridLocation,
  GridMode,
} from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { getGridPlacementFromLocations } from "$lib/shared/pictograph/grid/services/grid-placement-deriver";
import type { IMotionQueryHandler } from "$lib/shared/foundation/services/data/data-contracts";

const queryStub = {
  findLetterByMotionConfiguration: async () => null,
} as unknown as IMotionQueryHandler;

describe("single-hand rotateBeat reconciles placements", () => {
  it("recomputes startPlacement from the rotated blue location (no longer stale)", async () => {
    const s = createStepData({
      stepNumber: 1,
      motions: {
        [HandSide.LEFT]: createMotionData({
          hand: HandSide.LEFT,
          motionType: MotionType.PRO,
          rotationDirection: RotationDirection.CLOCKWISE,
          startLocation: GridLocation.NORTH,
          endLocation: GridLocation.EAST,
        }),
        [HandSide.RIGHT]: createMotionData({
          hand: HandSide.RIGHT,
          motionType: MotionType.PRO,
          rotationDirection: RotationDirection.CLOCKWISE,
          startLocation: GridLocation.SOUTH,
          endLocation: GridLocation.WEST,
        }),
      },
    });

    // Rotate ONLY the left hand by 1 step (45° CW) — placements must reflect the new pair.
    const out = await rotateBeat(s, 1, GridMode.DIAMOND, queryStub, "left");

    const left = out.motions[HandSide.LEFT]!;
    const right = out.motions[HandSide.RIGHT]!;
    expect(out.startPlacement).toBe(
      getGridPlacementFromLocations(left.startLocation, right.startLocation)
    );
    expect(out.endPlacement).toBe(
      getGridPlacementFromLocations(left.endLocation, right.endLocation)
    );
  });
});
