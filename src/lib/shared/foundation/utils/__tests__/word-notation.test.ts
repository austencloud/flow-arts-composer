import { describe, expect, it } from "vitest";
import {
  parseWordNotation,
  renderWordNotation,
  stripWordNotation,
} from "../word-notation";

describe("parseWordNotation", () => {
  it("reads plain words as unskewed units, keeping dash suffixes", () => {
    expect(parseWordNotation("AW-B")).toEqual([
      { letter: "A", skewed: false },
      { letter: "W-", skewed: false },
      { letter: "B", skewed: false },
    ]);
  });

  it("flags units inside braces", () => {
    expect(parseWordNotation("A{STΣ-}G")).toEqual([
      { letter: "A", skewed: false },
      { letter: "S", skewed: true },
      { letter: "T", skewed: true },
      { letter: "Σ-", skewed: true },
      { letter: "G", skewed: false },
    ]);
  });

  it("skips characters that are not letters", () => {
    expect(parseWordNotation("A B!")).toEqual([
      { letter: "A", skewed: false },
      { letter: "B", skewed: false },
    ]);
    expect(parseWordNotation("")).toEqual([]);
  });
});

describe("renderWordNotation", () => {
  it("wraps each maximal skewed run in one pair of braces", () => {
    expect(
      renderWordNotation([
        { letter: "A", skewed: false },
        { letter: "S", skewed: true },
        { letter: "T", skewed: true },
        { letter: "S", skewed: true },
        { letter: "B", skewed: false },
        { letter: "ζ", skewed: true },
      ])
    ).toBe("A{STS}B{ζ}");
  });

  it("renders a fully skewed word as one span", () => {
    expect(
      renderWordNotation([
        { letter: "U", skewed: true },
        { letter: "S", skewed: true },
      ])
    ).toBe("{US}");
  });

  it("round-trips through parse", () => {
    for (const word of ["", "A", "AW-B", "{US}", "A{STS}B{ζ}", "{Σ-Δ-}"]) {
      expect(renderWordNotation(parseWordNotation(word))).toBe(word);
    }
  });
});

describe("stripWordNotation", () => {
  it("removes braces and nothing else", () => {
    expect(stripWordNotation("A{STS}B{ζ}")).toBe("ASTSBζ");
    expect(stripWordNotation("{W-}")).toBe("W-");
    expect(stripWordNotation("plain")).toBe("plain");
    expect(stripWordNotation("")).toBe("");
  });
});
