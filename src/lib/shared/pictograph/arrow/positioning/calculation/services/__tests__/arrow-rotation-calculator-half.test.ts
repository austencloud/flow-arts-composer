import { describe, it, expect } from "vitest";
import { arrowRotationCalculator } from "#lib/shared/pictograph/arrow/positioning/calculation/services/arrow-rotation-calculator.js";
import { calculateSegmentRotation } from "#lib/shared/pictograph/arrow/positioning/calculation/services/segment-rotation.js";
import { createMotionData } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
import { GridLocation } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import {
  MotionType,
  Orientation,
  RotationDirection,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
// Routes are not under `#lib` — relative import. __tests__ sits 8 levels below
// src/ (lib/shared/pictograph/arrow/positioning/calculation/services/__tests__),
// so 8 "../" reaches src/, then descend into routes/.
import { poseAt, type HalfwayMotion } from "../../../../../../../../routes/(public)/guide/level-2/_data/halfway-pose";
import { calculateOrientationAt } from "#lib/shared/animation-engine/services/orientation-at.js";

const HALF = { t0: 0, t1: 0.5 };

describe("ArrowRotationCalculator — segment branch derives rotation from the halfway orientation", () => {
  it("routes a segment motion to the pure segment-rotation helper", async () => {
    const m = createMotionData({
      motionType: MotionType.PRO,
      rotationDirection: RotationDirection.CLOCKWISE,
      startLocation: GridLocation.EAST,
      endLocation: GridLocation.SOUTHEAST,
      startOrientation: Orientation.IN,
      endOrientation: Orientation.CLOCK,
      turns: 1,
      segment: HALF,
    });
    const actual = await arrowRotationCalculator.calculateRotation(m, GridLocation.SOUTHEAST);
    const expected = calculateSegmentRotation(Orientation.CLOCK, GridLocation.SOUTHEAST, GridLocation.EAST);
    expect(actual).toBeCloseTo(expected, 6);
  });

  it("a full (non-segment) pro motion still uses the pro rotation map (unchanged)", async () => {
    const m = createMotionData({
      motionType: MotionType.PRO,
      rotationDirection: RotationDirection.CLOCKWISE,
      startLocation: GridLocation.EAST,
      endLocation: GridLocation.SOUTH,
      startOrientation: Orientation.IN,
      turns: 1,
    });
    const seg = await arrowRotationCalculator.calculateRotation(
      { ...m, segment: HALF, endOrientation: Orientation.CLOCK },
      GridLocation.SOUTHEAST
    );
    const full = await arrowRotationCalculator.calculateRotation(m, GridLocation.SOUTHEAST);
    expect(seg).not.toBe(full);
  });
});

describe("segment rotation matches the guide's physical halfway staff angle (oracle)", () => {
  it("PRO E→S t=1 halfway: helper rotation ≈ poseAt(.,0.5).deg (mod 360)", () => {
    // Same physical motion (PRO, E→S, cw, IN→IN, 1 turn), expressed once per
    // callee's own field names — OrientationAtInput uses motionType/startLocation/
    // rotationDirection/startOrientation; HalfwayMotion uses type/from/rot/startOri.
    const orientationInput = {
      motionType: MotionType.PRO,
      rotationDirection: RotationDirection.CLOCKWISE,
      startLocation: GridLocation.EAST,
      endLocation: GridLocation.SOUTH,
      startOrientation: Orientation.IN,
      endOrientation: Orientation.IN,
      turns: 1,
    };
    const halfwayMotion: HalfwayMotion = {
      type: MotionType.PRO,
      from: GridLocation.EAST,
      to: GridLocation.SOUTH,
      rot: RotationDirection.CLOCKWISE,
      startOri: Orientation.IN,
      endOri: Orientation.IN,
      turns: 1,
    };

    const halfwayOri = calculateOrientationAt(orientationInput, 0.5)!;
    const helperDeg = calculateSegmentRotation(
      halfwayOri,
      GridLocation.SOUTHEAST,
      GridLocation.EAST
    );
    const poseDeg = ((poseAt(halfwayMotion, 0.5).deg % 360) + 360) % 360;

    // eslint-disable-next-line no-console -- calibration evidence, not app logging
    console.log(`[oracle] halfwayOri=${halfwayOri} helperDeg=${helperDeg} poseDeg=${poseDeg}`);

    expect(Math.abs(((helperDeg - poseDeg + 540) % 360) - 180)).toBeLessThan(1);
  });
});
