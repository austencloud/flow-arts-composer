import { describe, expect, it } from "vitest";
import { createStepData } from "#lib/shared/foundation/domain/factories/create-step-data.js";
import { createSequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { createMotionData } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
import { deriveHeaderPatternGlyphs } from "#lib/shared/foundation/domain/sequence-patterns/header-pattern-glyphs.js";
import { deriveTurnGlyphEntries, deriveTurnLabel } from "#lib/shared/foundation/domain/sequence-patterns/turn-pattern.js";
import { matchReversalPatternId } from "#lib/shared/foundation/domain/sequence-patterns/reversal-matcher.js";

type Turns = Parameters<typeof createMotionData>[0]["turns"];

function sequence(
  rows: readonly { left: Turns; right: Turns; reversal: string }[],
) {
  return createSequenceData({
    steps: rows.map((row, index) => createStepData({
      stepNumber: index + 1,
      leftReversal: row.reversal === "P" || row.reversal === "B",
      rightReversal: row.reversal === "P" || row.reversal === "R",
      motions: {
        left: createMotionData({ turns: row.left }),
        right: createMotionData({ turns: row.right }),
      },
    })),
  });
}

describe("header pattern glyph data", () => {
  it("omits both glyphs for missing or empty sequences", () => {
    expect(deriveHeaderPatternGlyphs(null)).toEqual({ turnGlyphEntries: null, reversalGlyph: null });
    expect(deriveHeaderPatternGlyphs(undefined)).toEqual({ turnGlyphEntries: null, reversalGlyph: null });
    expect(deriveHeaderPatternGlyphs(createSequenceData())).toEqual({ turnGlyphEntries: null, reversalGlyph: null });
    // The card back retains its historical empty-sequence zero bar.
    expect(deriveTurnGlyphEntries(createSequenceData())).toEqual([{ left: 0, right: 0 }]);
  });

  it("compresses numeric and float turns for both hands without losing values", () => {
    const data = sequence([
      { left: 0.5, right: "fl", reversal: "R" },
      { left: "fl", right: 2.5, reversal: "B" },
      { left: 0.5, right: "fl", reversal: "R" },
      { left: "fl", right: 2.5, reversal: "B" },
    ]);
    const result = deriveHeaderPatternGlyphs(data);
    expect(result.turnGlyphEntries).toEqual([
      { left: 0.5, right: 0, leftFloat: false, rightFloat: true },
      { left: 0, right: 2.5, leftFloat: true, rightFloat: false },
    ]);
    expect(deriveTurnLabel(result.turnGlyphEntries!)).toBe("½-2½+FL");
    expect(result.reversalGlyph).toEqual({ sequence: "RBRB", period: 2 });
  });

  it("uses the raw reversal signature even when the catalog has no match", () => {
    const data = sequence("PRB-".split("").map(reversal => ({ left: 1, right: 2, reversal })));
    expect(matchReversalPatternId(data.steps)).toBeNull();
    expect(deriveHeaderPatternGlyphs(data).reversalGlyph).toEqual({ sequence: "PRB-", period: 4 });
  });

  it("independently omits periods above eight but keeps long repeats", () => {
    const turnRows = Array.from({ length: 9 }, (_, i) => ({ left: i, right: i / 2, reversal: "P" }));
    expect(deriveHeaderPatternGlyphs(sequence(turnRows))).toEqual({
      turnGlyphEntries: null,
      reversalGlyph: { sequence: "P".repeat(9), period: 1 },
    });

    const reversalRows = "PRB-PRB-R".split("").map(reversal => ({ left: 1, right: 2, reversal }));
    expect(deriveHeaderPatternGlyphs(sequence(reversalRows))).toEqual({
      turnGlyphEntries: [{ left: 1, right: 2, leftFloat: false, rightFloat: false }],
      reversalGlyph: null,
    });

    const repeated = "PRB".repeat(6).split("").map((reversal, i) => ({
      left: [0, 0.5, 1][i % 3]!, right: [1, 1.5, 2][i % 3]!, reversal,
    }));
    const result = deriveHeaderPatternGlyphs(sequence(repeated));
    expect(result.turnGlyphEntries).toHaveLength(3);
    expect(result.reversalGlyph).toEqual({ sequence: "PRB".repeat(6), period: 3 });
  });
});
