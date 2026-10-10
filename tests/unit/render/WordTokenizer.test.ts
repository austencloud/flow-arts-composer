import { describe, it, expect } from "vitest";
import { tokenizeWord } from "#lib/shared/pictograph/tka-glyph/utils/word-tokenizer.js";

describe("tokenizeWord", () => {
  it("splits ASCII word into individual letters", () => {
    expect(tokenizeWord("CAKE")).toEqual(["C", "A", "K", "E"]);
  });

  it("handles Greek letters as single tokens", () => {
    expect(tokenizeWord("ΣΔ")).toEqual(["Σ", "Δ"]);
  });

  it("groups dash letters as single tokens", () => {
    expect(tokenizeWord("W-")).toEqual(["W-"]);
  });

  it("handles mixed dash and non-dash letters", () => {
    expect(tokenizeWord("AW-B")).toEqual(["A", "W-", "B"]);
  });

  it("handles multiple dash letters", () => {
    expect(tokenizeWord("W-X-")).toEqual(["W-", "X-"]);
  });

  it("handles Greek dash letters", () => {
    expect(tokenizeWord("Σ-")).toEqual(["Σ-"]);
  });

  it("returns empty array for empty string", () => {
    expect(tokenizeWord("")).toEqual([]);
  });

  it("returns empty array for null/undefined-like empty", () => {
    expect(tokenizeWord("  ")).toEqual([" ", " "]);
  });
});
