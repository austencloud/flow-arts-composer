import { describe, expect, it } from "vitest";
import { GridLocation } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import {
  staticRadialClockwiseMap,
  staticRadialOverrideMap,
} from "#lib/shared/pictograph/arrow/positioning/calculation/config/static-rotation-maps.js";

function normalizeDegrees(angle: number): number {
  return ((angle % 360) + 360) % 360;
}

describe("staticRadialOverrideMap", () => {
  it("points every radial override arrow opposite the normal static radial angle", () => {
    const locations = [
      GridLocation.NORTH,
      GridLocation.EAST,
      GridLocation.SOUTH,
      GridLocation.WEST,
      GridLocation.NORTHEAST,
      GridLocation.SOUTHEAST,
      GridLocation.SOUTHWEST,
      GridLocation.NORTHWEST,
    ];

    for (const location of locations) {
      const expected = normalizeDegrees(
        staticRadialClockwiseMap[location] + 180
      );

      expect(staticRadialOverrideMap[location].cw).toBe(expected);
      expect(staticRadialOverrideMap[location].ccw).toBe(expected);
    }
  });
});
