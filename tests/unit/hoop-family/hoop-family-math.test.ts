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
    expect(corner.reachMm).toBeCloseTo(side.reachMm, 6);
    // Corner grip: a vertex sits on the hand.
    expect(corner.vertices[0]).toEqual({ x: 0, y: 0 });
    // Side grip: the near side's bow point sits on the hand, its chord one
    // sagitta ahead.
    expect(side.vertices[0].x).toBeCloseTo(22.35, 6);
    expect(Math.abs(side.vertices[0].y)).toBeCloseTo(279.4, 6);
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
    expect(corner).toHaveLength(5);
    expect(side).toHaveLength(5);
    expect(corner[0]).toEqual({ dx: 135.15, dy: 0 });
    expect(side[0]).toEqual({ dx: 135.15, dy: 0 });
    // Corner: the two far vertices and the bow points of the gripped sides.
    expect(corner[1]).toEqual({ dx: 129.18, dy: 74.58 });
    expect(corner[3]).toEqual({ dx: 61.61, dy: 42.46 });
    // Side: the two near vertices and the bow points of the far sides.
    expect(side[1]).toEqual({ dx: 5.97, dy: 74.58 });
    expect(side[3]).toEqual({ dx: 73.54, dy: 42.46 });
  });
});
