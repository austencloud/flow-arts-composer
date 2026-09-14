import { describe, expect, it } from "vitest";
import {
  INTRO_PATHS,
  introPointAt,
} from "../../../src/routes/(public)/guide/motion-paths/_data/motion-path-intro";

describe("motion path introduction geometry", () => {
  it("keeps the endpoints fixed while changing routes", () => {
    for (const points of Object.values(INTRO_PATHS)) {
      expect(points).toHaveLength(65);
      expect(points[0]!.x).toBeCloseTo(-140);
      expect(points[0]!.y).toBeCloseTo(0);
      expect(points.at(-1)!.x).toBeCloseTo(140);
      expect(points.at(-1)!.y).toBeCloseTo(0);
      expect(
        points.every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y))
      ).toBe(true);
    }
  });

  it("shows a straight route between outward and inward curves", () => {
    expect(INTRO_PATHS.linear.every(({ y }) => Math.abs(y) < 1e-8)).toBe(true);
    expect(introPointAt(INTRO_PATHS.arc, 0.5).y).toBeLessThan(-40);
    expect(introPointAt(INTRO_PATHS.concave, 0.5).y).toBeGreaterThan(40);
  });

  it("clamps traversal at endpoints and interpolates between samples", () => {
    const points = INTRO_PATHS.linear;
    expect(introPointAt(points, -1)).toEqual(points[0]);
    expect(introPointAt(points, 2)).toEqual(points.at(-1));
    const middle = introPointAt(points, 0.5 / 64);
    expect(middle.x).toBeCloseTo((points[0]!.x + points[1]!.x) / 2);
  });
});
