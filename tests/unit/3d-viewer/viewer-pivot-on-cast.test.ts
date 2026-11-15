import { describe, expect, it } from "vitest";
import {
  castDepthAlongRay,
  castStanding,
  isPivotOnCast,
  seatPivotOnCast,
} from "#lib/shared/3d/camera/cast-framing.js";

const FLOOR = -1;
const solo = castStanding([{ x: 0, z: 0 }], FLOOR)!;
const crew = castStanding(
  [-4.8, -3.2, -1.6, 0, 1.6, 3.2, 4.8].map((x, i) => ({ x, z: (i % 2) * 1.2 })),
  FLOOR
)!;
const view = { fovDeg: 50, aspect: 16 / 9 };
const limits = { ...view, minDistance: 1, maxDistance: 25 };

describe("pivot on the cast", () => {
  it("counts a pivot on a lone performer only near their spot, floor to just above the head", () => {
    expect(isPivotOnCast({ x: 0.5, y: 0, z: 0.4 }, solo)).toBe(true);
    expect(isPivotOnCast({ x: 0, y: 1.25, z: 0 }, solo)).toBe(true);
    // The reported pivot: 4.8 m from the performer, inside the old reach box.
    expect(isPivotOnCast({ x: 4.11, y: 1.74, z: -2.54 }, solo)).toBe(false);
    // Wheel-out with the pointer low: 2 m sideways and high above the floor.
    expect(isPivotOnCast({ x: 2.08, y: 3.86, z: 0 }, solo)).toBe(false);
    expect(isPivotOnCast({ x: 0, y: 1.4, z: 0 }, solo)).toBe(false);
    expect(isPivotOnCast({ x: 0, y: -1.2, z: 0 }, solo)).toBe(false);
  });

  it("uses the padded box of standing spots for a crew", () => {
    expect(isPivotOnCast({ x: 2.4, y: 0, z: 0.6 }, crew)).toBe(true);
    expect(isPivotOnCast({ x: 5.5, y: 0, z: 1.9 }, crew)).toBe(true);
    expect(isPivotOnCast({ x: 5.7, y: 0, z: 0 }, crew)).toBe(false);
    expect(isPivotOnCast({ x: 0, y: 0, z: -1 }, crew)).toBe(false);
  });
});

describe("depth of the performer nearest the view ray", () => {
  it("finds the lone performer straight ahead at their real distance", () => {
    const depth = castDepthAlongRay(
      { x: 0, y: 0, z: 6 },
      { x: 0, y: 0, z: 5 },
      solo,
      view
    );
    expect(depth).toBeCloseTo(6, 6);
  });

  it("picks the crew member nearest the ray, not the nearest to the camera", () => {
    const depth = castDepthAlongRay(
      { x: 1.6, y: 0.2, z: 8 },
      { x: 1.6, y: 0.2, z: 7 },
      crew,
      view
    );
    expect(depth).toBeCloseTo(8, 6);
  });

  it("ignores performers behind the camera or outside the view", () => {
    expect(
      castDepthAlongRay(
        { x: 0, y: 0, z: -3 },
        { x: 0, y: 0, z: -4 },
        solo,
        view
      )
    ).toBeNull();
    expect(
      castDepthAlongRay({ x: 0, y: 0, z: 3 }, { x: 10, y: 0, z: 3 }, solo, view)
    ).toBeNull();
  });
});

describe("seating the pivot at rotate start", () => {
  it("keeps a pivot already on the performer (a close look the wheel stopped on)", () => {
    expect(
      seatPivotOnCast(
        { x: 0, y: 0.4, z: 1.2 },
        { x: 0, y: 0.4, z: 0 },
        solo,
        limits
      )
    ).toBeNull();
  });

  it("slides a pivot sitting in front of the lens out to the performer, camera and ray unchanged", () => {
    const position = { x: 0.6, y: 0.5, z: 5 };
    const target = { x: 0.48, y: 0.4, z: 3.6 }; // 1.4 m out, 3.6 m short of her
    const seat = seatPivotOnCast(position, target, solo, limits)!;
    expect(seat.animate).toBe(false);
    expect(seat.position).toEqual(position);
    const radius = Math.hypot(
      seat.target.x - position.x,
      seat.target.y - position.y,
      seat.target.z - position.z
    );
    expect(radius).toBeGreaterThan(4.5);
    expect(Math.abs(seat.target.z)).toBeLessThan(0.5);
    const dir = (p: typeof target) => {
      const v = [p.x - position.x, p.y - position.y, p.z - position.z];
      const l = Math.hypot(...v);
      return v.map((c) => c / l);
    };
    dir(seat.target).forEach((c, i) =>
      expect(c).toBeCloseTo(dir(target)[i]!, 9)
    );
    expect(isPivotOnCast(seat.target, solo)).toBe(true);
  });

  it("brings a performer beyond the orbit range onto the pivot at the furthest allowed radius", () => {
    const seat = seatPivotOnCast(
      { x: 0, y: 0, z: 40 },
      { x: 0, y: 0, z: 39 },
      solo,
      limits
    )!;
    expect(isPivotOnCast(seat.target, solo)).toBe(true);
    const radius = Math.hypot(
      seat.position.x - seat.target.x,
      seat.position.y - seat.target.y,
      seat.position.z - seat.target.z
    );
    expect(radius).toBeCloseTo(25, 6);
    expect(seat.animate).toBe(true);
  });

  it("leaves a panned view alone: the pivot stays on the view ray at her depth", () => {
    const position = { x: 1.3, y: 0, z: 4.57 };
    const seat = seatPivotOnCast(
      position,
      { x: 1.3, y: 0, z: 3 },
      solo,
      limits
    )!;
    expect(seat.animate).toBe(false);
    expect(seat.position).toEqual(position);
    expect(seat.target.x).toBeCloseTo(1.3, 6);
    expect(seat.target.z).toBeCloseTo(0, 6);
  });

  it("turns onto the performer at her real distance when the view ray passes wide of her", () => {
    const position = { x: 3, y: 0.2, z: 6 };
    const seat = seatPivotOnCast(
      position,
      { x: 3, y: 0.2, z: 4 },
      solo,
      limits
    )!;
    expect(seat.animate).toBe(true);
    expect(seat.position).toEqual(position);
    expect(seat.target.x).toBeCloseTo(0, 6);
    expect(seat.target.z).toBeCloseTo(0, 6);
    expect(isPivotOnCast(seat.target, solo)).toBe(true);
  });

  it("turns to the cast with a transition when nobody is in view", () => {
    const position = { x: 2.71, y: 1.96, z: -2.6 };
    const seat = seatPivotOnCast(
      position,
      { x: 4.11, y: 1.74, z: -2.54 },
      solo,
      limits
    )!;
    expect(seat.animate).toBe(true);
    expect(seat.target.x).toBeCloseTo(0, 6);
    expect(seat.target.z).toBeCloseTo(0, 6);
    expect(isPivotOnCast(seat.target, solo)).toBe(true);
  });
});
