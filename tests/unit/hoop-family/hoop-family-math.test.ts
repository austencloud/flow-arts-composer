// tests/unit/hoop-family/hoop-family-math.test.ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  loadStations,
  triangleMetrics,
  triangleLayout,
  hoopTipPoints,
  triangleTipPoints,
} from "../../../scripts/hoop-family-math.mjs";

const stations = loadStations();

describe("hoop family stations", () => {
  it("records a source for every measured number", () => {
    const raw = JSON.parse(
      readFileSync("scripts/hoop-family-stations.json", "utf8")
    ) as Record<string, unknown>;
    for (const [key, entry] of Object.entries(raw)) {
      if (key === "_") continue;
      expect(entry, key).toHaveProperty("source");
      expect(typeof (entry as { source: unknown }).source, key).toBe("string");
    }
  });

  it("derives the triangle's bow from chord and sagitta", () => {
    const m = triangleMetrics(stations);
    expect(m.bowRadiusMm).toBeCloseTo(1757.58, 1);
    expect((m.arcAngleRad * 180) / Math.PI).toBeCloseTo(18.294, 2);
    expect(m.heightMm).toBeCloseTo(483.935, 2);
    expect(m.reachMm).toBeCloseTo(506.285, 2);
  });

  it("puts the far bow point at the same reach for both grips", () => {
    const corner = triangleLayout(stations, "corner");
    const side = triangleLayout(stations, "side");
    // Corner grip: a vertex sits on the hand, the far side's bow point sits
    // at full reach.
    expect(corner.vertices[0]).toEqual({ x: 0, y: 0 });
    expect(corner.sides[1].bow.x).toBeCloseTo(corner.reachMm, 6);
    // Side grip: the near side's bow point sits on the hand, its chord one
    // sagitta ahead, and the far vertex sits at full reach.
    expect(side.vertices[0].x).toBeCloseTo(22.35, 6);
    expect(Math.abs(side.vertices[0].y)).toBeCloseTo(279.4, 6);
    expect(side.vertices[2].x).toBeCloseTo(side.reachMm, 6);
  });

  it("runs every arc from p to q around a centre one bow radius from both", () => {
    for (const grip of ["corner", "side"] as const) {
      const layout = triangleLayout(stations, grip);
      for (const s of layout.sides) {
        const start = {
          x: s.centre.x + layout.bowRadiusMm * Math.cos(s.startAngle),
          y: s.centre.y + layout.bowRadiusMm * Math.sin(s.startAngle),
        };
        const end = {
          x:
            s.centre.x +
            layout.bowRadiusMm * Math.cos(s.startAngle + layout.arcAngleRad),
          y:
            s.centre.y +
            layout.bowRadiusMm * Math.sin(s.startAngle + layout.arcAngleRad),
        };
        expect(start.x).toBeCloseTo(s.p.x, 6);
        expect(start.y).toBeCloseTo(s.p.y, 6);
        expect(end.x).toBeCloseTo(s.q.x, 6);
        expect(end.y).toBeCloseTo(s.q.y, 6);
        expect(Math.hypot(s.p.x - s.centre.x, s.p.y - s.centre.y)).toBeCloseTo(
          layout.bowRadiusMm,
          6
        );
        expect(Math.hypot(s.q.x - s.centre.x, s.q.y - s.centre.y)).toBeCloseTo(
          layout.bowRadiusMm,
          6
        );
        expect(
          Math.hypot(s.bow.x - s.centre.x, s.bow.y - s.centre.y)
        ).toBeCloseTo(layout.bowRadiusMm, 6);
      }
    }
  });

  it("reproduces the shipped hoop tip points exactly", () => {
    const mini = hoopTipPoints(stations.mini_glyph);
    expect(mini).toEqual([
      { dx: 10.37, dy: -35.62 },
      { dx: 78.13, dy: -57.63 },
      { dx: 120, dy: 0 },
      { dx: 78.13, dy: 57.63 },
      { dx: 10.37, dy: 35.62 },
    ]);
    const big = hoopTipPoints(stations.big_glyph);
    expect(big).toEqual([
      { dx: 34.6, dy: -83.7 },
      { dx: 193.8, dy: -135.43 },
      { dx: 292.2, dy: 0 },
      { dx: 193.8, dy: 135.43 },
      { dx: 34.6, dy: 83.7 },
    ]);
  });

  it("gives each triangle grip five tips with the far point on the axis", () => {
    const corner = triangleTipPoints(stations, "corner");
    const side = triangleTipPoints(stations, "side");
    // Corner: axis bow point, the two far vertices, then the bow points of
    // the gripped sides.
    expect(corner).toEqual([
      { dx: 135.15, dy: 0 },
      { dx: 129.18, dy: 74.58 },
      { dx: 129.18, dy: -74.58 },
      { dx: 61.61, dy: 42.46 },
      { dx: 61.61, dy: -42.46 },
    ]);
    // Side: axis vertex, the two near vertices, then the bow points of the
    // far sides.
    expect(side).toEqual([
      { dx: 135.15, dy: 0 },
      { dx: 5.97, dy: 74.58 },
      { dx: 5.97, dy: -74.58 },
      { dx: 73.54, dy: 42.46 },
      { dx: 73.54, dy: -42.46 },
    ]);
  });

  it("rejects an unknown triangle grip", () => {
    expect(() => triangleLayout(stations, "edge")).toThrow();
  });
});
