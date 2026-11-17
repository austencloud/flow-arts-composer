import { describe, expect, it } from "vitest";
import {
  formatGridOffset,
  formatPostSpeed,
  formatTakeClock,
  gridOffsetDraft,
  parseClock,
} from "#lib/shared/share/components/post-studio/builder/post-builder-format.js";
import {
  GRID_FINE_STEP_SECONDS,
  MIN_MOVE_SECONDS,
  steppedGridOffset,
} from "#lib/shared/media-composition/domain/take-timing.js";

describe("Whole grid's reading and steps", () => {
  it("reads to the millisecond, so 0.387 no longer shows as 0.39", () => {
    expect(formatGridOffset(0.387)).toBe("+0.387 s");
    expect(formatGridOffset(-0.05)).toBe("-0.050 s");
    expect(formatGridOffset(1.2)).toBe("+1.200 s");
  });

  it("opens the typed box on the stored value", () => {
    expect(gridOffsetDraft(0.387)).toBe("0.387");
    expect(gridOffsetDraft(0.420333)).toBe("0.420333");
    expect(gridOffsetDraft(-0.01)).toBe("-0.01");
    expect(gridOffsetDraft(0)).toBe("0");
  });

  it("a 10 ms press lands on the exact next value, again and again", () => {
    expect(steppedGridOffset(0.387, GRID_FINE_STEP_SECONDS)).toBe(0.397);
    let offset = 0.387;
    for (let press = 0; press < 30; press += 1) {
      offset = steppedGridOffset(offset, -GRID_FINE_STEP_SECONDS);
    }
    expect(offset).toBe(0.087);
    expect(formatGridOffset(offset)).toBe("+0.087 s");
  });

  it("a frame step still moves one frame", () => {
    expect(steppedGridOffset(0, MIN_MOVE_SECONDS)).toBe(0.033333);
  });
});

describe("formatPostSpeed", () => {
  it("rounds a clip speed to two decimals", () => {
    // The timeline badge once printed this one as 0.9774999970674999×.
    expect(formatPostSpeed(0.9774999970674999)).toBe("0.98×");
    expect(formatPostSpeed(2.1781)).toBe("2.18×");
  });

  it("drops trailing zeros", () => {
    expect(formatPostSpeed(1.5)).toBe("1.5×");
    expect(formatPostSpeed(2)).toBe("2×");
    expect(formatPostSpeed(0.25)).toBe("0.25×");
  });
});

describe("parseClock", () => {
  it("reads a clock or plain seconds", () => {
    expect(parseClock("1:23.45")).toBeCloseTo(83.45, 9);
    expect(parseClock("83.45")).toBeCloseTo(83.45, 9);
    expect(parseClock("83")).toBe(83);
    expect(parseClock("0:05")).toBe(5);
    expect(parseClock(".5")).toBe(0.5);
  });

  it("takes a decimal comma and a trailing s", () => {
    expect(parseClock("1:23,45")).toBeCloseTo(83.45, 9);
    expect(parseClock("83 s")).toBe(83);
    expect(parseClock("2.5s")).toBe(2.5);
  });

  it("reads back every time it shows", () => {
    for (const seconds of [0, 0.03, 9.99, 59.99, 60, 83.45, 754.2]) {
      expect(parseClock(formatTakeClock(seconds))).toBeCloseTo(seconds, 9);
    }
  });

  it("has no time for text that is not one", () => {
    expect(parseClock("")).toBeNull();
    expect(parseClock("abc")).toBeNull();
    expect(parseClock("-2")).toBeNull();
    expect(parseClock("1:75")).toBeNull();
    expect(parseClock("1:2:3")).toBeNull();
  });
});
