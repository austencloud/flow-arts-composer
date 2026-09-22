import { describe, expect, it } from "vitest";
import { SimilarityCalculator } from "./similarity-calculator";
import type { StepSignatureGenerator } from "./step-signature-generator";
import type { SequenceAligner } from "./sequence-aligner";
import { createSequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";

// computeQuickScore's circular-word branch never reaches the step-signature
// generator or aligner, so both constructor deps are unused stubs here.
const calculator = new SimilarityCalculator(
  {} as StepSignatureGenerator,
  {} as SequenceAligner
);

function circularSequence(word: string) {
  return createSequenceData({
    id: "TEST",
    word,
    isCircular: true,
    // No visible motions, so a fallthrough to quickMotionCompare would
    // score 0 rather than accidentally matching. This keeps the two cases
    // below unambiguous about which branch produced the result.
    steps: Array.from(
      { length: 3 },
      () => ({ motions: { left: null, right: null } }) as unknown as StepData
    ),
  });
}

describe("SimilarityCalculator.computeQuickScore circular word check", () => {
  it("does not treat a skewed word as equivalent to its bare letters", () => {
    const result = calculator.computeQuickScore(
      circularSequence("{STS}"),
      circularSequence("STS")
    );
    expect(result).not.toEqual({
      score: 0.9,
      likelyEquivalent: true,
      confidence: 0.85,
    });
    expect(result.likelyEquivalent).toBe(false);
  });

  it("treats two skewed words as equivalent when their skew masks rotate together", () => {
    const result = calculator.computeQuickScore(
      circularSequence("{STS}"),
      circularSequence("{TSS}")
    );
    expect(result).toEqual({
      score: 0.9,
      likelyEquivalent: true,
      confidence: 0.85,
    });
  });
});
