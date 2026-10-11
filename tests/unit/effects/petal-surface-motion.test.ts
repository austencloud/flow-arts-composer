import { describe, expect, it } from "vitest";
import { Quaternion, Vector3 } from "three";
import { createPetalSurfaceGeometry } from "../../../src/lib/shared/3d/effects/petals/petal-surface-geometry";
import {
  petalFlightWeight,
  settlePetalOrientation,
} from "../../../src/lib/shared/3d/effects/petals/petal-orientation";

describe("petal surface", () => {
  it("cups inside the silhouette with an asymmetric fold and lifted tip", () => {
    const geometry = createPetalSurfaceGeometry();
    const positions = geometry.getAttribute("position");
    const normals = geometry.getAttribute("normal");
    const uv = geometry.getAttribute("uv");
    expect(positions.count).toBe(81);
    const fold = positions.getZ(40);
    const leftWing = positions.getZ(38);
    const rightWing = positions.getZ(42);
    expect(leftWing).toBeGreaterThan(fold + 0.05);
    expect(rightWing).toBeGreaterThan(leftWing + 0.01);
    expect(positions.getZ(13)).toBeGreaterThan(fold + 0.1);
    expect(normals.getX(38)).toBeGreaterThan(0.1);
    expect(normals.getX(42)).toBeLessThan(-0.1);
    let maxDepth = 0;
    for (let index = 0; index < positions.count; index++) {
      const length = Math.hypot(
        normals.getX(index),
        normals.getY(index),
        normals.getZ(index)
      );
      expect(Number.isFinite(length)).toBe(true);
      expect(length).toBeCloseTo(1, 5);
      maxDepth = Math.max(maxDepth, positions.getZ(index));
    }
    expect(maxDepth).toBeLessThan(0.28);
    expect(uv.getX(0)).toBe(0);
    expect(uv.getY(0)).toBe(1);
    geometry.dispose();
  });
});

describe("petal orientation", () => {
  it("settles to the fall pose when launch velocity is gone", () => {
    expect(petalFlightWeight(0, -0.5, 0, -0.5)).toBe(0);
    expect(petalFlightWeight(2, -0.5, 0, -0.5)).toBe(1);
    expect(Number.isFinite(petalFlightWeight(0, 0, 0, 0))).toBe(true);
  });

  it("reaches the same static target across different frame steps", () => {
    const flight = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), 1.2);
    const floating = new Quaternion().setFromAxisAngle(
      new Vector3(1, 0, 0),
      -0.4
    );
    const target = new Quaternion();
    const oneStep = new Quaternion();
    const twoSteps = new Quaternion();
    settlePetalOrientation(oneStep, flight, floating, 0.4, 0.04, target);
    settlePetalOrientation(twoSteps, flight, floating, 0.4, 0.02, target);
    settlePetalOrientation(twoSteps, flight, floating, 0.4, 0.02, target);
    expect(oneStep.angleTo(twoSteps)).toBeLessThan(0.00001);
    expect(oneStep.length()).toBeCloseTo(1);
  });
});
