import { describe, expect, it } from "vitest";
import { buildTrajectoryQuery } from "#lib/features/stage/locomotion/motion-matching/trajectory.js";
import { HORIZONS_SEC } from "#lib/features/stage/locomotion/motion-matching/feature-types.js";

describe("buildTrajectoryQuery", () => {
  it("ramps facing toward the target across horizons (root-local)", () => {
    const out = buildTrajectoryQuery(
      { position: { x: 0, z: 0 }, facing: 0 },
      { position: { x: 0, z: 0 }, facing: Math.PI / 2 },
      1.0,
    );
    expect(out.facing[0]).toBeGreaterThan(0);
    expect(out.facing[2]).toBeCloseTo(Math.PI / 2, 2);
    expect(out.facing[0]).toBeLessThan(out.facing[2]);
  });

  it("gives zero local position delta when already at target", () => {
    const out = buildTrajectoryQuery(
      { position: { x: 2, z: 3 }, facing: 0 },
      { position: { x: 2, z: 3 }, facing: 0 },
      1.0,
    );
    for (let h = 0; h < HORIZONS_SEC.length; h++) {
      expect(Math.abs(out.posXZ[h * 2])).toBeLessThan(1e-6);
      expect(Math.abs(out.posXZ[h * 2 + 1])).toBeLessThan(1e-6);
    }
  });
});
