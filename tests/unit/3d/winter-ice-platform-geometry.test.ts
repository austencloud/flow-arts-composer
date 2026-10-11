import { ShapeGeometry } from "three";
import { describe, expect, it } from "vitest";
import {
  createIcePlatformOutline,
  createIcePlatformShape,
  createIcePlatformSnowCollarShape,
} from "#lib/shared/3d/environments/scenes/winter/ice-platform-geometry.js";

describe("Winter ice platform geometry", () => {
  it("keeps the configured performer-clearance radius in every direction", () => {
    const radius = 5;
    const distances = createIcePlatformOutline(radius).map((point) =>
      Math.hypot(point.x, point.y)
    );

    expect(Math.min(...distances)).toBeCloseTo(radius, 8);
    expect(Math.max(...distances)).toBeGreaterThan(radius * 1.1);
  });

  it("produces a visibly non-circular silhouette", () => {
    const points = createIcePlatformOutline(5);
    const distances = points.map((point) => Math.hypot(point.x, point.y));
    const spread = Math.max(...distances) - Math.min(...distances);

    expect(points).toHaveLength(32);
    expect(spread).toBeGreaterThan(0.5);
  });

  it("triangulates both the ice surface and its snow collar", () => {
    const surface = new ShapeGeometry(createIcePlatformShape(5), 12);
    const collar = new ShapeGeometry(createIcePlatformSnowCollarShape(5), 12);

    expect(surface.getAttribute("position").count).toBeGreaterThan(32);
    expect(collar.getAttribute("position").count).toBeGreaterThan(64);
    expect(collar.index?.count ?? 0).toBeGreaterThan(0);

    surface.dispose();
    collar.dispose();
  });
});
