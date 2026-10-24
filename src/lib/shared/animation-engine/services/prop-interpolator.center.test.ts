import { describe, expect, it } from "vitest";
import {
  calculateInitialAngles,
  interpolatePropAngles,
} from "./prop-interpolator";
import { createMotionData } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";
import { GridLocation } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import {
  MotionType,
  Orientation,
  RotationDirection,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";

// Center is radius 0 at the grid origin (spec 2026-10-22, gap 10). Before,
// LOCATION_ANGLES[CENTER] = 0 was read as a rim angle, so a hand "at center"
// was drawn on the rim at East.

function step(
  motionType: MotionType,
  startLocation: GridLocation,
  endLocation: GridLocation,
  pathShape?: "arc" | "linear" | "concave"
): StepData {
  const motion = createMotionData({
    motionType,
    rotationDirection: RotationDirection.CLOCKWISE,
    startLocation,
    endLocation,
    startOrientation: Orientation.IN,
    endOrientation: Orientation.IN,
    pathShape,
  });
  return { motions: { left: motion, right: motion } } as unknown as StepData;
}

function handAt(stepData: StepData, t: number) {
  const angles = interpolatePropAngles(stepData, t).leftAngles!;
  return {
    angle: angles.centerPathAngle,
    x: angles.x ?? Math.cos(angles.centerPathAngle),
    y: angles.y ?? Math.sin(angles.centerPathAngle),
  };
}

describe("2D interpolator at center", () => {
  it("holds a hand that stays at center on the grid origin", () => {
    const still = step(
      MotionType.STATIC,
      GridLocation.CENTER,
      GridLocation.CENTER
    );
    for (const t of [0, 0.5, 1]) {
      const hand = handAt(still, t);
      expect(Math.hypot(hand.x, hand.y)).toBeCloseTo(0, 12);
    }
    const initial = calculateInitialAngles(still).leftAngles!;
    expect(Math.hypot(initial.x!, initial.y!)).toBeCloseTo(0, 12);
  });

  it("runs a hash in along the straight segment, not the rim", () => {
    // Even with an arc path shape asked for, a center end is a straight line.
    for (const hashIn of [
      step(MotionType.DASH, GridLocation.NORTH, GridLocation.CENTER),
      step(MotionType.PRO, GridLocation.NORTH, GridLocation.CENTER, "arc"),
    ]) {
      const mid = handAt(hashIn, 0.5);
      // North is (0, -1) on the canvas-Y-down unit grid; center is (0, 0).
      expect(mid.x).toBeCloseTo(0, 12);
      expect(mid.y).toBeCloseTo(-0.5, 12);
      expect(Math.hypot(mid.x, mid.y)).toBeCloseTo(0.5, 12);
      expect(mid.angle).toBeCloseTo(-Math.PI / 2, 12);

      const end = handAt(hashIn, 1);
      expect(Math.hypot(end.x, end.y)).toBeCloseTo(0, 12);
    }
  });

  it("runs a hash out from the origin along its rim end's ray", () => {
    const hashOut = step(
      MotionType.DASH,
      GridLocation.CENTER,
      GridLocation.SOUTH
    );
    const start = handAt(hashOut, 0);
    expect(Math.hypot(start.x, start.y)).toBeCloseTo(0, 12);
    expect(start.angle).toBeCloseTo(Math.PI / 2, 12);
    const quarter = handAt(hashOut, 0.25);
    expect(quarter.x).toBeCloseTo(0, 12);
    expect(quarter.y).toBeCloseTo(0.25, 12);
    const initial = calculateInitialAngles(hashOut).leftAngles!;
    expect(Math.hypot(initial.x!, initial.y!)).toBeCloseTo(0, 12);
  });

  it("leaves perimeter motions exactly where the code put them before", () => {
    // Pinned from the interpolator before the center change.
    const pro = interpolatePropAngles(
      step(MotionType.PRO, GridLocation.NORTH, GridLocation.EAST),
      0.5
    ).leftAngles!;
    expect(pro).toEqual({
      centerPathAngle: 5.497787143782138,
      staffRotationAngle: 2.356194490192345,
    });

    const dash = interpolatePropAngles(
      step(MotionType.DASH, GridLocation.NORTH, GridLocation.SOUTH),
      0.25
    ).leftAngles!;
    expect(dash).toEqual({
      centerPathAngle: -1.5707963267948966,
      staffRotationAngle: 2.356194490192345,
      x: 6.123233995736766e-17,
      y: -0.5,
    });

    expect(
      calculateInitialAngles(
        step(MotionType.PRO, GridLocation.NORTH, GridLocation.EAST)
      ).leftAngles
    ).toEqual({
      centerPathAngle: -1.5707963267948966,
      staffRotationAngle: 1.5707963267948966,
    });
  });
});
