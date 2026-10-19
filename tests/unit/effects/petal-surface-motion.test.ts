import { describe, expect, it } from "vitest";
import { createPetalSurfaceGeometry } from "../../../src/lib/shared/3d/effects/petals/petal-surface-geometry";

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
