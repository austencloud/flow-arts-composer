import { describe, expect, it } from "vitest";
import { resolvePropTipAnchors3D } from "$lib/shared/3d/effects/prop-tip-geometry-3d";
import { HOOP_FAMILY_REACH_M } from "$lib/shared/pictograph/prop/domain/hoop-family-geometry.generated";

const STAFF_HALF_M = 0.8636 / 2;
const BUILD = { fanBuild: "pictograph", finish: "day" } as const;

describe("hoop family 3D reach", () => {
  it("tracks one tip at an absolute reach that ignores the staff length", () => {
    for (const [prop, reach] of [
      ["triangle", HOOP_FAMILY_REACH_M.triangle],
      ["minihoop", HOOP_FAMILY_REACH_M.minihoop],
      ["bighoop", HOOP_FAMILY_REACH_M.bighoop],
    ] as const) {
      const anchors = resolvePropTipAnchors3D(prop, STAFF_HALF_M, BUILD);
      expect(anchors, prop).toHaveLength(1);
      expect(anchors[0]!.effectTipIndex).toBe(1);
      expect(anchors[0]!.offset.y, prop).toBeCloseTo(reach, 6);
      const shorter = resolvePropTipAnchors3D(prop, STAFF_HALF_M * 0.8, BUILD);
      expect(shorter[0]!.offset.y, prop).toBeCloseTo(reach, 6);
    }
  });
});
