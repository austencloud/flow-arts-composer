import { describe, it, expect } from "vitest";
import { rotateStartPlacement } from "./start-placement-transforms";
import { createStartPlacementData } from "$lib/shared/create/factories/create-start-placement-data";
import { createMotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import { HandSide } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import {
  GridLocation,
  GridPlacement,
} from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { Letter } from "$lib/shared/foundation/domain/models/letter";

function staticStart(
  placement: GridPlacement,
  left: GridLocation,
  right: GridLocation
) {
  return createStartPlacementData({
    gridPlacement: placement,
    startPlacement: placement,
    letter: null,
    motions: {
      [HandSide.LEFT]: createMotionData({
        hand: HandSide.LEFT,
        startLocation: left,
        endLocation: left,
      }),
      [HandSide.RIGHT]: createMotionData({
        hand: HandSide.RIGHT,
        startLocation: right,
        endLocation: right,
      }),
    },
  });
}

describe("rotateStartPlacement letters the skewed-frame starts", () => {
  it("alpha start with only the left hand rotated 45° lands on zeta and reads ζ", () => {
    const rotated = rotateStartPlacement(
      staticStart(GridPlacement.ALPHA1, GridLocation.SOUTH, GridLocation.NORTH),
      1,
      "left"
    );
    expect(String(rotated.gridPlacement)).toMatch(/^zeta/);
    expect(rotated.letter).toBe(Letter.ZETA);
  });

  it("beta start with only the left hand rotated 45° lands on eta and reads η", () => {
    const rotated = rotateStartPlacement(
      staticStart(GridPlacement.BETA1, GridLocation.NORTH, GridLocation.NORTH),
      1,
      "left"
    );
    expect(String(rotated.gridPlacement)).toMatch(/^eta/);
    expect(rotated.letter).toBe(Letter.ETA);
  });

  it("rotating both hands keeps the pure frame and its letter", () => {
    const rotated = rotateStartPlacement(
      staticStart(GridPlacement.ALPHA1, GridLocation.SOUTH, GridLocation.NORTH),
      1,
      "both"
    );
    expect(String(rotated.gridPlacement)).toMatch(/^alpha/);
    expect(rotated.letter).toBe(Letter.ALPHA);
  });
});
