import { describe, it, expect } from "vitest";
import {
  getShoulderPosition,
  computeReachPercentage,
} from "#lib/features/lab/tabs/spatial-lab/services/reach-calculator.js";

describe("getShoulderPosition", () => {
  const body = { x: 300, y: 330 };
  const shoulderDist = 34;

  it("places shoulders horizontally when body faces forward", () => {
    const left = getShoulderPosition("left", 0, body, shoulderDist);
    const right = getShoulderPosition("right", 0, body, shoulderDist);
    expect(left.x).toBeLessThan(body.x);
    expect(right.x).toBeGreaterThan(body.x);
    expect(Math.abs(left.y - right.y)).toBeLessThan(1);
  });

  it("rotates shoulders with body", () => {
    const left = getShoulderPosition("left", 90, body, shoulderDist);
    expect(left.y).toBeLessThan(body.y);
    expect(Math.abs(left.x - body.x)).toBeLessThan(5);
  });
});

describe("computeReachPercentage", () => {
  it("returns 0 when prop at shoulder", () => {
    const pct = computeReachPercentage({ x: 100, y: 100 }, { x: 100, y: 100 }, 165);
    expect(pct).toBe(0);
  });

  it("returns 100 at max reach", () => {
    const pct = computeReachPercentage({ x: 0, y: 0 }, { x: 165, y: 0 }, 165);
    expect(pct).toBe(100);
  });

  it("returns > 100 when out of reach", () => {
    const pct = computeReachPercentage({ x: 0, y: 0 }, { x: 200, y: 0 }, 165);
    expect(pct).toBeGreaterThan(100);
  });
});
