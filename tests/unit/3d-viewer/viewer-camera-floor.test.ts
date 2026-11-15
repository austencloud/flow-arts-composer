import { describe, expect, it } from "vitest";
import {
  CAMERA_FLOOR_CLEARANCE,
  floorLift,
} from "#lib/shared/3d/camera/cast-framing.js";

const FLOOR = -1.012;

describe("keeping the orbit rig above the floor", () => {
  it("leaves a rig that is already above the floor alone", () => {
    expect(floorLift(-0.4, 0.6, FLOOR)).toBe(0);
    expect(floorLift(FLOOR, FLOOR + CAMERA_FLOOR_CLEARANCE, FLOOR)).toBe(0);
  });

  it("lifts a camera that wheel travel took under the floor to the clearance", () => {
    // The reported pose: pivot and camera both just under a floor at -1.012.
    const lift = floorLift(-1.05, -1.2, FLOOR);
    expect(-1.2 + lift).toBeCloseTo(FLOOR + CAMERA_FLOOR_CLEARANCE, 9);
    expect(-1.05 + lift).toBeGreaterThanOrEqual(FLOOR);
  });

  it("lifts a pivot that sank under the floor even when the camera is high", () => {
    // Looking steeply down onto a pivot below the floor.
    const lift = floorLift(-1.5, 2, FLOOR);
    expect(-1.5 + lift).toBeCloseTo(FLOOR, 9);
  });

  it("takes the larger of the two lifts", () => {
    expect(floorLift(-1.1, -1.0, FLOOR)).toBeCloseTo(
      FLOOR + CAMERA_FLOOR_CLEARANCE + 1.0,
      9
    );
  });

  it("never lifts on numbers it cannot trust", () => {
    expect(floorLift(Number.NaN, -2, FLOOR)).toBe(0);
    expect(floorLift(-2, Number.POSITIVE_INFINITY, FLOOR)).toBe(0);
    expect(floorLift(-2, -2, Number.NaN)).toBe(0);
  });
});
