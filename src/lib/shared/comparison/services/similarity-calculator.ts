/**
 * Similarity Calculator Implementation
 *
 * Computes detailed similarity metrics between sequences with:
 * - Word-level similarity (Levenshtein distance on TKA words)
 * - Motion-level similarity (motion type and direction matching)
 * - Position-level similarity (position group transitions)
 * - Structural similarity (length, circularity)
 * - Common subsequence detection
 */

import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { stripWordNotation } from "$lib/shared/foundation/utils/word-notation";
import type {
  SimilarityReport,
  CommonSubsequence,
  SimilarityBreakdown,
  QuickSimilarityResult,
  SimilarityOptions,
} from "./types";
import type { StepSignatureGenerator } from "./step-signature-generator";
import type { SequenceAligner } from "./sequence-aligner";
import { HandSide } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { isVisibleMotion } from "$lib/shared/pictograph/shared/domain/models/motion-data";

const DEFAULT_OPTIONS: Required<SimilarityOptions> = {
  wordWeight: 0.2,
  motionWeight: 0.35,
  placementWeight: 0.25,
  structuralWeight: 0.2,
  minSubsequenceLength: 2,
  considerSpatialTransforms: true,
};

export class SimilarityCalculator {
  constructor(
    private readonly stepSignatureGenerator: StepSignatureGenerator,
    private readonly sequenceAligner: SequenceAligner
  ) {}

  computeSimilarity(
    seqA: SequenceData,
    seqB: SequenceData,
    options?: SimilarityOptions
  ): SimilarityReport {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    // Calculate component similarities
    const wordSimilarity = this.computeWordSimilarity(seqA.word, seqB.word);
    const motionSimilarity = this.computeMotionSimilarity(seqA, seqB, opts);
    const placementSimilarity = this.computePlacementSimilarity(seqA, seqB);
    const structuralSimilarity = this.computeStructuralSimilarity(seqA, seqB);

    const stepByBeatScores = this.computeBeatByBeatScores(seqA, seqB);

    // Find common subsequences
    const commonSubsequences = this.findCommonSubsequences(
      seqA,
      seqB,
      opts.minSubsequenceLength
    );

    const breakdown = this.computeBreakdown(seqA, seqB, stepByBeatScores);

    const overallScore =
      wordSimilarity * opts.wordWeight +
      motionSimilarity * opts.motionWeight +
      placementSimilarity * opts.placementWeight +
      structuralSimilarity * opts.structuralWeight;

    // Generate summary
    const summary = this.generateSummaryText(
      overallScore,
      breakdown,
      commonSubsequences
    );

    return {
      overallScore,
      wordSimilarity,
      motionSimilarity,
      placementSimilarity,
      structuralSimilarity,
      stepByBeatScores,
      commonSubsequences,
      summary,
      breakdown,
    };
  }

  computeQuickScore(
    seqA: SequenceData,
    seqB: SequenceData
  ): QuickSimilarityResult {
    // Quick structural check
    if (seqA.steps.length === 0 && seqB.steps.length === 0) {
      return { score: 1.0, likelyEquivalent: true, confidence: 1.0 };
    }

    if (seqA.steps.length !== seqB.steps.length) {
      const lengthRatio =
        Math.min(seqA.steps.length, seqB.steps.length) /
        Math.max(seqA.steps.length, seqB.steps.length, 1);

      return {
        score: lengthRatio * 0.5,
        likelyEquivalent: false,
        confidence: 0.8,
      };
    }

    // Quick word comparison
    if (seqA.word === seqB.word) {
      return { score: 0.95, likelyEquivalent: true, confidence: 0.9 };
    }

    // Check if words are rotations of each other (for circular sequences)
    if (seqA.isCircular && seqB.isCircular) {
      if (this.areWordsCircularEquivalent(stripWordNotation(seqA.word), stripWordNotation(seqB.word))) {
        return { score: 0.9, likelyEquivalent: true, confidence: 0.85 };
      }
    }

    // Quick motion type comparison
    const motionMatch = this.quickMotionCompare(seqA, seqB);

    return {
      score: motionMatch,
      likelyEquivalent: motionMatch > 0.8,
      confidence: 0.7,
    };
  }

