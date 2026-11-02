import { describe, it, expect } from "vitest";
import type { SVGPathData } from "#lib/shared/mandala/domain/mandala-types.js";
import {
  pathPoints,
  loopDistance,
  MATCH_EPS,
} from "../verify-realization-parity";
import { CURVE_MATCH_EPS, curveDistance } from "./curve-distance";

/** Build a closed-loop SVGPathData from points (mirrors pointsToSVGPath's M…C form). */
function pathFrom(points: { x: number; y: number }[]): SVGPathData[] {
  if (points.length < 2) return [];
  const first = points[0]!;
  // mirror pointsToSVGPath: fixed-2 decimals (no scientific notation)
  const f = (v: number) => v.toFixed(2);
  let d = `M ${f(first.x)} ${f(first.y)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p = points[i + 1]!;
    // control points are ignored by pathPoints (it reads the C endpoint only)
    d += ` C 0 0, 0 0, ${f(p.x)} ${f(p.y)}`;
  }
  return [{ d, tipIndex: 0 }];
}

function circle(n: number, r: number, phase = 0, cx = 0, cy = 0) {
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    const a = phase + (2 * Math.PI * i) / n;
    pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return pts;
}

function closed(points: { x: number; y: number }[]) {
  return [...points, points[0]!];
}

function rotate(pts: { x: number; y: number }[], deg: number) {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a),
    s = Math.sin(a);
  return pts.map((p) => ({ x: p.x * c - p.y * s, y: p.x * s + p.y * c }));
}

describe("pathPoints", () => {
  it("extracts the M point and each cubic endpoint", () => {
    const pts = pathPoints([
      { d: "M 10 20 C 1 1, 2 2, 30 40 C 3 3, 4 4, 50 60", tipIndex: 0 },
    ]);
    expect(pts).toEqual([
      { x: 10, y: 20 },
      { x: 30, y: 40 },
      { x: 50, y: 60 },
    ]);
  });

  it("handles negative + decimal coordinates", () => {
    const pts = pathPoints([
      { d: "M -1.5 2.25 C 0 0, 0 0, -3.5 4.75", tipIndex: 0 },
    ]);
    expect(pts).toEqual([
      { x: -1.5, y: 2.25 },
      { x: -3.5, y: 4.75 },
    ]);
  });
});

describe("loopDistance", () => {
  const a = pathFrom(closed(circle(60, 100)));

  it("is ~0 for an identical loop", () => {
    expect(loopDistance(pathPoints(a), pathPoints(a))).toBeLessThan(1e-6);
  });

  it("is ~0 for a cyclic phase shift (same locus, different sample start)", () => {
    const shifted = pathFrom(closed(circle(60, 100, (2 * Math.PI * 17) / 60)));
    // toFixed(2) round-trip leaves sub-pixel noise; well under MATCH_EPS.
    expect(loopDistance(pathPoints(a), pathPoints(shifted))).toBeLessThan(0.05);
  });

  it("is ~0 for reversed traversal direction", () => {
    const rev = pathFrom(closed([...circle(60, 100)].reverse()));
    expect(loopDistance(pathPoints(a), pathPoints(rev))).toBeLessThan(0.05);
  });

  it("flags a spatial rotation (the defect) as far above tolerance", () => {
    const rot = pathFrom(closed(rotate(circle(60, 100), 37)));
    // A perfect circle is rotation-symmetric, so use a non-symmetric loop:
    const teardrop = (phase = 0) =>
      circle(60, 100, phase).map((p, i) => ({
        x: p.x,
        y: p.y * (1 + 0.6 * (i / 60)),
      }));
    const base = pathFrom(closed(teardrop()));
    const rotated = pathFrom(closed(rotate(teardrop(), 90)));
    expect(loopDistance(pathPoints(base), pathPoints(rotated))).toBeGreaterThan(
      MATCH_EPS * 3
    );
    // (rot kept to document the symmetric-circle caveat)
    expect(rot.length).toBe(1);
  });

  it("returns Infinity for sample counts that are not whole laps", () => {
    const small = pathFrom(closed(circle(40, 100)));
    expect(loopDistance(pathPoints(a), pathPoints(small))).toBe(Infinity);
  });

  it("matches a locus traced twice against one lap of it", () => {
    // A whole-turn hand paired with a quarter-turn hand closes on the
    // eight-step wheel and draws its four-step flower twice.
    const teardrop = circle(60, 100).map((p, i) => ({
      x: p.x,
      y: p.y * (1 + 0.6 * (i / 60)),
    }));
    const once = pathFrom(closed(teardrop));
    const twice = pathFrom(closed([...teardrop, ...teardrop]));
    expect(loopDistance(pathPoints(once), pathPoints(twice))).toBeLessThan(
      0.05
    );
    // A second lap that is a rotated copy is still the defect.
    const turned = rotate(teardrop, 90);
    const skewed = pathFrom(closed([...teardrop, ...turned]));
    expect(loopDistance(pathPoints(once), pathPoints(skewed))).toBeGreaterThan(
      MATCH_EPS * 3
    );
  });

  it("rejects matching open paths instead of treating them as closed loops", () => {
    const open = pathPoints(pathFrom(circle(60, 100).slice(0, 40)));
    expect(loopDistance(open, open)).toBe(Infinity);
  });
});

describe("curveDistance", () => {
  it("matches one closed curve across different path segmentation", () => {
    const twoHalves: SVGPathData[] = [
      {
        d: "M 0 0 L 100 0 L 100 100 L 0 100 Z",
        tipIndex: 0,
      },
    ];
    const fourQuarters: SVGPathData[] = [
      {
        d: "M 50 0 L 100 0 L 100 50 L 100 100 L 50 100 L 0 100 L 0 50 L 0 0 L 50 0 Z",
        tipIndex: 0,
      },
    ];
    expect(curveDistance(twoHalves, fourQuarters)).toBeLessThanOrEqual(
      CURVE_MATCH_EPS
    );
  });
});
