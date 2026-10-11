import { describe, it, expect } from "vitest";
import {
  computeTargetRotation,
  stepRotation,
} from "#lib/features/lab/tabs/spatial-lab/services/body-rotation-solver.js";

describe("computeTargetRotation", () => {
  const body = { x: 300, y: 330 };
  const BEHIND_THRESHOLD = 30;

  it("faces toward single front prop", () => {
    const angle = computeTargetRotation(
      { x: 460, y: 180 },
      { x: 460, y: 180 },
      body,
      BEHIND_THRESHOLD,
    );
    expect(angle).toBeGreaterThan(30);
    expect(angle).toBeLessThan(60);
  });

  it("faces straight ahead when both props centered", () => {
    const angle = computeTargetRotation(
      { x: 290, y: 180 },
      { x: 310, y: 180 },
      body,
      BEHIND_THRESHOLD,
    );
    expect(Math.abs(angle!)).toBeLessThan(5);
  });

  it("ignores behind-body props in rotation calculation", () => {
    const angle = computeTargetRotation(
      { x: 460, y: 180 },
      { x: 140, y: 480 },
      body,
      BEHIND_THRESHOLD,
    );
    expect(angle).toBeGreaterThan(25);
  });

  it("holds current angle when all props behind", () => {
    const angle = computeTargetRotation(
      { x: 140, y: 480 },
      { x: 460, y: 480 },
      body,
      BEHIND_THRESHOLD,
    );
    expect(angle).toBeNull();
  });

  it("clamps to ±90 degrees", () => {
    const angle = computeTargetRotation(
      { x: 520, y: 330 },
      { x: 520, y: 330 },
      body,
      BEHIND_THRESHOLD,
    );
    expect(Math.abs(angle!)).toBeLessThanOrEqual(90);
  });
});

describe("stepRotation", () => {
  it("moves toward target within speed limit", () => {
    const result = stepRotation(0, 45, 3);
    expect(result).toBe(3);
  });

  it("snaps to target when within speed limit", () => {
    const result = stepRotation(44, 45, 3);
    expect(result).toBe(45);
  });

  it("takes shortest path across ±180 boundary", () => {
    const result = stepRotation(178, -178, 3);
    expect(result).toBeGreaterThan(178);
  });
});
