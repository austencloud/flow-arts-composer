import { describe, expect, it } from "vitest";

import { buildWordFiles, nextWordId } from "#lib/features/lab/pronunciation-recorder/services/implementations/CorpusSessionStore.js";

describe("buildWordFiles", () => {
  it("writes the TKA letters to words.json and the short names to the .lab", () => {
    // Two consumers, two formats: measure-word-segmentation.ts tokenizes the
    // TKA word, and the aligner needs the tokens that are actually on the tape.
    // Short names, lowercased, every one of them in tka-letters.dict.
    const files = buildWordFiles("01", ["Σ-", "α"]);

    expect(files.wavName).toBe("01.wav");
    expect(files.labName).toBe("01.lab");
    expect(files.labText).toBe("sig dash alp");
    // The letters survive alongside the joined word: "Σ-α" cannot be re-split
    // without the alphabet, and a mis-split pairs every letter with the wrong
    // aligned span.
    expect(files.entry).toEqual({
      file: "01.wav",
      word: "Σ-α",
      letters: ["Σ-", "α"],
    });
  });

  it("handles a solo read", () => {
    const files = buildWordFiles("07", ["Ω"]);

    expect(files.labText).toBe("ome");
    expect(files.entry).toEqual({ file: "07.wav", word: "Ω", letters: ["Ω"] });
  });
});

describe("nextWordId", () => {
  it("zero-pads so the directory sorts in reading order", () => {
    expect(nextWordId(0)).toBe("001");
    expect(nextWordId(41)).toBe("042");
    expect(nextWordId(999)).toBe("1000");
  });
});
