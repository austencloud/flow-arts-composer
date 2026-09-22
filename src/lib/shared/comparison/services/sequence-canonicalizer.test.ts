import { describe, expect, it } from "vitest";
import { SequenceCanonicalizer } from "./sequence-canonicalizer";
import type { StepSignatureGenerator } from "./step-signature-generator";
import type { WordCyclicEquivalenceDetector } from "$lib/shared/foundation/utils/word-cyclic-equivalence-detector";
import {
  areCyclicEquivalent,
  getAllRotations,
  getCanonicalForm,
  findRotationOffset,
} from "$lib/shared/foundation/utils/word-cyclic-equivalence-detector";
import { createSequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";

// Beat signatures are irrelevant to the word/offset behavior under test, so
// the generator stub just needs to return something combineHashes can join.
const stepSignatureGenerator: StepSignatureGenerator = {
  generateSignatures: () => [],
} as unknown as StepSignatureGenerator;

const wordCyclicEquivalenceDetector: WordCyclicEquivalenceDetector = {
  areCyclicEquivalent,
  getCanonicalForm,
  getAllRotations,
  findRotationOffset,
};

const canonicalizer = new SequenceCanonicalizer(
  stepSignatureGenerator,
  wordCyclicEquivalenceDetector
);

function circularSequence(word: string, stepCount: number) {
  return createSequenceData({
    id: "TEST",
    word,
    isCircular: true,
    steps: Array.from({ length: stepCount }, () => ({}) as StepData),
  });
}

describe("SequenceCanonicalizer circular rotation with skew braces", () => {
  it("keeps every letter skewed when the whole word rotates", () => {
    // Letters "STS" canonicalize to "SST" (lexicographically smallest
    // rotation), found at letter-offset 2. The whole original word was
    // skewed, so the canonical word must stay fully skewed too.
    const result = canonicalizer.canonicalize(circularSequence("{STS}", 3));
    expect(result.signature.canonicalWord).toBe("{SST}");
    expect(result.circularOffsetApplied).toBe(2);
  });

  it("carries a partial skew span to its rotated position", () => {
    // Letters "BSTA" canonicalize to "ABST" at letter-offset 3. Only "ST"
    // was skewed in the original word; after rotation it must still be
    // the same two letters wrapped in braces, now following "AB".
    const result = canonicalizer.canonicalize(circularSequence("B{ST}A", 4));
    expect(result.signature.canonicalWord).toBe("AB{ST}");
    expect(result.circularOffsetApplied).toBe(3);
  });

  it("leaves an already-canonical bare word untouched", () => {
    const result = canonicalizer.canonicalize(circularSequence("ABCD", 4));
    expect(result.signature.canonicalWord).toBe("ABCD");
    expect(result.circularOffsetApplied).toBe(0);
  });

  it("generateHash uses the same brace-aware canonical word and offset", () => {
    const hash = canonicalizer.generateHash(circularSequence("{STS}", 3));
    expect(hash.startsWith("{SST}:3:C:")).toBe(true);
  });

  it("does not rotate a non-circular sequence's word", () => {
    const sequence = createSequenceData({
      id: "TEST",
      word: "{STS}",
      isCircular: false,
      steps: Array.from({ length: 3 }, () => ({}) as StepData),
    });
    const result = canonicalizer.canonicalize(sequence);
    expect(result.signature.canonicalWord).toBe("{STS}");
    expect(result.circularOffsetApplied).toBe(0);
  });
});
