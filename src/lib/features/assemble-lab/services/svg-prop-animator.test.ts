import { describe, expect, it } from "vitest";
import { GridLocation } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import {
  Orientation,
  RotationDirection,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { getBuilderMotionPathD } from "./svg-prop-animator";

describe("builder motion path preview", () => {
  it("uses the canvas center for a center-to-edge path", () => {
    const path = getBuilderMotionPathD({
      startLocation: GridLocation.CENTER,
      endLocation: GridLocation.EAST,
      startOrientation: Orientation.CENTER_E,
      rotationDirection: RotationDirection.CLOCKWISE,
      turnCount: 0,
    });

    expect(path).toMatch(/^M475,475 /);
    expect(path).toContain("L618.1,475");
  });

  it("does not draw a fake route for a static destination", () => {
    expect(
      getBuilderMotionPathD({
        startLocation: GridLocation.NORTH,
        endLocation: GridLocation.NORTH,
        startOrientation: Orientation.IN,
        rotationDirection: RotationDirection.CLOCKWISE,
        turnCount: 0,
      })
    ).toBeNull();
  });
});
