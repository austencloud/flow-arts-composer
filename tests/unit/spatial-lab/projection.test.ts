import { describe, it, expect } from "vitest";
import {
  project3Dto2D,
  unproject2Dto3D,
  getProjectedGridPoints,
  getViewConfig,
  getBodyEllipseParams,
  type Point3D,
} from "#lib/features/lab/tabs/spatial-lab/services/projection.js";

describe("project3Dto2D", () => {
  const origin: Point3D = { x: 0, y: 0, z: 0 };
  const east: Point3D = { x: 1, y: 0, z: 0 };
  const north: Point3D = { x: 0, y: 1, z: 0 };
  const upstage: Point3D = { x: 0, y: 0, z: 1 };

  it("floor: origin maps to canvas center", () => {
    const pt = project3Dto2D(origin, "floor");
    expect(pt.x).toBe(300);
    expect(pt.y).toBe(330);
  });

  it("floor: east maps to right of center", () => {
    const pt = project3Dto2D(east, "floor");
    expect(pt.x).toBeGreaterThan(300);
    expect(pt.y).toBe(330);
  });

  it("floor: north (Y axis) collapses to center (hidden axis)", () => {
    const pt = project3Dto2D(north, "floor");
    expect(pt.x).toBe(300);
    expect(pt.y).toBe(330);
  });

  it("floor: upstage (Z+) maps to lower on screen", () => {
    const pt = project3Dto2D(upstage, "floor");
    expect(pt.x).toBe(300);
    expect(pt.y).toBeGreaterThan(330);
  });

  it("wall: east maps to right of center", () => {
    const pt = project3Dto2D(east, "wall");
    expect(pt.x).toBeGreaterThan(300);
  });

  it("wall: north (Y+) maps to above center (smaller SVG Y)", () => {
    const pt = project3Dto2D(north, "wall");
    expect(pt.x).toBe(300);
    expect(pt.y).toBeLessThan(330);
  });

  it("wall: upstage (Z) collapses to center (hidden axis)", () => {
    const pt = project3Dto2D(upstage, "wall");
    expect(pt.x).toBe(300);
    expect(pt.y).toBe(330);
  });

  it("wheel: east (X) collapses to center (hidden axis)", () => {
    const pt = project3Dto2D(east, "wheel");
    expect(pt.x).toBe(300);
    expect(pt.y).toBe(330);
  });

  it("wheel: north (Y+) maps above center", () => {
    const pt = project3Dto2D(north, "wheel");
    expect(pt.y).toBeLessThan(330);
  });

  it("wheel: upstage (Z+) maps to right of center", () => {
    const pt = project3Dto2D(upstage, "wheel");
    expect(pt.x).toBeGreaterThan(300);
  });
});

describe("unproject2Dto3D", () => {
  it("floor: roundtrips correctly", () => {
    const original: Point3D = { x: 0.5, y: 0, z: -0.3 };
    const svg = project3Dto2D(original, "floor");
    const back = unproject2Dto3D(svg, "floor", original.y);
    expect(back.x).toBeCloseTo(original.x, 2);
    expect(back.y).toBeCloseTo(original.y, 2);
    expect(back.z).toBeCloseTo(original.z, 2);
  });

  it("wall: roundtrips correctly", () => {
    const original: Point3D = { x: 0.5, y: 0.8, z: 0 };
    const svg = project3Dto2D(original, "wall");
    const back = unproject2Dto3D(svg, "wall", original.z);
    expect(back.x).toBeCloseTo(original.x, 2);
    expect(back.y).toBeCloseTo(original.y, 2);
    expect(back.z).toBeCloseTo(original.z, 2);
  });

  it("wheel: roundtrips correctly", () => {
    const original: Point3D = { x: 0, y: 0.6, z: 0.4 };
    const svg = project3Dto2D(original, "wheel");
    const back = unproject2Dto3D(svg, "wheel", original.x);
    expect(back.x).toBeCloseTo(original.x, 2);
    expect(back.y).toBeCloseTo(original.y, 2);
    expect(back.z).toBeCloseTo(original.z, 2);
  });
});

describe("getProjectedGridPoints", () => {
  it("floor: N and S stack into one point", () => {
    const pts = getProjectedGridPoints("floor", false);
    const names = pts.map((p) => p.name);
    expect(names).toContain("N/S");
    expect(names).toContain("E");
    expect(names).toContain("W");
    expect(pts.length).toBe(3);
  });

  it("wall: all 4 cardinal points visible", () => {
    const pts = getProjectedGridPoints("wall", false);
    expect(pts.length).toBe(4);
  });

  it("wheel: E and W stack into one point", () => {
    const pts = getProjectedGridPoints("wheel", false);
    const names = pts.map((p) => p.name);
    expect(names).toContain("E/W");
    expect(names).toContain("N");
    expect(names).toContain("S");
    expect(pts.length).toBe(3);
  });

  it("includes plane 2 points when split active", () => {
    const pts = getProjectedGridPoints("floor", true);
    expect(pts.length).toBeGreaterThan(3);
    const hasP2 = pts.some((p) => p.name.includes("P2"));
    expect(hasP2).toBe(true);
  });
});

describe("getViewConfig", () => {
  it("returns correct labels for each view", () => {
    expect(getViewConfig("floor").freeAxisLabel).toBe("Y (height)");
    expect(getViewConfig("wall").freeAxisLabel).toBe("Z (depth)");
    expect(getViewConfig("wheel").freeAxisLabel).toBe("X (lateral)");
  });
});

describe("getBodyEllipseParams", () => {
  it("floor: wider than tall (bird's eye)", () => {
    const p = getBodyEllipseParams("floor");
    expect(p.rx).toBeGreaterThan(p.ry);
  });

  it("wall: taller than wide (front view)", () => {
    const p = getBodyEllipseParams("wall");
    expect(p.ry).toBeGreaterThan(p.rx);
  });
});
