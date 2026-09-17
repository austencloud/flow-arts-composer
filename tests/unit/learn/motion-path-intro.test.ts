import { describe, expect, it } from "vitest";
import {
  INTRO_PATHS,
  INTRO_RADIUS,
  INTRO_CENTER,
  INTRO_SPINS,
  introPointAt,
  introStaffAngle,
} from "../../../src/routes/(public)/guide/motion-paths/_data/motion-path-intro";

describe("motion path introduction geometry", () => {
  it("keeps a shift between adjacent cardinal points for every route", () => {
    for (const points of Object.values(INTRO_PATHS)) {
      expect(points).toHaveLength(65);
      expect(points[0]!.x).toBeCloseTo(INTRO_RADIUS);
      expect(points[0]!.y).toBeCloseTo(0);
      expect(points.at(-1)!.x).toBeCloseTo(0);
      expect(points.at(-1)!.y).toBeCloseTo(INTRO_RADIUS);
      expect(
        points.every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y))
      ).toBe(true);
    }
  });

  it("makes around and inward relative to the same grid center", () => {
    const radius = ({ x, y }: { x: number; y: number }) =>
      Math.hypot(x - INTRO_CENTER.x, y - INTRO_CENTER.y);
    for (const point of INTRO_PATHS.arc)
      expect(radius(point)).toBeCloseTo(INTRO_RADIUS);
    for (const point of INTRO_PATHS.linear)
      expect(point.x + point.y).toBeCloseTo(INTRO_RADIUS);
    const arc = radius(introPointAt(INTRO_PATHS.arc, 0.5));
    const linear = radius(introPointAt(INTRO_PATHS.linear, 0.5));
    const concave = radius(introPointAt(INTRO_PATHS.concave, 0.5));
    expect(concave).toBeGreaterThan(0);
    expect(concave).toBeLessThan(linear);
    expect(linear).toBeLessThan(arc);
  });

  it("clamps traversal at endpoints and interpolates between samples", () => {
    const points = INTRO_PATHS.linear;
    expect(introPointAt(points, -1)).toEqual(points[0]);
    expect(introPointAt(points, 2)).toEqual(points.at(-1));
    const middle = introPointAt(points, 0.5 / 64);
    expect(middle.x).toBeCloseTo((points[0]!.x + points[1]!.x) / 2);
  });
});

describe("motion path introduction spins", () => {
  it("turns the staff a quarter turn with the hand for pro and against it for anti", () => {
    // The hand travels east to south, clockwise on screen. A pro staff turns
    // the same way and an anti staff the opposite way, each by one quarter.
    expect(INTRO_SPINS.pro.path).toBe("arc");
    expect(INTRO_SPINS.anti.path).toBe("concave");
    expect(INTRO_SPINS.pro.delta).toBeCloseTo(Math.PI / 2);
    expect(INTRO_SPINS.anti.delta).toBeCloseTo(-Math.PI / 2);
    // Both begin pointing in at the east point, so the staff lies flat.
    for (const track of Object.values(INTRO_SPINS)) {
      expect(Math.abs(Math.sin(track.startAngle))).toBeCloseTo(0);
      expect(introStaffAngle(track, 1)).toBeCloseTo(
        track.startAngle + track.delta
      );
    }
  });
});
