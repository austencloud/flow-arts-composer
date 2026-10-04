import { describe, expect, it } from "vitest";
import {
  formatTakeClock,
  parseClock,
} from "$lib/shared/share/components/post-studio/builder/post-builder-format";

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
