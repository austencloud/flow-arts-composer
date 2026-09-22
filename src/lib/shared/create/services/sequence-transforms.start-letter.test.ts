import { describe, it, expect } from "vitest";
import {
  createStartPlacementFromBeatStart,
  createStartPlacementFromStepEnd,
} from "./sequence-transforms";
import { createStepData } from "$lib/shared/foundation/domain/factories/create-step-data";
import { createMotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import { HandSide } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import {
  GridLocation,
  GridPlacement,
} from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { Letter } from "$lib/shared/foundation/domain/models/letter";

function stepBetween(
  startPlacement: GridPlacement,
  endPlacement: GridPlacement
) {
  return createStepData({
    stepNumber: 1,
    startPlacement,
    endPlacement,
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

describe("static start letter derived from a grid placement", () => {
  it("letters a zeta end placement as ζ (skewed-frame start after a 45° rotation)", () => {
    const start = createStartPlacementFromStepEnd(
      stepBetween(GridPlacement.ALPHA1, GridPlacement.ZETA1)
    );
    expect(start.letter).toBe(Letter.ZETA);
  });

  it("letters an eta start placement as η", () => {
    const start = createStartPlacementFromBeatStart(
      stepBetween(GridPlacement.ETA1, GridPlacement.ZETA1)
    );
    expect(start.letter).toBe(Letter.ETA);
  });

  it("keeps α, β and γ for the pure placements", () => {
    expect(
      createStartPlacementFromStepEnd(
        stepBetween(GridPlacement.ALPHA1, GridPlacement.BETA1)
      ).letter
    ).toBe(Letter.BETA);
    expect(
      createStartPlacementFromBeatStart(
        stepBetween(GridPlacement.GAMMA1, GridPlacement.ALPHA1)
      ).letter
    ).toBe(Letter.GAMMA);
    expect(
      createStartPlacementFromBeatStart(
        stepBetween(GridPlacement.ALPHA1, GridPlacement.BETA1)
      ).letter
    ).toBe(Letter.ALPHA);
  });
});
