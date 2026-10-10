import { describe, expect, it } from "vitest";

import { Letter } from "#lib/shared/foundation/domain/models/letter.js";
import { syllablesOf, syllablesInWord } from "#lib/features/lab/pronunciation-recorder/domain/letter-syllables.js";

describe("syllablesOf", () => {
  it("covers every letter in the alphabet", () => {
    // A missing letter would silently read as one syllable and make every word
    // containing it look overrun, so it would be re-queued until it retired.
    for (const letter of Object.values(Letter)) {
      expect(syllablesOf(letter), `missing ${letter}`).toBeGreaterThan(0);
    }
  });

  it("counts the names that a rule would get wrong", () => {
    expect(syllablesOf(Letter.W)).toBe(3); // "double-you"
    expect(syllablesOf(Letter.PSI)).toBe(1); // "sigh"
    expect(syllablesOf(Letter.A)).toBe(1);
  });

  it("counts the Greek shorthand, not the full Greek name", () => {
    // The prompt asks for "ome", so the tape holds one syllable. Pricing Omega
    // at three would judge every read containing it as rushed and re-queue it.
    expect(syllablesOf(Letter.OMEGA)).toBe(1);
    expect(syllablesOf(Letter.SIGMA)).toBe(1);
    expect(syllablesOf(Letter.LAMBDA)).toBe(1);
    expect(syllablesOf(Letter.ALPHA)).toBe(1);
  });

  it("adds one syllable for the spoken dash", () => {
    expect(syllablesOf(Letter.W_DASH)).toBe(syllablesOf(Letter.W) + 1);
    expect(syllablesOf(Letter.SIGMA_DASH)).toBe(syllablesOf(Letter.SIGMA) + 1);
  });

  it("sums a word", () => {
    // "alp" + "double-you" + "sigh"
    expect(syllablesInWord([Letter.ALPHA, Letter.W, Letter.PSI])).toBe(5);
  });
});
