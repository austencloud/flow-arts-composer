import { describe, expect, it } from "vitest";
import {
  parseWordNotation,
  renderWordNotation,
  stripWordNotation,
} from "../word-notation";
import { splitWordLetterUnits } from "@tka/render-composition";
import { Letter } from "$lib/shared/foundation/domain/models/letter";

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

describe("parseWordNotation against the canonical tokenizer", () => {
  // splitWordLetterUnits (from @tka/render-composition, the same specifier
  // word-simplifier.ts imports it through) already skips any character
  // outside its letter class, braces included, so it doubles as the reference
  // implementation for "what counts as a letter unit" independent of skew.
  it("agrees with splitWordLetterUnits on plain, dash, Greek and braced words", () => {
    const words = ["ABC", "A{W-}B", "{Σ-Δ-}ζ", "W-X-", "Φ-"];
    for (const word of words) {
      expect(parseWordNotation(word).map((unit) => unit.letter)).toEqual(
        splitWordLetterUnits(word)
      );
    }
  });

  it("round-trips every canonical letter unchanged, bare and braced", () => {
    for (const letter of Object.values(Letter)) {
      expect(renderWordNotation(parseWordNotation(letter))).toBe(letter);
      const braced = `{${letter}}`;
      expect(renderWordNotation(parseWordNotation(braced))).toBe(braced);
    }
  });
});

describe("malformed brace input", () => {
  it("normalizes rather than throwing", () => {
    expect(renderWordNotation(parseWordNotation("A{BC"))).toBe("A{BC}");
    expect(renderWordNotation(parseWordNotation("{{A}}"))).toBe("{A}");
    expect(renderWordNotation(parseWordNotation("A{}B"))).toBe("AB");
    expect(() => parseWordNotation("}A{")).not.toThrow();
  });
});
