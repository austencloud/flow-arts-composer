import { describe, expect, it } from "vitest";
import { compressWord, simplifyRepeatedWord } from "../src/word-display.js";

describe("portable card title display", () => {
  it("reduces a repeated full LOOP word before header compression", () => {
    const title = simplifyRepeatedWord("ABCDABCDABCDABCD");
    expect(title).toBe("ABCD");
    expect(compressWord(title)).toEqual([
      { tokens: ["A", "B", "C", "D"], repeat: 1 },
    ]);
  });

  it("preserves partial repeated runs as bracket-ready compression segments", () => {
    expect(compressWord("ABABABCD")).toEqual([
      { tokens: ["A", "B"], repeat: 3 },
      { tokens: ["C", "D"], repeat: 1 },
    ]);
  });

  it("groups an inverted LOOP at the half boundary without repeated runs", () => {
    expect(compressWord("MW-Θ-QNX-Ω-P")).toEqual([
      { tokens: ["M", "W-", "Θ-", "Q"], repeat: 1 },
      { tokens: ["N", "X-", "Ω-", "P"], repeat: 1 },
    ]);
  });

  it("does not group a mismatched or incomplete inverse", () => {
    expect(compressWord("MW-Θ-QNX-Ω-Q")).toEqual([
      { tokens: ["M", "W-", "Θ-", "Q", "N", "X-", "Ω-", "Q"], repeat: 1 },
    ]);
    expect(compressWord("MW-Θ-QNX-Ω-")).toEqual([
      { tokens: ["M", "W-", "Θ-", "Q", "N", "X-", "Ω-"], repeat: 1 },
    ]);
  });

  it("retains repetition inside each inverse half", () => {
    expect(compressWord("ABABBABA")).toEqual([
      { tokens: ["A", "B"], repeat: 2 },
      { tokens: ["B", "A"], repeat: 2 },
    ]);
  });

  it("retains a single compressed repeated group", () => {
    expect(compressWord("AAAA")).toEqual([{ tokens: ["A"], repeat: 4 }]);
  });
});
