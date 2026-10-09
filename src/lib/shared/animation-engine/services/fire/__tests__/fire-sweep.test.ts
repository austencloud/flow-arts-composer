import { describe, expect, it } from "vitest";
import { sweepPolyline, type SweepPoint } from "../fire-sweep";

describe("sweepPolyline", () => {
  it("matches the two-point chord sweep for a bare chord", () => {
    const out: SweepPoint[] = [];
    const n = sweepPolyline(
      [
        { x: 0, y: 0 },
        { x: 0.3, y: 0 },
      ],
      0.1,
      32,
      out
    );
    expect(n).toBe(3);
    expect(out.slice(0, n)).toEqual([
      { x: 0, y: 0 },
      { x: 0.15, y: 0 },
      { x: 0.3, y: 0 },
    ]);
  });

  it("returns only the end point when the path is shorter than a step", () => {
    const out: SweepPoint[] = [];
    const n = sweepPolyline(
      [
        { x: 0, y: 0 },
        { x: 0.01, y: 0 },
      ],
      0.1,
      32,
      out
    );
    expect(n).toBe(1);
    expect(out[0]).toEqual({ x: 0.01, y: 0 });
  });

  it("spreads splats by arc length along a bent path", () => {
    const out: SweepPoint[] = [];
    const n = sweepPolyline(
      [
        { x: 0, y: 0 },
        { x: 0.2, y: 0 },
        { x: 0.2, y: 0.2 },
      ],
      0.09, // arc length 0.4 -> ceil(4.44) = 5 splats, 0.1 apart
      32,
      out
    );
    expect(n).toBe(5);
    expect(out[0]).toEqual({ x: 0, y: 0 });
    expect(out[2]!.x).toBeCloseTo(0.2, 9);
    expect(out[2]!.y).toBeCloseTo(0, 9);
    expect(out[3]!.x).toBeCloseTo(0.2, 9);
    expect(out[3]!.y).toBeCloseTo(0.1, 9);
    expect(out[4]!.x).toBeCloseTo(0.2, 9);
    expect(out[4]!.y).toBeCloseTo(0.2, 9);
  });

  it("caps the count and still ends on the last point", () => {
    const out: SweepPoint[] = [];
    const n = sweepPolyline(
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
      0.1,
      32,
      out
    );
    expect(n).toBe(32);
    expect(out[31]).toEqual({ x: 10, y: 0 });
  });

  it("reuses the output objects", () => {
    const out: SweepPoint[] = [];
    sweepPolyline(
      [
        { x: 0, y: 0 },
        { x: 0.3, y: 0 },
      ],
      0.1,
      32,
      out
    );
    const first = out[0];
    sweepPolyline(
      [
        { x: 1, y: 1 },
        { x: 1.3, y: 1 },
      ],
      0.1,
      32,
      out
    );
    expect(out[0]).toBe(first);
    expect(out[0]).toEqual({ x: 1, y: 1 });
  });
});
