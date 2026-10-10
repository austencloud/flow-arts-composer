import { describe, it, expect } from "vitest";
import { Vector3 } from "three";
import { computeKneeHingeAxis } from "#lib/shared/3d/services/knee-hinge-axis-calibrator.js";

describe("KneeHingeAxisCalibrator", () => {

  it("returns X-aligned axis for a leg bent in the YZ plane (knee bends forward)", () => {
    // UpLeg points down (-Y), Leg points slightly forward (-Y, +Z)
    // Natural bend plane = YZ plane → hinge axis = X (sign depends on cross order)
    const upLegRest = new Vector3(0, -1, 0).normalize();
    const legRest = new Vector3(0, -1, 0.1).normalize();

    const axis = computeKneeHingeAxis(upLegRest, legRest);

    expect(Math.abs(axis.x)).toBeGreaterThan(0.95);
    expect(Math.abs(axis.y)).toBeLessThan(0.1);
    expect(Math.abs(axis.z)).toBeLessThan(0.1);
  });

  it("returns unit-length result", () => {
    const upLegRest = new Vector3(0.1, -1, 0.05).normalize();
    const legRest = new Vector3(0, -1, 0.15).normalize();

    const axis = computeKneeHingeAxis(upLegRest, legRest);

    expect(axis.length()).toBeCloseTo(1, 4);
  });

  it("returns fallback axis when rest directions are parallel (degenerate)", () => {
    // Perfectly straight leg: both bones point down, cross product is zero
    const upLegRest = new Vector3(0, -1, 0);
    const legRest = new Vector3(0, -1, 0);

    const axis = computeKneeHingeAxis(upLegRest, legRest);

    // Should fall back to world X (sagittal for a character facing +Z)
    expect(axis.length()).toBeCloseTo(1, 4);
    expect(Math.abs(axis.x)).toBeGreaterThan(0.95);
  });
});
