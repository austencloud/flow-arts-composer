/**
 * The comparison suite's first exercised path.
 *
 * `src/lib/shared/comparison/` sat orphaned: fully written, never imported by
 * anything a user could reach, and every getter in it guarded `browser`-only —
 * which meant the one environment that could run it (the browser) took the real
 * path while every test took a caller's fallback. Task 12 gives it a visible
 * consumer (the similarity panel in the combinator lab) and this suite pins the
 * contract that consumer reads.
 *
 * What is asserted here is deliberately narrow: the CALCULATOR and the ALIGNER.
 * `SequenceCanonicalizer`'s hash carries three known defects (cited on
 * `walk-classifier.ts`'s `contentDedupKey`) and nothing here leans on it.
 */

import { describe, expect, it } from "vitest";

import { getSequenceAligner } from "$lib/shared/comparison/get-sequence-aligner";
import { getSimilarityCalculator } from "$lib/shared/comparison/get-similarity-calculator";

import { FALG, GGGG_CW, HHHH_CCW } from "./fixtures";

const inUnitRange = (value: number) => value >= 0 && value <= 1;

describe("SimilarityCalculator — the panel's data source", () => {
  it("reports a bounded score with every component populated", () => {
    const report = getSimilarityCalculator().computeSimilarity(
      GGGG_CW,
      HHHH_CCW
    );

    // Strictly between the extremes: two different four-step loops in the same
    // grid mode are neither identical nor unrelated.
    expect(report.overallScore).toBeGreaterThan(0);
    expect(report.overallScore).toBeLessThan(1);

    expect(inUnitRange(report.wordSimilarity)).toBe(true);
    expect(inUnitRange(report.motionSimilarity)).toBe(true);
    expect(inUnitRange(report.placementSimilarity)).toBe(true);
    expect(inUnitRange(report.structuralSimilarity)).toBe(true);

    expect(report.breakdown).toBeDefined();
    expect(report.breakdown.lengthMatch).toBe(true);
    expect(report.breakdown.wordMatch).toBe(false);
    expect(report.stepByBeatScores).toHaveLength(GGGG_CW.steps.length);
    expect(report.summary.length).toBeGreaterThan(0);
  });

  it("scores a card against itself as identical, on every component", () => {
    const report = getSimilarityCalculator().computeSimilarity(FALG, FALG);

    // Exact 1, not "close enough". A card compared with itself is the one input
    // where every component has a knowable right answer, so it is the only
    // place a regression in any of them can be caught for free. Motion in
    // particular runs through `computeTransformedSimilarity`, whose 1.1×
    // fudge stub is invisible at 1.0 (it clamps) and would show up here the
    // moment someone changed it — a loose `> 0.95` would swallow that.
    expect(report.overallScore).toBe(1);
    expect(report.wordSimilarity).toBe(1);
    expect(report.motionSimilarity).toBe(1);
    expect(report.placementSimilarity).toBe(1);
    expect(report.structuralSimilarity).toBe(1);
    expect(report.breakdown.wordMatch).toBe(true);
    expect(report.breakdown.beatMismatches).toBe(0);
  });

  it("moves the overall score when the weights move", () => {
    const calculator = getSimilarityCalculator();
    const base = calculator.computeSimilarity(GGGG_CW, HHHH_CCW);

    // GGGG vs HHHH share no letters, so word similarity is the floor component.
    // Pushing the whole budget onto it must drag the overall score down to it.
    const wordOnly = calculator.computeSimilarity(GGGG_CW, HHHH_CCW, {
      wordWeight: 1,
      motionWeight: 0,
      placementWeight: 0,
      structuralWeight: 0,
    });

    expect(wordOnly.overallScore).not.toBe(base.overallScore);
    expect(wordOnly.overallScore).toBeCloseTo(base.wordSimilarity, 10);
  });

  it("does NOT normalize weights — they are multipliers, not a budget", () => {
    // Pinning observed behavior, not endorsing it: `computeSimilarity` spreads
    // the caller's options over defaults summing to 1.0 and then takes a plain
    // weighted sum with no division by the total. Weights that sum to 4 produce
    // a score of up to 4. The panel therefore owns normalization at the slider
    // seam; if this ever starts normalizing, this test is the thing that says so.
    const report = getSimilarityCalculator().computeSimilarity(
      GGGG_CW,
      HHHH_CCW,
      {
        wordWeight: 1,
        motionWeight: 1,
        placementWeight: 1,
        structuralWeight: 1,
      }
    );

    const rawSum =
      report.wordSimilarity +
      report.motionSimilarity +
      report.placementSimilarity +
      report.structuralSimilarity;

    expect(report.overallScore).toBeCloseTo(rawSum, 10);
    expect(report.overallScore).toBeGreaterThan(1);
  });
});

describe("SequenceAligner", () => {
  it("aligns two fixture cards globally without throwing", () => {
    const result = getSequenceAligner().alignGlobal(GGGG_CW, HHHH_CCW);

    expect(inUnitRange(result.score)).toBe(true);
    expect(Array.isArray(result.alignment)).toBe(true);
    expect(result.alignment.length).toBeGreaterThan(0);
    expect(result.matchedBeats + result.mismatchedBeats).toBeLessThanOrEqual(
      result.alignment.length
    );
    expect(result.gaps).toBeGreaterThanOrEqual(0);

    for (const pair of result.alignment) {
      expect(inUnitRange(pair.similarity)).toBe(true);
      expect(pair.indexA === null || typeof pair.indexA === "number").toBe(
        true
      );
      expect(pair.indexB === null || typeof pair.indexB === "number").toBe(
        true
      );
    }
  });
});