  findCommonSubsequences(
    seqA: SequenceData,
    seqB: SequenceData,
    minLength: number = 2
  ): readonly CommonSubsequence[] {
    const stepsA = seqA.steps;
    const stepsB = seqB.steps;
    const result: CommonSubsequence[] = [];

    if (stepsA.length < minLength || stepsB.length < minLength) {
      return result;
    }

    // Use alignment to find matching regions
    const alignment = this.sequenceAligner.alignGlobal(seqA, seqB, {
      trySpatialTransforms: true,
    });

    // Extract contiguous matching subsequences from alignment
    let currentSubseq: {
      startA: number;
      startB: number;
      length: number;
      totalSim: number;
    } | null = null;

    for (const pair of alignment.alignment) {
      if (
        pair.indexA !== null &&
        pair.indexB !== null &&
        pair.similarity >= 0.5
      ) {
        // Matching pair
        if (currentSubseq === null) {
          currentSubseq = {
            startA: pair.indexA,
            startB: pair.indexB,
            length: 1,
            totalSim: pair.similarity,
          };
        } else if (
          pair.indexA === currentSubseq.startA + currentSubseq.length &&
          pair.indexB === currentSubseq.startB + currentSubseq.length
        ) {
          // Extend current subsequence
          currentSubseq.length++;
          currentSubseq.totalSim += pair.similarity;
        } else {
          // Start new subsequence (save current if long enough)
          if (currentSubseq.length >= minLength) {
            result.push({
              startIndexA: currentSubseq.startA,
              startIndexB: currentSubseq.startB,
              length: currentSubseq.length,
              similarity: currentSubseq.totalSim / currentSubseq.length,
            });
          }
          currentSubseq = {
            startA: pair.indexA,
            startB: pair.indexB,
            length: 1,
            totalSim: pair.similarity,
          };
        }
      } else {
        // Gap or mismatch - end current subsequence
        if (currentSubseq !== null && currentSubseq.length >= minLength) {
          result.push({
            startIndexA: currentSubseq.startA,
            startIndexB: currentSubseq.startB,
            length: currentSubseq.length,
            similarity: currentSubseq.totalSim / currentSubseq.length,
          });
        }
        currentSubseq = null;
      }
    }

    // Don't forget the last subsequence
    if (currentSubseq !== null && currentSubseq.length >= minLength) {
      result.push({
        startIndexA: currentSubseq.startA,
        startIndexB: currentSubseq.startB,
        length: currentSubseq.length,
        similarity: currentSubseq.totalSim / currentSubseq.length,
      });
    }

    // Sort by length descending
    return result.sort((a, b) => b.length - a.length);
  }

  generateSummary(report: SimilarityReport): string {
    return report.summary;
  }

  // PRIVATE: Component Similarity

  private computeWordSimilarity(wordA: string, wordB: string): number {
    if (wordA === wordB) {
      return 1.0;
    }

    if (wordA.length === 0 && wordB.length === 0) {
      return 1.0;
    }

    if (wordA.length === 0 || wordB.length === 0) {
      return 0.0;
    }

    // Levenshtein distance
    const distance = this.levenshteinDistance(wordA, wordB);
    const maxLength = Math.max(wordA.length, wordB.length);

    return 1 - distance / maxLength;
  }

