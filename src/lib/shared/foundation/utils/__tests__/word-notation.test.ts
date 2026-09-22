import { describe, expect, it } from "vitest";
import {
  parseWordNotation,
  renderWordNotation,
  stripWordNotation,
  rotateWordUnits,
  areWordUnitsCircularEquivalent,
  findWordUnitsRotationOffset,
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

  it("returns null and undefined as an empty string", () => {
    expect(stripWordNotation(null)).toBe("");
    expect(stripWordNotation(undefined)).toBe("");
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

describe("rotateWordUnits", () => {
  it("rotates left by the given offset, wrapping around", () => {
    const units = parseWordNotation("A{ST}B");
    expect(rotateWordUnits(units, 0)).toEqual(units);
    expect(rotateWordUnits(units, 2)).toEqual([
      { letter: "T", skewed: true },
      { letter: "B", skewed: false },
      { letter: "A", skewed: false },
      { letter: "S", skewed: true },
    ]);
    // Offset equal to length wraps back to the start.
    expect(rotateWordUnits(units, units.length)).toEqual(units);
  });

  it("handles an empty unit array", () => {
    expect(rotateWordUnits([], 3)).toEqual([]);
  });
});

describe("areWordUnitsCircularEquivalent", () => {
  it("matches plain words that are rotations of each other", () => {
    expect(areWordUnitsCircularEquivalent("STS", "TSS")).toBe(true);
    expect(areWordUnitsCircularEquivalent("STS", "SST")).toBe(true);
    expect(areWordUnitsCircularEquivalent("STS", "STT")).toBe(false);
  });

  it("requires the skew mask to rotate along with the letters", () => {
    // Same letters, same rotation, but one word is bare and the other skewed.
    expect(areWordUnitsCircularEquivalent("STS", "{STS}")).toBe(false);
    expect(areWordUnitsCircularEquivalent("{STS}", "{TSS}")).toBe(true);
    // Same letters (no rotation needed, "ASTB" both times), but the skewed
    // run sits over a different pair of letters: the mask alone must fail.
    expect(areWordUnitsCircularEquivalent("A{ST}B", "AS{TB}")).toBe(false);
    // Rotation by 1 keeps the mask aligned with the same letters.
    expect(areWordUnitsCircularEquivalent("A{ST}B", "{ST}BA")).toBe(true);
  });

  it("rejects words of different letter length and accepts two empties", () => {
    expect(areWordUnitsCircularEquivalent("STS", "STSS")).toBe(false);
    expect(areWordUnitsCircularEquivalent("", "")).toBe(true);
    expect(areWordUnitsCircularEquivalent(null, undefined)).toBe(true);
  });
});

describe("findWordUnitsRotationOffset", () => {
  it("finds the smallest offset that aligns letters and skew flags", () => {
    expect(findWordUnitsRotationOffset("{STS}", "{TSS}")).toBe(1);
    expect(findWordUnitsRotationOffset("STS", "{STS}")).toBe(null);
    expect(findWordUnitsRotationOffset("A{ST}B", "{ST}BA")).toBe(1);
  });

  it("returns null for a unit-length mismatch and 0 for two empties", () => {
    expect(findWordUnitsRotationOffset("STS", "STSS")).toBe(null);
    expect(findWordUnitsRotationOffset("", "")).toBe(0);
    expect(findWordUnitsRotationOffset(null, undefined)).toBe(0);
  });

  it("returns 0 when no rotation is needed", () => {
    expect(findWordUnitsRotationOffset("A{ST}B", "A{ST}B")).toBe(0);
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
