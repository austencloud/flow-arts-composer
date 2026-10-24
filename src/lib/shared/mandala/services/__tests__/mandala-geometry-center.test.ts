import { describe, expect, it } from "vitest";
import { calculate } from "../mandala-geometry-calculator";
import type { MotionLike } from "../types";

// Center is radius 0 at the grid origin (spec 2026-10-22, gap 10). Before,
// LOCATION_ANGLES[CENTER] = 0 was read as a rim angle, so a hand "at center"
// traced the rim at East. Grid radius here is 80 mandala units.

/** The sampled points of a path: the move-to, then each curve's end point. */
function samples(d: string): Array<[number, number]> {
  const n = d.match(/-?\d+\.\d+/g)!.map(Number);
  const out: Array<[number, number]> = [[n[0]!, n[1]!]];
  for (let i = 2; i < n.length; i += 6) out.push([n[i + 4]!, n[i + 5]!]);
  return out;
}

/** The hand's own point: midway between the staff's two tip traces. */
function handPoints(
  motion: MotionLike,
  pathShape?: "arc" | "linear" | "concave"
) {
  const paths = calculate(
    [{ motions: { left: motion, right: motion } }],
    undefined,
    undefined,
    pathShape ? { pathShape } : undefined
  );
  const [a, b] = paths.left.map((path) => samples(path.d));
  return a!.map(([ax, ay], i) => {
    const [bx, by] = b![i]!;
    return { x: (ax + bx) / 2, y: (ay + by) / 2 };
  });
}

function motion(
  motionType: string,
  startLocation: string,
  endLocation: string
): MotionLike {
  return {
    motionType,
    rotationDirection: "cw",
    startLocation,
    endLocation,
    startOrientation: "in",
    endOrientation: "in",
    turns: 0,
  };
}

describe("mandala geometry at center", () => {
  it("keeps a hand that stays at center on the origin", () => {
    for (const center of ["c", "center"]) {
      for (const point of handPoints(motion("static", center, center))) {
        expect(Math.hypot(point.x, point.y)).toBeLessThan(0.01);
      }
    }
  });

  it("traces a hash in as the straight segment from the rim to the origin", () => {
    for (const [type, shape] of [
      ["dash", undefined],
      ["pro", "arc"],
    ] as const) {
      const points = handPoints(motion(type, "n", "c"), shape);
      for (const point of points) {
        expect(Math.abs(point.x)).toBeLessThan(0.01);
        expect(point.y).toBeGreaterThanOrEqual(-80.01);
        expect(point.y).toBeLessThanOrEqual(0.01);
      }
      expect(points[points.length >> 1]!.y).toBeCloseTo(-40, 1);
      expect(Math.hypot(points.at(-1)!.x, points.at(-1)!.y)).toBeLessThan(0.01);
    }
  });

  it("leaves perimeter paths exactly where the code put them before", () => {
    // Pinned from the calculator before the center change.
    const points = handPoints(motion("pro", "n", "e"));
    expect(points).toHaveLength(65);
    expect(points[0]).toEqual({ x: -0, y: -80 });
    expect(points[32]).toEqual({ x: 56.565, y: -56.565 });
    expect(points[64]).toEqual({ x: 80, y: 0 });
  });
});