  private levenshteinDistance(a: string, b: string): number {
    const m = a.length;
    const n = b.length;

    const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
      Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
    );

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (a[i - 1] === b[j - 1]) {
          dp[i]![j] = dp[i - 1]![j - 1]!;
        } else {
          dp[i]![j] =
            1 + Math.min(dp[i - 1]![j]!, dp[i]![j - 1]!, dp[i - 1]![j - 1]!);
        }
      }
    }

    return dp[m]![n]!;
  }

  private computeMotionSimilarity(
    seqA: SequenceData,
    seqB: SequenceData,
    opts: Required<SimilarityOptions>
  ): number {
    const stepsA = seqA.steps;
    const stepsB = seqB.steps;

    if (stepsA.length === 0 && stepsB.length === 0) {
      return 1.0;
    }

    // Use alignment to compare
    const alignment = this.sequenceAligner.alignGlobal(seqA, seqB, {
      trySpatialTransforms: opts.considerSpatialTransforms,
    });

    return alignment.score;
  }

  private computePlacementSimilarity(
    seqA: SequenceData,
    seqB: SequenceData
  ): number {
    const stepsA = seqA.steps;
    const stepsB = seqB.steps;

    if (stepsA.length === 0 && stepsB.length === 0) {
      return 1.0;
    }

    const minLen = Math.min(stepsA.length, stepsB.length);
    if (minLen === 0) {
      return 0.0;
    }

    let matches = 0;

    for (let i = 0; i < minLen; i++) {
      const stepA = stepsA[i];
      const stepB = stepsB[i];
      if (!stepA || !stepB) continue;

      const sigA = this.stepSignatureGenerator.generateSignature(stepA);
      const sigB = this.stepSignatureGenerator.generateSignature(stepB);

      if (sigA.startPlacementGroup === sigB.startPlacementGroup) {
        matches += 0.5;
      }
      if (sigA.endPlacementGroup === sigB.endPlacementGroup) {
        matches += 0.5;
      }
    }

    return matches / minLen;
  }

  private computeStructuralSimilarity(
    seqA: SequenceData,
    seqB: SequenceData
  ): number {
    let score = 0;
    let factors = 0;

    // Length similarity
    const maxLen = Math.max(seqA.steps.length, seqB.steps.length, 1);
    const minLen = Math.min(seqA.steps.length, seqB.steps.length);
    score += minLen / maxLen;
    factors++;

    // Circularity match
    if (seqA.isCircular === seqB.isCircular) {
      score += 1;
    }
    factors++;

    // Word length similarity
    const maxWordLen = Math.max(stripWordNotation(seqA.word).length, stripWordNotation(seqB.word).length, 1);
    const minWordLen = Math.min(stripWordNotation(seqA.word).length, stripWordNotation(seqB.word).length);
    score += minWordLen / maxWordLen;
    factors++;

    return score / factors;
  }

  private computeBeatByBeatScores(
    seqA: SequenceData,
    seqB: SequenceData
  ): readonly number[] {
    const stepsA = seqA.steps;
    const stepsB = seqB.steps;
    const scores: number[] = [];

    const minLen = Math.min(stepsA.length, stepsB.length);

    for (let i = 0; i < minLen; i++) {
      const stepA = stepsA[i];
      const stepB = stepsB[i];
      if (!stepA || !stepB) {
        scores.push(0);
        continue;
      }

      const sigA = this.stepSignatureGenerator.generateSignature(stepA);
      const sigB = this.stepSignatureGenerator.generateSignature(stepB);
      const result = this.stepSignatureGenerator.compareSignatures(sigA, sigB);
      scores.push(result.similarity);
    }

    // Pad with zeros for length difference
    const maxLen = Math.max(stepsA.length, stepsB.length);
    while (scores.length < maxLen) {
      scores.push(0);
    }

    return scores;
  }

  // PRIVATE: Breakdown

  private computeBreakdown(
    seqA: SequenceData,
    seqB: SequenceData,
    beatScores: readonly number[]
  ): SimilarityBreakdown {
    const stepsA = seqA.steps;
    const stepsB = seqB.steps;

    let motionTypeMatches = 0;
    let motionTypeMismatches = 0;
    let placementGroupMatches = 0;
    let placementGroupMismatches = 0;
    let perfectBeatMatches = 0;
    let partialBeatMatches = 0;
    let beatMismatches = 0;

    const minLen = Math.min(stepsA.length, stepsB.length);

    for (let i = 0; i < minLen; i++) {
      const stepA = stepsA[i];
      const stepB = stepsB[i];
      if (!stepA || !stepB) continue;

      // Motion type comparison
      const leftA = stepA.motions[HandSide.LEFT];
      const rightA = stepA.motions[HandSide.RIGHT];
      const leftB = stepB.motions[HandSide.LEFT];
      const rightB = stepB.motions[HandSide.RIGHT];

      // Invisible placeholder = hand not really there (both-required Step
      // shape): counts as a mismatch, like the old absent hand.
      if (
        isVisibleMotion(leftA) &&
        isVisibleMotion(leftB) &&
        leftA.motionType === leftB.motionType
      ) {
        motionTypeMatches++;
      } else {
        motionTypeMismatches++;
      }

      if (
        isVisibleMotion(rightA) &&
        isVisibleMotion(rightB) &&
        rightA.motionType === rightB.motionType
      ) {
        motionTypeMatches++;
      } else {
        motionTypeMismatches++;
      }

      // Position group comparison
      const sigA = this.stepSignatureGenerator.generateSignature(stepA);
      const sigB = this.stepSignatureGenerator.generateSignature(stepB);

      if (sigA.startPlacementGroup === sigB.startPlacementGroup) {
        placementGroupMatches++;
      } else {
        placementGroupMismatches++;
      }

      // Beat score classification
      const score = beatScores[i] ?? 0;
      if (score >= 0.95) {
        perfectBeatMatches++;
      } else if (score >= 0.5) {
        partialBeatMatches++;
      } else {
        beatMismatches++;
      }
    }

    // Add mismatches for length difference
    const lengthDiff = Math.abs(stepsA.length - stepsB.length);
    beatMismatches += lengthDiff;

    return {
      lengthMatch: stepsA.length === stepsB.length,
      lengthDifference: lengthDiff,
      circularityMatch: seqA.isCircular === seqB.isCircular,
      wordMatch: seqA.word === seqB.word,
      wordEditDistance: this.levenshteinDistance(stripWordNotation(seqA.word), stripWordNotation(seqB.word)),
      motionTypeMatches,
      motionTypeMismatches,
      placementGroupMatches,
      placementGroupMismatches,
      perfectBeatMatches,
      partialBeatMatches,
      beatMismatches,
    };
  }

  // PRIVATE: Quick Comparison

  private areWordsCircularEquivalent(wordA: string, wordB: string): boolean {
    if (wordA.length !== wordB.length) {
      return false;
    }

    if (wordA.length === 0) {
      return true;
    }

    const doubled = wordA + wordA;
    return doubled.includes(wordB);
  }

  private quickMotionCompare(seqA: SequenceData, seqB: SequenceData): number {
    const stepsA = seqA.steps;
    const stepsB = seqB.steps;
    const minLen = Math.min(stepsA.length, stepsB.length);

    if (minLen === 0) {
      return 0;
    }

    let matches = 0;

    for (let i = 0; i < minLen; i++) {
      const stepA = stepsA[i];
      const stepB = stepsB[i];
      if (!stepA || !stepB) continue;

      const leftA = stepA.motions[HandSide.LEFT];
      const rightA = stepA.motions[HandSide.RIGHT];
      const leftB = stepB.motions[HandSide.LEFT];
      const rightB = stepB.motions[HandSide.RIGHT];

      if (
        isVisibleMotion(leftA) &&
        isVisibleMotion(leftB) &&
        leftA.motionType === leftB.motionType
      ) {
        matches++;
      }
      if (
        isVisibleMotion(rightA) &&
        isVisibleMotion(rightB) &&
        rightA.motionType === rightB.motionType
      ) {
        matches++;
      }
    }

    return matches / (minLen * 2);
  }

  // PRIVATE: Summary Generation

  /**
   * The one string here a human reads — it renders verbatim in the combinator
   * lab's similarity panel. So it says STEP, per the domain rule: "beat" is not
   * TKA vocabulary for a sequence entry. The type and field names around it
   * (`stepByBeatScores`, `perfectBeatMatches`) still say beat and are left
   * alone; renaming a published interface is not a copy fix.
   */
  private generateSummaryText(
    overallScore: number,
    breakdown: SimilarityBreakdown,
    commonSubsequences: readonly CommonSubsequence[]
  ): string {
    const parts: string[] = [];

    // Overall similarity description
    if (overallScore >= 0.95) {
      parts.push("Sequences are nearly identical");
    } else if (overallScore >= 0.8) {
      parts.push("Sequences are highly similar");
    } else if (overallScore >= 0.6) {
      parts.push("Sequences share significant similarities");
    } else if (overallScore >= 0.4) {
      parts.push("Sequences have moderate similarity");
    } else if (overallScore >= 0.2) {
      parts.push("Sequences have limited similarity");
    } else {
      parts.push("Sequences are quite different");
    }

    // Length comparison
    if (!breakdown.lengthMatch) {
      parts.push(
        `(${breakdown.lengthDifference} step${breakdown.lengthDifference === 1 ? "" : "s"} length difference)`
      );
    }

    // Common subsequences
    if (commonSubsequences.length > 0) {
      const longest = commonSubsequences[0];
      if (longest) {
        parts.push(
          `Longest matching section: ${longest.length} step${longest.length === 1 ? "" : "s"}`
        );
      }
    }

    // Perfect matches
    if (breakdown.perfectBeatMatches > 0) {
      parts.push(
        `${breakdown.perfectBeatMatches} perfect step match${breakdown.perfectBeatMatches === 1 ? "" : "es"}`
      );
    }

    return parts.join(". ") + ".";
  }
}
