import { describe, it, expect } from "vitest";
import { arrowLocationCalculator } from "#lib/shared/pictograph/arrow/positioning/calculation/services/arrow-location-calculator.js";
import { createMotionData } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
import { GridLocation } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import {
  MotionType,
  Orientation,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";

const HALF = { t0: 0, t1: 0.5 };

describe("ArrowLocationCalculator — segment branch returns the halfway location", () => {
  it("PRO E→S half → SE (the halfway hand location, carried in endLocation)", () => {
    const m = createMotionData({
      motionType: MotionType.PRO,
      startLocation: GridLocation.EAST,
      endLocation: GridLocation.SOUTHEAST,
      startOrientation: Orientation.IN,
      segment: HALF,
    });
    expect(arrowLocationCalculator.calculateLocation(m)).toBe(GridLocation.SOUTHEAST);
  });

  it("DASH S→N half → C (center), not routed through dash-location-calculator", () => {
    const m = createMotionData({
      motionType: MotionType.DASH,
      startLocation: GridLocation.SOUTH,
      endLocation: GridLocation.CENTER,
      startOrientation: Orientation.IN,
      segment: HALF,
    });
    // No pictographData passed — the segment branch must short-circuit BEFORE the
    // dash case (which throws/requires pictographData).
    expect(arrowLocationCalculator.calculateLocation(m)).toBe(GridLocation.CENTER);
  });

  it("does NOT affect a full (non-segment) shift", () => {
    const m = createMotionData({
      motionType: MotionType.PRO,
      startLocation: GridLocation.EAST,
      endLocation: GridLocation.SOUTH,
      startOrientation: Orientation.IN,
    });
    expect(arrowLocationCalculator.calculateLocation(m)).toBe(GridLocation.SOUTHEAST);
  });
});
