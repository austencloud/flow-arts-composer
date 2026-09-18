// tests/unit/hoop-family/hoop-family-svgs.test.ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  HOOP_FAMILY_BOXES,
  HOOP_FAMILY_TIP_POINTS,
  HOOP_FAMILY_GLYPH_CROPS,
  HOOP_FAMILY_REACH_M,
  TRIANGLE_STATIONS_M,
} from "$lib/shared/pictograph/prop/domain/hoop-family-geometry.generated";

function viewBox(path: string): [number, number] {
  const svg = readFileSync(path, "utf8");
  const match = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);
  if (!match) throw new Error(`${path} has no viewBox`);
  return [Number(match[1]), Number(match[2])];
}

describe("generated hoop family artwork", () => {
  it("keeps the hoop boxes where trails and sprites expect them", () => {
    expect(HOOP_FAMILY_BOXES.minihoop).toEqual({ width: 257.9, height: 138.2 });
    expect(HOOP_FAMILY_BOXES.bighoop).toEqual({ width: 600, height: 300 });
  });

  it("derives the triangle box from the reach and the vertex spread", () => {
    expect(HOOP_FAMILY_BOXES.triangle.width).toBeCloseTo(280.3, 1);
    expect(HOOP_FAMILY_BOXES.triangle.height).toBeCloseTo(162.17, 1);
  });

  it.each([
    ["static/images/props/pictograph/minihoop.svg", "minihoop"],
    ["static/images/props/animated/minihoop.svg", "minihoop"],
    ["static/images/props/buttons/minihoop.svg", "minihoop"],
    ["static/images/props/pictograph/bighoop.svg", "bighoop"],
    ["static/images/props/animated/bighoop.svg", "bighoop"],
    ["static/images/props/buttons/bighoop.svg", "bighoop"],
    ["static/images/props/pictograph/triangle.svg", "triangle"],
    ["static/images/props/animated/triangle.svg", "triangle"],
    ["static/images/props/buttons/triangle.svg", "triangle"],
    ["static/images/props/appearances/triangle-side.svg", "triangle"],
  ] as const)("%s carries the %s box", (path, key) => {
    const [w, h] = viewBox(path);
    expect(w).toBeCloseTo(HOOP_FAMILY_BOXES[key].width, 2);
    expect(h).toBeCloseTo(HOOP_FAMILY_BOXES[key].height, 2);
  });

  it("writes the pictograph, animated and button files identically", () => {
    for (const prop of ["minihoop", "bighoop", "triangle"]) {
      const a = readFileSync(`static/images/props/pictograph/${prop}.svg`, "utf8");
      expect(readFileSync(`static/images/props/animated/${prop}.svg`, "utf8")).toBe(a);
      expect(readFileSync(`static/images/props/buttons/${prop}.svg`, "utf8")).toBe(a);
    }
  });

  it("paints the tube in the neutral gray that selective recolor repaints", () => {
    const svg = readFileSync("static/images/props/pictograph/triangle.svg", "utf8");
    expect(svg).toContain('fill="#9A9A9A"');
    expect(svg).toContain('fill="#1C1C1F"');
    expect(svg).toContain('fill="#C9AC68"');
    expect(svg).not.toContain("stroke=");
  });

  it("keeps the hoop tip points at their shipped values", () => {
    expect(HOOP_FAMILY_TIP_POINTS.minihoop[2]).toEqual({ dx: 120, dy: 0 });
    expect(HOOP_FAMILY_TIP_POINTS.bighoop[2]).toEqual({ dx: 292.2, dy: 0 });
    expect(HOOP_FAMILY_TIP_POINTS.triangle).toHaveLength(5);
    expect(HOOP_FAMILY_TIP_POINTS.triangle_side).toHaveLength(5);
  });

  it("crops each button to its painted window", () => {
    for (const key of ["minihoop", "bighoop", "triangle"] as const) {
      const crop = HOOP_FAMILY_GLYPH_CROPS[key];
      expect(crop.imageWidth).toBe(HOOP_FAMILY_BOXES[key].width);
      expect(crop.x).toBeGreaterThanOrEqual(0);
      expect(crop.x + crop.width).toBeLessThanOrEqual(crop.imageWidth + 0.01);
    }
  });

  it("states the 3D reaches in metres", () => {
    expect(HOOP_FAMILY_REACH_M.minihoop).toBeCloseTo(0.454025, 6);
    expect(HOOP_FAMILY_REACH_M.bighoop).toBeCloseTo(0.454025 * 1.4, 6);
    expect(HOOP_FAMILY_REACH_M.triangle).toBeCloseTo(0.506285, 5);
    expect(TRIANGLE_STATIONS_M.bowRadius).toBeCloseTo(1.757581, 5);
    expect(TRIANGLE_STATIONS_M.sleeveRadius).toBeCloseTo(0.01031875, 8);
  });
});
