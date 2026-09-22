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

  it("treats a braced word and its bare letters as equal in the tie-break", () => {
    // Braces used to sort after every Latin letter in the raw localeCompare
    // tie-break, so "{AB}" always landed after "AB" even though they name
    // the same letters. Stripped, they are equal and the stable sort keeps
    // input order either way round.
    const bracedFirst = sortSequencesByKineticAlphabet([{ word: "{AB}" }, { word: "AB" }]);
    expect(bracedFirst.map((s) => s.word)).toEqual(["{AB}", "AB"]);

    const bareFirst = sortSequencesByKineticAlphabet([{ word: "AB" }, { word: "{AB}" }]);
    expect(bareFirst.map((s) => s.word)).toEqual(["AB", "{AB}"]);
  });
});
