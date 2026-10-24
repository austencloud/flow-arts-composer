import { describe, expect, it } from "vitest";
import { Plane } from "@austencloud/scene-3d";
import { calculatePropState } from "./prop-state-interpolator";
import type { MotionConfig3D } from "../domain/models/motion-data-3d";
import { GridLocation } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import {
  MotionType,
  Orientation,
  RotationDirection,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";

// Center is radius 0 at the grid origin (spec 2026-10-22, gap 10). Before,
// LOCATION_ANGLES[CENTER] = 0 was read as a rim angle, so a hand "at center"
// was drawn on the rim at East.

function config(
  motionType: MotionType,
  startLocation: GridLocation,
  endLocation: GridLocation,
  plane: Plane = Plane.WALL
): MotionConfig3D {
  return {
    plane,
    startLocation,
    endLocation,
    motionType,
    rotationDirection: RotationDirection.CLOCKWISE,
    turns: 0,
    startOrientation: Orientation.IN,
    endOrientation: Orientation.IN,
  };
}

describe("3D interpolator at center", () => {
  it("holds a hand that stays at center on the grid origin in every plane", () => {
    for (const plane of [Plane.WALL, Plane.WHEEL, Plane.FLOOR]) {
      const still = config(
        MotionType.STATIC,
        GridLocation.CENTER,
        GridLocation.CENTER,
        plane
      );
      for (const t of [0, 0.5, 1]) {
        expect(calculatePropState(still, t).worldPosition.length()).toBeCloseTo(
          0,
          12
        );
      }
    }
  });

  it("runs a hash in along the straight segment, not the rim", () => {
    for (const motionType of [MotionType.DASH, MotionType.PRO]) {
      const hashIn = config(
        motionType,
        GridLocation.NORTH,
        GridLocation.CENTER
      );
      // The default hand distance is 0.52 m; north on the wall is +Y.
      const mid = calculatePropState(hashIn, 0.5).worldPosition;
      expect(mid.x).toBeCloseTo(0, 12);
      expect(mid.y).toBeCloseTo(0.26, 12);
      expect(mid.z).toBeCloseTo(0, 12);
      expect(calculatePropState(hashIn, 1).worldPosition.length()).toBeCloseTo(
        0,
        12
      );
    }
  });

  it("runs a hash out from the origin", () => {
    const hashOut = config(
      MotionType.DASH,
      GridLocation.CENTER,
      GridLocation.EAST
    );
    expect(calculatePropState(hashOut, 0).worldPosition.length()).toBeCloseTo(
      0,
      12
    );
    // East on the wall is -X (see planeAngleToWorldPosition).
    const quarter = calculatePropState(hashOut, 0.25).worldPosition;
    expect(quarter.x).toBeCloseTo(-0.13, 12);
    expect(quarter.y).toBeCloseTo(0, 12);
  });

  it("leaves perimeter motions exactly where the code put them before", () => {
    // Pinned from the interpolator before the center change.
    const state = calculatePropState(
      config(MotionType.PRO, GridLocation.NORTH, GridLocation.EAST),
      0.5
    );
    expect(state.centerPathAngle).toBe(5.497787143782138);
    expect(state.staffRotationAngle).toBe(2.356194490192345);
    expect(state.worldPosition.toArray()).toEqual([
      -0.36769552621700463, 0.3676955262170048, 0,
    ]);
  });
});
