import { describe, expect, it } from "vitest";
import { gridPlacementDeriver } from "../../../src/core/placements/GridPlacementDeriver.js";
import { CENTRIC_PLACEMENT_LOCATIONS } from "../../../src/core/placements/centric-placement-locations.js";

const PERIMETER = ["n", "ne", "e", "se", "s", "sw", "w", "nw"];

describe("GridPlacementDeriver: tau and terra", () => {
  it("tau1-8 put blue at center and red at N, NE, E, SE, S, SW, W, NW", () => {
    PERIMETER.forEach((red, i) => {
      expect(
        gridPlacementDeriver.getGridLocationsFromPlacement(`tau${i + 1}`)
      ).toEqual(["c", red]);
    });
  });

  it("tau9-16 put red at center and blue at those same points", () => {
    PERIMETER.forEach((blue, i) => {
      expect(
        gridPlacementDeriver.getGridLocationsFromPlacement(`tau${i + 9}`)
      ).toEqual([blue, "c"]);
    });
  });

  it("terra1 puts both hands at center", () => {
    expect(
      gridPlacementDeriver.getGridLocationsFromPlacement("terra1")
    ).toEqual(["c", "c"]);
  });

  it("round-trips all 17 centric placements", () => {
    const names = Object.keys(CENTRIC_PLACEMENT_LOCATIONS);
    expect(names).toHaveLength(17);
    for (const name of names) {
      const [left, right] =
        gridPlacementDeriver.getGridLocationsFromPlacement(name);
      expect(
        gridPlacementDeriver.getGridPlacementFromLocations(left, right)
      ).toBe(name);
    }
  });

  it("round-trips every one of the 81 location pairs on the 9-point grid", () => {
    const all = ["c", ...PERIMETER];
    const seen = new Set<string>();
    for (const left of all) {
      for (const right of all) {
        const placement = gridPlacementDeriver.getGridPlacementFromLocations(
          left,
          right
        );
        expect(
          gridPlacementDeriver.getGridLocationsFromPlacement(placement)
        ).toEqual([left, right]);
        seen.add(placement);
      }
    }
    expect(seen.size).toBe(81);
  });
});
