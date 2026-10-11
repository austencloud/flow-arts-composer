import { describe, expect, it } from "vitest";
import { GridLocation } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import {
  Orientation,
  RotationDirection,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import { deriveBuilderMotionGeometry } from "./builder-motion-geometry";

describe("builder motion geometry", () => {
  it("keeps a float's absolute angle on the eight-point grid", () => {
    const geometry = deriveBuilderMotionGeometry(
      GridLocation.NORTH,
      GridLocation.NORTHEAST,
      Orientation.IN,
      RotationDirection.NO_ROTATION,
      -0.5
    );

    expect(geometry.staffRotationDelta).toBe(0);
  });

  it("still applies the base arc rotation to a zero-turn pro shift", () => {
    const geometry = deriveBuilderMotionGeometry(
      GridLocation.NORTH,
      GridLocation.NORTHEAST,
      Orientation.IN,
      RotationDirection.CLOCKWISE,
      0
    );

    expect(geometry.staffRotationDelta).toBeCloseTo(Math.PI / 4);
  });
});
