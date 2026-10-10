import { describe, it, expect } from "vitest";
import { notationToPictographData } from "./notation-to-pictograph";
import {
  MotionType,
  RotationDirection,
  Orientation,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import {
  GridLocation,
  GridMode,
} from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import type { StaffMotionNotation } from "../domain/notation-3d";

function note(over: Partial<StaffMotionNotation>): StaffMotionNotation {
  return {
    hand: "left",
    startLocation: "n",
    endLocation: "e",
    handMotion: "shift",
    motionType: MotionType.PRO,
    rotationDirection: RotationDirection.NO_ROTATION,
    turns: 0,
    startOrientation: Orientation.OUT,
    endOrientation: Orientation.OUT,
    confidence: 1,
    ...over,
  };
}

describe("notationToPictographData", () => {
  it("builds left+right motions with mapped enums and locations", () => {
    const left = note({ hand: "left", startLocation: "n", endLocation: "e" });
    const right = note({
      hand: "right",
      startLocation: "s",
      endLocation: "w",
      motionType: MotionType.ANTI,
    });
    const pd = notationToPictographData(left, right, "beat-1");

    expect(pd.id).toBe("beat-1");
    expect(pd.motions.left!.motionType).toBe(MotionType.PRO);
    expect(pd.motions.left!.startLocation).toBe(GridLocation.NORTH);
    expect(pd.motions.left!.endLocation).toBe(GridLocation.EAST);
    expect(pd.motions.right!.motionType).toBe(MotionType.ANTI);
    expect(pd.motions.right!.startLocation).toBe(GridLocation.SOUTH);
  });

  it("derives diamond grid mode for cardinal locations", () => {
    const pd = notationToPictographData(
      note({ startLocation: "n", endLocation: "e" }),
      note({ hand: "right", startLocation: "s", endLocation: "w" }),
      "b"
    );
    expect(pd.gridMode).toBe(GridMode.DIAMOND);
  });

  it("derives box grid mode for intercardinal locations", () => {
    const pd = notationToPictographData(
      note({ startLocation: "ne", endLocation: "se" }),
      note({ hand: "right", startLocation: "sw", endLocation: "nw" }),
      "b"
    );
    expect(pd.gridMode).toBe(GridMode.BOX);
  });

  it('float maps to turns "fl"', () => {
    const pd = notationToPictographData(
      note({ motionType: MotionType.FLOAT, turns: 0 }),
      note({ hand: "right" }),
      "b"
    );
    expect(pd.motions.left!.turns).toBe("fl");
  });
});
