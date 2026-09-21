import { describe, expect, it } from "vitest";
import { extractBaseLetter, sortSequencesByKineticAlphabet } from "../kinetic-alphabet-sort";

describe("extractBaseLetter", () => {
  it("reads the first letter, keeping dash variants and Type 6 case", () => {
    expect(extractBaseLetter("ABC")).toBe("A");
    expect(extractBaseLetter("W-AB")).toBe("W-");
    expect(extractBaseLetter("ζA")).toBe("ζ");
    expect(extractBaseLetter("")).toBe("");
  });

  it("looks through skew braces", () => {
    expect(extractBaseLetter("{USUS}")).toBe("U");
    expect(extractBaseLetter("{W-A}")).toBe("W-");
    expect(extractBaseLetter("{ζ}")).toBe("ζ");
  });
});

describe("sortSequencesByKineticAlphabet", () => {
  it("files a braced word under its first letter", () => {
    const sorted = sortSequencesByKineticAlphabet([
      { word: "{US}" },
      { word: "A" },
      { word: "T" },
    ]);
    expect(sorted.map((s) => s.word)).toEqual(["A", "T", "{US}"]);
  });
});
