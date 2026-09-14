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
});
