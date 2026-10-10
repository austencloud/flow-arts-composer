import { describe, expect, it } from "vitest";
import {
  normalizeTyped,
  parseTypedNumber,
  splitReading,
} from "#lib/shared/ui/typed-number.js";

describe("parseTypedNumber", () => {
  it("reads the first number, whatever unit follows it", () => {
    expect(parseTypedNumber("120")).toBe(120);
    expect(parseTypedNumber(" 120% ")).toBe(120);
    expect(parseTypedNumber("-4.5°")).toBe(-4.5);
    expect(parseTypedNumber("+2")).toBe(2);
    expect(parseTypedNumber(".5")).toBe(0.5);
    expect(parseTypedNumber("540 px")).toBe(540);
  });

  it("takes a decimal comma and a typographic minus", () => {
    expect(parseTypedNumber("1,5")).toBe(1.5);
    expect(parseTypedNumber("\u22122")).toBe(-2);
    expect(parseTypedNumber("\u20133,25")).toBe(-3.25);
  });

  it("has no value for text without a number", () => {
    expect(parseTypedNumber("")).toBeNull();
    expect(parseTypedNumber("abc")).toBeNull();
    expect(parseTypedNumber("-")).toBeNull();
  });
});

describe("splitReading", () => {
  it("opens a reading on its number with the unit beside it", () => {
    expect(splitReading("120%")).toEqual({ draft: "120", unit: "%" });
    expect(splitReading("-4.5°")).toEqual({ draft: "-4.5", unit: "°" });
    expect(splitReading("1.25×")).toEqual({ draft: "1.25", unit: "×" });
    expect(splitReading("540 px")).toEqual({ draft: "540", unit: "px" });
  });

  it("opens a reading with no number as itself", () => {
    expect(splitReading(" Off ")).toEqual({ draft: "Off", unit: "" });
  });
});

describe("normalizeTyped", () => {
  it("makes a decimal comma and dashes plain", () => {
    expect(normalizeTyped(" 1,5 ")).toBe("1.5");
    expect(normalizeTyped("\u2212\u2012\u2013\u2014")).toBe("----");
  });
});
