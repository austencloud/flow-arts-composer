import { describe, expect, it } from "vitest";
import {
  NUMBERS_CEILING,
  WAIT_CEILING,
  creepPoints,
  drawKeyframes,
  finishDuration,
  fractionAt,
  numbersTarget,
  openingPoints,
  stepPoints,
} from "./card-arrival-progress.js";

// A drawing that finishes early, stops, or steps backwards still looks like a
// mandala in any one frame; only the numbers over time show it.

describe("openingPoints", () => {
  it("opens quickly, then draws 3% of the line a second", () => {
    const opening = openingPoints();
    const at = (ms: number) => fractionAt(opening, ms);
    expect(at(0)).toBe(0);
    expect(at(500)).toBeCloseTo(0.185, 2);
    expect(at(1000)).toBeCloseTo(0.273, 2);
    expect(at(2000)).toBeCloseTo(0.349, 2);
    expect(at(4000)).toBeCloseTo(0.42, 2);
    expect(at(8000)).toBeCloseTo(0.54, 2);
    expect(at(12_000)).toBeCloseTo(0.66, 2);
  });

  it("never slows below a pace a reader can see until it is nearly drawn", () => {
    const opening = openingPoints();
    for (let ms = 0; ms < 20_000; ms += 250) {
      const gained = fractionAt(opening, ms + 250) - fractionAt(opening, ms);
      expect(gained).toBeGreaterThanOrEqual(0.0074);
    }
  });

  it("slows past the numbers' ceiling and stops short of complete", () => {
    const opening = openingPoints();
    expect(fractionAt(opening, 20_000)).toBeCloseTo(NUMBERS_CEILING, 3);
    expect(fractionAt(opening, 23_500)).toBeCloseTo(0.935, 3);
    expect(fractionAt(opening, 60_000)).toBe(WAIT_CEILING);
  });
});

describe("creepPoints", () => {
  it("follows t / (t + 1.2 s) of the way to its ceiling", () => {
    const creep = creepPoints(0, 0.6);
    const expected = (ms: number) => (0.6 * ms) / (ms + 1200);
    for (const ms of [500, 1000, 2000, 5000, 10_000]) {
      expect(fractionAt(creep, ms)).toBeCloseTo(expected(ms), 2);
    }
  });

  it("keeps moving and never reaches its ceiling", () => {
    const creep = creepPoints(0.9, WAIT_CEILING);
    let before = fractionAt(creep, 0);
    expect(before).toBe(0.9);
    for (let ms = 400; ms <= 30_000; ms += 400) {
      const now = fractionAt(creep, ms);
      expect(now).toBeGreaterThan(before);
      expect(now).toBeLessThan(WAIT_CEILING);
      before = now;
    }
  });

  it("holds its line when it is already past the ceiling", () => {
    const creep = creepPoints(0.95, 0.9);
    expect(fractionAt(creep, 0)).toBe(0.95);
    expect(fractionAt(creep, 20_000)).toBe(0.95);
  });
});

describe("numbersTarget", () => {
  it("counts from where the line was to the numbers' ceiling", () => {
    expect(numbersTarget(0.3, 0, 8)).toBe(0.3);
    expect(numbersTarget(0.3, 4, 8)).toBeCloseTo(0.6, 10);
    expect(numbersTarget(0.3, 8, 8)).toBeCloseTo(NUMBERS_CEILING, 10);
  });

  it("does not pull back a line already past the ceiling", () => {
    expect(numbersTarget(0.95, 3, 8)).toBe(0.95);
  });
});

describe("stepPoints", () => {
  it("reaches the step's target after the ease and creeps short of the rest", () => {
    const points = stepPoints(0.3, 0.4, 0.48, 280);
    expect(fractionAt(points, 0)).toBe(0.3);
    expect(fractionAt(points, 280)).toBeCloseTo(0.4, 10);
    let before = 0.3;
    for (let ms = 40; ms <= 20_000; ms += 40) {
      const now = fractionAt(points, ms);
      expect(now).toBeGreaterThan(before);
      expect(now).toBeLessThan(0.48);
      before = now;
    }
  });
});

describe("finishDuration", () => {
  it("grows with what is left, between emphasis and three quarters of a scene", () => {
    expect(finishDuration(0.03, 280, 800)).toBe(280);
    expect(finishDuration(0.5, 280, 800)).toBe(400);
    expect(finishDuration(0.95, 280, 800)).toBe(600);
  });
});

describe("drawKeyframes", () => {
  it("lays a stretch out as dash offsets in time order", () => {
    const points = stepPoints(0.2, 0.5, 0.6, 280);
    const { keyframes, duration } = drawKeyframes(points);
    expect(duration).toBe(points[points.length - 1]!.at);
    expect(keyframes[0]).toEqual({ strokeDashoffset: 0.8, offset: 0 });
    expect(keyframes[keyframes.length - 1]!.offset).toBe(1);
    const offsets = keyframes.map((k) => Number(k.offset));
    expect([...offsets].sort((a, b) => a - b)).toEqual(offsets);
  });

  it("shows a finished drawing at once for a stretch with no length", () => {
    const { keyframes, duration } = drawKeyframes([{ at: 0, d: 1 }]);
    expect(duration).toBe(0);
    expect(keyframes.every((k) => k.strokeDashoffset === 0)).toBe(true);
  });
});
