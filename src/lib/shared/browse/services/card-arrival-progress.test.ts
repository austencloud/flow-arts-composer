import { describe, expect, it } from "vitest";
import {
  LAP_MS,
  NUMBERS_CEILING,
  OPENING_REACH,
  creepPoints,
  dashFor,
  drawKeyframes,
  finishDuration,
  finishPoints,
  fractionAt,
  numbersTarget,
  openingPoints,
  stepPoints,
  stillLength,
  travelAnimation,
} from "./card-arrival-progress.js";

// A drawing that completes early or grows to a finished-looking figure on a
// long wait still looks like a mandala in any one frame; only the numbers
// over time show it.

const SECOND = 1000;
const MINUTE = 60 * SECOND;

describe("openingPoints", () => {
  it("opens quickly to the opening length and keeps it, however long the wait", () => {
    const opening = openingPoints();
    const at = (ms: number) => fractionAt(opening, ms);
    expect(at(0)).toBe(0);
    expect(at(1 * SECOND)).toBeCloseTo(0.243, 2);
    expect(at(30 * SECOND)).toBe(OPENING_REACH);
    expect(at(5 * MINUTE)).toBe(OPENING_REACH);
  });

  it("never grows past the opening length on a clock", () => {
    const opening = openingPoints();
    for (let ms = 0; ms <= 10 * MINUTE; ms += 500) {
      expect(fractionAt(opening, ms)).toBeLessThanOrEqual(OPENING_REACH);
    }
    expect(OPENING_REACH).toBeLessThan(NUMBERS_CEILING);
  });
});

describe("step numbers", () => {
  it("move the length from where it was toward the ceiling", () => {
    expect(numbersTarget(0.3, 0, 8)).toBe(0.3);
    expect(numbersTarget(0.3, 4, 8)).toBeCloseTo(0.5, 10);
    expect(numbersTarget(0.3, 8, 8)).toBeCloseTo(NUMBERS_CEILING, 10);
  });

  it("never take the length past the ceiling before the picture is ready", () => {
    // A whole counted render, step by step, then a long wait after the last.
    const of = 12;
    let now = OPENING_REACH;
    for (let done = 1; done <= of; done++) {
      const target = numbersTarget(OPENING_REACH, done, of);
      const rest =
        target +
        (numbersTarget(OPENING_REACH, done + 1, of) - target) * 0.8;
      const points = stepPoints(now, target, rest, 280);
      for (let ms = 0; ms <= 5 * MINUTE; ms += 1000) {
        expect(fractionAt(points, ms)).toBeLessThanOrEqual(NUMBERS_CEILING);
      }
      now = fractionAt(points, 400);
    }
    const after = stepPoints(now, NUMBERS_CEILING, NUMBERS_CEILING, 280);
    expect(fractionAt(after, 5 * MINUTE)).toBeCloseTo(NUMBERS_CEILING, 10);
    expect(fractionAt(after, 5 * MINUTE)).toBeLessThan(1);
  });

  it("does not pull back a length already past the ceiling", () => {
    expect(numbersTarget(0.9, 3, 8)).toBe(0.9);
  });

  it("ease to the step's target, then creep short of the rest", () => {
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

  it("hold the length when the creep's ceiling is behind it", () => {
    const creep = creepPoints(0.8, 0.7);
    expect(fractionAt(creep, 0)).toBe(0.8);
    expect(fractionAt(creep, 20_000)).toBe(0.8);
  });
});

describe("stillLength", () => {
  it("shows an unfinished drawing under reduced motion", () => {
    expect(stillLength(null)).toBe(OPENING_REACH);
    expect(stillLength({ done: 4, of: 8 })).toBeCloseTo(0.5, 10);
    expect(stillLength({ done: 8, of: 8 })).toBeCloseTo(NUMBERS_CEILING, 10);
  });
});

describe("the finish", () => {
  it("closes the gap from the current length", () => {
    const from = OPENING_REACH;
    const ms = finishDuration(1 - from, 280, 800);
    const points = finishPoints(from, ms);
    expect(fractionAt(points, 0)).toBe(from);
    expect(fractionAt(points, ms / 2)).toBeCloseTo((from + 1) / 2, 10);
    expect(fractionAt(points, ms)).toBe(1);
    const late = finishPoints(NUMBERS_CEILING, 280);
    expect(fractionAt(late, 0)).toBe(NUMBERS_CEILING);
  });

  it("grows with what is left, between emphasis and three quarters of a scene", () => {
    expect(finishDuration(0.03, 280, 800)).toBe(280);
    expect(finishDuration(0.5, 280, 800)).toBe(400);
    expect(finishDuration(0.95, 280, 800)).toBe(600);
  });
});

describe("drawKeyframes", () => {
  it("lays a stretch out as one dash and its gap, in time order", () => {
    const points = stepPoints(0.2, 0.5, 0.6, 280);
    const { keyframes, duration } = drawKeyframes(points);
    expect(duration).toBe(points[points.length - 1]!.at);
    expect(keyframes[0]).toEqual({ strokeDasharray: "0.2 0.8", offset: 0 });
    expect(keyframes[keyframes.length - 1]!.offset).toBe(1);
    const offsets = keyframes.map((k) => Number(k.offset));
    expect([...offsets].sort((a, b) => a - b)).toEqual(offsets);
  });

  it("shows a fixed length at once for a stretch with no duration", () => {
    const { keyframes, duration } = drawKeyframes([{ at: 0, d: 0.3 }]);
    expect(duration).toBe(0);
    expect(keyframes.every((k) => k.strokeDasharray === "0.3 0.7")).toBe(true);
  });

  it("keeps the dash and gap inside one path length", () => {
    expect(dashFor(1)).toBe("1 0");
    expect(dashFor(1.2)).toBe("1 0");
    expect(dashFor(-0.1)).toBe("0 1");
  });
});

describe("travelAnimation", () => {
  it("slides one whole period a lap, evenly and for ever", () => {
    const { keyframes, timing } = travelAnimation();
    expect(keyframes).toEqual([
      { strokeDashoffset: 1 },
      { strokeDashoffset: 0 },
    ]);
    expect(timing.duration).toBe(LAP_MS);
    expect(LAP_MS).toBeGreaterThanOrEqual(6000);
    expect(LAP_MS).toBeLessThanOrEqual(8000);
    expect(timing.iterations).toBe(Infinity);
    expect(timing.easing).toBe("linear");
  });
});
