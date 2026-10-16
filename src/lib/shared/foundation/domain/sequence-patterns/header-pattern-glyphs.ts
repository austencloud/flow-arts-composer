import type {
  ReversalGlyphData,
  TurnGlyphEntry,
} from "@tka/render-composition";
import type { SequenceData } from "../models/sequence-data.js";
import { deriveReversalGlyphData } from "./reversal-matcher.js";
import { deriveTurnGlyphEntries } from "./turn-pattern.js";

export interface HeaderPatternGlyphs {
  turnGlyphEntries: TurnGlyphEntry[] | null;
  reversalGlyph: ReversalGlyphData | null;
}

/** Omit a glyph when its complete period cannot fit in the header. */
export function deriveHeaderPatternGlyphs(
  sequence: SequenceData | null | undefined
): HeaderPatternGlyphs {
  if (!sequence?.steps?.length) {
    return { turnGlyphEntries: null, reversalGlyph: null };
  }

  const turnGlyphEntries = deriveTurnGlyphEntries(sequence);
  const reversalGlyph = deriveReversalGlyphData(sequence.steps);
  return {
    turnGlyphEntries: turnGlyphEntries.length <= 8 ? turnGlyphEntries : null,
    reversalGlyph:
      reversalGlyph && reversalGlyph.period <= 8 ? reversalGlyph : null,
  };
}
