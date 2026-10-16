import { describe, expect, it } from "vitest";
import { resolveCentripetalBezierSegment } from "#lib/shared/effects/renderers/ribbon-trace.js";

describe("resolveCentripetalBezierSegment", () => {
  it("shortens the handle beside a distant sample instead of hooking backward", () => {
    const segment = resolveCentripetalBezierSegment(
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0.1 },
      { x: 100, y: 100 }
    );

    expect(segment.control2.x).toBeGreaterThan(0);
    expect(segment.control2.x).toBeLessThan(3);
    expect(segment.end).toEqual({ x: 2, y: 0.1 });
  });

  it("keeps every Bezier control finite when motion samples repeat", () => {
    const segment = resolveCentripetalBezierSegment(
      { x: 4, y: 7 },
      { x: 4, y: 7 },
      { x: 4, y: 7 },
      { x: 9, y: 11 }
    );

    for (const point of [segment.control1, segment.control2, segment.end]) {
      expect(Number.isFinite(point.x)).toBe(true);
      expect(Number.isFinite(point.y)).toBe(true);
    }
  });
});
