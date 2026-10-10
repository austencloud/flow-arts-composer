import { describe, it, expect } from "vitest";
import {
  buildTaperedMesh,
  createSmoothCurve,
  adaptiveSubdivisions,
  MIN_TAIL_WIDTH_RATIO,
  TRAIL_VERTEX_STRIDE,
  type Point2D,
} from "#lib/shared/render-graph/math/trail-mesh.js";

describe("createSmoothCurve", () => {
  it("returns an empty array for empty input", () => {
    expect(createSmoothCurve([])).toEqual([]);
  });

  it("passes a single point through unchanged (cloned)", () => {
    const input: Point2D[] = [{ x: 1, y: 2 }];
    const out = createSmoothCurve(input);
    expect(out).toEqual(input);
    expect(out[0]).not.toBe(input[0]);
  });

  it("interpolates linearly between two points", () => {
    const out = createSmoothCurve(
      [{ x: 0, y: 0 }, { x: 1, y: 0 }],
      { subdivisionsPerSegment: 4 },
    );
    expect(out).toHaveLength(5);
    expect(out[0]).toEqual({ x: 0, y: 0 });
    expect(out[2]!.x).toBeCloseTo(0.5, 5);
    expect(out[4]).toEqual({ x: 1, y: 0 });
  });

  it("produces more than N points for N control points (spline subdivision)", () => {
    const control: Point2D[] = [
      { x: 0, y: 0 },
      { x: 0.5, y: 0.8 },
      { x: 1, y: 0 },
      { x: 1.5, y: -0.5 },
    ];
    const out = createSmoothCurve(control, { subdivisionsPerSegment: 8 });
    expect(out.length).toBeGreaterThan(control.length);
    // Endpoints preserved.
    expect(out[0]).toEqual(control[0]);
    expect(out[out.length - 1]).toEqual(control[control.length - 1]);
  });
});

describe("adaptiveSubdivisions", () => {
  it("drops per-segment subdivisions as point count grows", () => {
    expect(adaptiveSubdivisions(4)).toBeGreaterThan(adaptiveSubdivisions(50));
  });

  it("clamps to a minimum for very large paths", () => {
    expect(adaptiveSubdivisions(1000)).toBeGreaterThanOrEqual(2);
  });
});

describe("buildTaperedMesh", () => {
  const straightPath: Point2D[] = [
    { x: -0.5, y: 0 },
    { x: 0, y: 0 },
    { x: 0.5, y: 0 },
  ];

  it("emits an empty mesh for sub-2-point paths", () => {
    expect(buildTaperedMesh([], { thickness: 0.01 }).vertexCount).toBe(0);
    expect(buildTaperedMesh([{ x: 0, y: 0 }], { thickness: 0.01 }).vertexCount).toBe(0);
  });

  it("produces exactly 2 * pathLength vertices (left + right edge per point)", () => {
    const mesh = buildTaperedMesh(straightPath, { thickness: 0.02 });
    expect(mesh.vertexCount).toBe(straightPath.length * 2);
    expect(mesh.vertices.length).toBe(straightPath.length * 2 * TRAIL_VERTEX_STRIDE);
  });

  it("alternates edge_t between -1 and +1", () => {
    const mesh = buildTaperedMesh(straightPath, { thickness: 0.02 });
    for (let i = 0; i < mesh.vertexCount; i += 1) {
      const edgeT = mesh.vertices[i * TRAIL_VERTEX_STRIDE + 3]!;
      expect(edgeT).toBe(i % 2 === 0 ? -1 : 1);
    }
  });

  it("tapers width — first-pair separation is smaller than last-pair", () => {
    const mesh = buildTaperedMesh(straightPath, { thickness: 0.05 });
    const s = TRAIL_VERTEX_STRIDE;
    const firstLeft = { x: mesh.vertices[0]!, y: mesh.vertices[1]! };
    const firstRight = { x: mesh.vertices[s]!, y: mesh.vertices[s + 1]! };
    const lastLeft = {
      x: mesh.vertices[mesh.vertices.length - 2 * s]!,
      y: mesh.vertices[mesh.vertices.length - 2 * s + 1]!,
    };
    const lastRight = {
      x: mesh.vertices[mesh.vertices.length - s]!,
      y: mesh.vertices[mesh.vertices.length - s + 1]!,
    };
    const tailWidth = Math.hypot(firstLeft.x - firstRight.x, firstLeft.y - firstRight.y);
    const headWidth = Math.hypot(lastLeft.x - lastRight.x, lastLeft.y - lastRight.y);
    expect(headWidth).toBeGreaterThan(tailWidth);
    expect(tailWidth / headWidth).toBeCloseTo(MIN_TAIL_WIDTH_RATIO, 2);
  });

  it("per-vertex alpha rises from tail (0) to head (maxAlpha)", () => {
    const mesh = buildTaperedMesh(straightPath, {
      thickness: 0.02,
      maxAlpha: 0.9,
      fadeExponent: 2.5,
    });
    // alpha is the 5th float (index 4) of each vertex stride.
    const firstAlpha = mesh.vertices[4]!;
    const lastAlpha = mesh.vertices[mesh.vertices.length - 1]!;
    expect(firstAlpha).toBeCloseTo(0, 5);
    expect(lastAlpha).toBeCloseTo(0.9, 5);
  });

  it("z is age-normalized: 1 at tail (oldest), 0 at head (newest)", () => {
    const mesh = buildTaperedMesh(straightPath, { thickness: 0.02 });
    // z is the 3rd float (index 2) of each vertex stride.
    const firstZ = mesh.vertices[2]!;
    const lastZ = mesh.vertices[mesh.vertices.length - TRAIL_VERTEX_STRIDE + 2]!;
    expect(firstZ).toBeCloseTo(1, 5);
    expect(lastZ).toBeCloseTo(0, 5);
  });

  it("polygon width matches thickness at the head (no glow expansion)", () => {
    const thickness = 0.04;
    const mesh = buildTaperedMesh(straightPath, { thickness });
    const s = TRAIL_VERTEX_STRIDE;
    const headIdx = mesh.vertexCount - 2;
    const leftX = mesh.vertices[headIdx * s + 0]!;
    const leftY = mesh.vertices[headIdx * s + 1]!;
    const rightX = mesh.vertices[(headIdx + 1) * s + 0]!;
    const rightY = mesh.vertices[(headIdx + 1) * s + 1]!;
    const headWidth = Math.hypot(leftX - rightX, leftY - rightY);
    expect(headWidth).toBeCloseTo(thickness, 5);
  });
});
