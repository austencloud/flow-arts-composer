import { describe, expect, it } from "vitest";
import { createStartPlacementData } from "#lib/shared/create/factories/create-start-placement-data.js";
import { createSoloProp } from "#lib/shared/foundation/services/solo-prop-factory.js";
import { soloPropToSequence } from "#lib/shared/foundation/services/solo-prop-sequence-adapter.js";
import {
  GridLocation,
  GridMode,
} from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import {
  MotionType,
  Orientation,
  RotationDirection,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";

describe("solo start grid preservation", () => {
  it("copies an explicit Box grid in the start-placement factory", () => {
    expect(createStartPlacementData({ gridMode: GridMode.BOX }).gridMode).toBe(
      GridMode.BOX
    );
    expect(createStartPlacementData()).not.toHaveProperty("gridMode");
  });

  it.each(["left", "right"] as const)(
    "passes the solo Box grid into the %s start placement",
    (hand) => {
      const solo = createSoloProp(
        [
          {
            startLocation: GridLocation.NORTHWEST,
            endLocation: GridLocation.NORTHEAST,
            startOrientation: Orientation.OUT,
            endOrientation: Orientation.OUT,
            motionType: MotionType.PRO,
            rotationDirection: RotationDirection.CLOCKWISE,
            turns: 1,
            duration: 1,
          },
        ],
        GridLocation.NORTHWEST,
        Orientation.OUT
      );
      expect(solo.impliedGridMode).toBe(GridMode.BOX);
      const sequence = soloPropToSequence(solo, hand);
      expect(sequence.gridMode).toBe(GridMode.BOX);
      expect(sequence.startPlacement?.gridMode).toBe(GridMode.BOX);
      expect(sequence.startingPlacement?.gridMode).toBe(GridMode.BOX);
      expect(sequence.startPlacement?.motions[hand]?.gridMode).toBe(
        GridMode.BOX
      );
      expect(sequence.steps[0]?.gridMode).toBe(GridMode.BOX);
    }
  );
});
