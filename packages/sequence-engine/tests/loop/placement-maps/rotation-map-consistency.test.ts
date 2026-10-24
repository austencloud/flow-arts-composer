/**
 * The rotation placement maps agree with each other and with the location maps.
 *
 * The half map used to send tau1 to tau9, which swaps which hand is at center
 * (the swap map's job) instead of rotating 180 degrees. Gap 12 of
 * docs/superpowers/specs/2026-10-22-center-point-beyond-level-3.md.
 */

import { describe, expect, it } from "vitest";
import { gridPlacementDeriver } from "../../../src/core/placements/GridPlacementDeriver.js";
import {
  HALF_PLACEMENT_MAP,
  LOCATION_MAP_CLOCKWISE,
  LOCATION_MAP_COUNTER_CLOCKWISE,
  LOCATION_MAP_DASH,
  QUARTER_PLACEMENT_MAP_CCW,
  QUARTER_PLACEMENT_MAP_CW,
} from "../../../src/loop/placement-maps/circular-placement-maps.js";
import {
  HORIZONTAL_MIRROR_PLACEMENT_MAP,
  SWAPPED_PLACEMENT_MAP,
  VERTICAL_MIRROR_PLACEMENT_MAP,
} from "../../../src/loop/placement-maps/strict-loop-placement-maps.js";

const LOCATIONS = ["c", "n", "ne", "e", "se", "s", "sw", "w", "nw"];

// Every placement on the 9-point grid: alpha, beta, gamma, zeta, eta, tau, terra.
const ALL_PLACEMENTS = LOCATIONS.flatMap((left) =>
  LOCATIONS.map((right) =>
    gridPlacementDeriver.getGridPlacementFromLocations(left, right)
  )
);

const CENTRIC = ALL_PLACEMENTS.filter(
  (p) => p.startsWith("tau") || p.startsWith("terra")
);

function rotateByLocations(
  placement: string,
  locationMap: Record<string, string>
): string {
  const [left, right] =
    gridPlacementDeriver.getGridLocationsFromPlacement(placement);
  return gridPlacementDeriver.getGridPlacementFromLocations(
    locationMap[left]!,
    locationMap[right]!
  );
}

describe("rotation placement maps", () => {
  it("cover all 81 placements", () => {
    expect(new Set(ALL_PLACEMENTS).size).toBe(81);
    for (const p of ALL_PLACEMENTS) {
      expect(HALF_PLACEMENT_MAP[p], p).toBeDefined();
      expect(QUARTER_PLACEMENT_MAP_CW[p], p).toBeDefined();
      expect(QUARTER_PLACEMENT_MAP_CCW[p], p).toBeDefined();
    }
  });

  it("half equals two quarter turns, in both directions", () => {
    for (const p of ALL_PLACEMENTS) {
      const cwTwice = QUARTER_PLACEMENT_MAP_CW[QUARTER_PLACEMENT_MAP_CW[p]!];
      const ccwTwice = QUARTER_PLACEMENT_MAP_CCW[QUARTER_PLACEMENT_MAP_CCW[p]!];
      expect(HALF_PLACEMENT_MAP[p], p).toBe(cwTwice);
      expect(HALF_PLACEMENT_MAP[p], p).toBe(ccwTwice);
    }
  });

  it("a clockwise quarter undoes a counter-clockwise one", () => {
    for (const p of ALL_PLACEMENTS) {
      expect(QUARTER_PLACEMENT_MAP_CW[QUARTER_PLACEMENT_MAP_CCW[p]!], p).toBe(
        p
      );
    }
  });

  it("each map matches rotating both hand locations", () => {
    for (const p of ALL_PLACEMENTS) {
      expect(HALF_PLACEMENT_MAP[p], p).toBe(
        rotateByLocations(p, LOCATION_MAP_DASH)
      );
      expect(QUARTER_PLACEMENT_MAP_CW[p], p).toBe(
        rotateByLocations(p, LOCATION_MAP_CLOCKWISE)
      );
      expect(QUARTER_PLACEMENT_MAP_CCW[p], p).toBe(
        rotateByLocations(p, LOCATION_MAP_COUNTER_CLOCKWISE)
      );
    }
  });

  it("a half turn keeps the center hand at center", () => {
    expect(HALF_PLACEMENT_MAP["tau1"]).toBe("tau5");
    expect(HALF_PLACEMENT_MAP["tau9"]).toBe("tau13");
    expect(HALF_PLACEMENT_MAP["terra1"]).toBe("terra1");
    // Moving the center role to the other hand is the swap map, not a rotation.
    expect(SWAPPED_PLACEMENT_MAP["tau1"]).toBe("tau9");
  });
});

describe("tau and terra reflection maps (placeholders)", () => {
  // Mirror and flip at center wait on Austen's spec. They are identity today;
  // this test fails on purpose when someone changes them, so the change is
  // made deliberately and this test updated with it.
  it("mirror and flip leave every centric placement unchanged", () => {
    expect(CENTRIC).toHaveLength(17);
    for (const p of CENTRIC) {
      expect(VERTICAL_MIRROR_PLACEMENT_MAP[p], p).toBe(p);
      expect(HORIZONTAL_MIRROR_PLACEMENT_MAP[p], p).toBe(p);
    }
  });
});
