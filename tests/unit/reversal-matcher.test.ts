import { describe, it, expect } from "vitest";
import {
  computeReversalSignature,
  findMatchingReversalPattern,
  matchReversalPatternId,
  stepToReversalSymbol,
} from "#lib/features/choreo-card/domain/reversal-matcher.js";

type StepLite = { leftReversal: boolean; rightReversal: boolean };

function mk(symbols: string): StepLite[] {
  return [...symbols].map((s) => {
    switch (s) {
      case "P": return { leftReversal: true, rightReversal: true };
      case "R": return { leftReversal: false, rightReversal: true };
      case "B": return { leftReversal: true, rightReversal: false };
      default:  return { leftReversal: false, rightReversal: false };
    }
  });
}

describe("stepToReversalSymbol", () => {
  it("maps all four symbol states", () => {
    expect(stepToReversalSymbol({ leftReversal: false, rightReversal: false })).toBe("-");
    expect(stepToReversalSymbol({ leftReversal: true, rightReversal: true })).toBe("P");
    expect(stepToReversalSymbol({ leftReversal: false, rightReversal: true })).toBe("R");
    expect(stepToReversalSymbol({ leftReversal: true, rightReversal: false })).toBe("B");
  });
});

describe("computeReversalSignature", () => {
  it("joins per-beat symbols", () => {
    expect(computeReversalSignature(mk("-P-R"))).toBe("-P-R");
  });
});

describe("findMatchingReversalPattern", () => {
  it("matches continuous for all-dash signature", () => {
    expect(matchReversalPatternId(mk("----"))).toBe("continuous");
    expect(matchReversalPatternId(mk("--------"))).toBe("continuous");
  });

  it("matches book for PPPP and its periodic extension", () => {
    expect(matchReversalPatternId(mk("PPPP"))).toBe("book");
    expect(matchReversalPatternId(mk("PPPPPPPP"))).toBe("book");
  });

  it("matches red-book, blue-book", () => {
    expect(matchReversalPatternId(mk("RRRR"))).toBe("red-book");
    expect(matchReversalPatternId(mk("BBBB"))).toBe("blue-book");
  });

  it("matches long-book period-2 P-P-", () => {
    expect(matchReversalPatternId(mk("P-P-"))).toBe("long-book");
    expect(matchReversalPatternId(mk("P-P-P-P-"))).toBe("long-book");
  });

  it("matches alternating RBRB period-2", () => {
    expect(matchReversalPatternId(mk("RBRB"))).toBe("alternating");
    expect(matchReversalPatternId(mk("RBRBRBRB"))).toBe("alternating");
  });

  it("matches solo-1 RBBRBRRB period-8", () => {
    expect(matchReversalPatternId(mk("RBBRBRRB"))).toBe("solo-1");
    expect(matchReversalPatternId(mk("RBBRBRRBRBBRBRRB"))).toBe("solo-1");
  });

  it("returns null when signature doesn't match any pattern", () => {
    expect(matchReversalPatternId(mk("PRBR"))).toBeNull();
  });

  it("returns null for empty step array", () => {
    expect(findMatchingReversalPattern([])).toBeNull();
  });

  it("rejects signatures shorter than minBeats for solo patterns", () => {
    // solo-1 needs 8 beats; a 4-beat RBBR is not enough
    expect(matchReversalPatternId(mk("RBBR"))).toBeNull();
  });
});
