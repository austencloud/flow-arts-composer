/**
 * Sequence Aligner Implementation
 *
 * Implements dynamic programming alignment algorithms:
 * - Needleman-Wunsch for global alignment
 * - Smith-Waterman for local alignment
 * - Circular alignment for sequences with rotation
 */

import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";
import type { Step } from "@tka/tka-types";
import type { AlignmentResult, AlignedBeatPair, LocalAlignmentResult, CircularAlignmentResult, AlignmentOptions } from "./types";
import type { StepSignatureGenerator } from "./step-signature-generator";
import type { SpatialTransformDetector } from "./spatial-transform-detector";
import type { SpatialTransform } from "../domain/models/signatures";

const DEFAULT_OPTIONS: Required<AlignmentOptions> = {
  gapOpenPenalty: -0.5,
  gapExtendPenalty: -0.1,
  matchThreshold: 0.3,
  trySpatialTransforms: true,
};

export class SequenceAligner {
  constructor(
    private readonly beatSignatureGenerator: StepSignatureGenerator,
    private readonly spatialTransformDetector: SpatialTransformDetector
  ) {}

  alignGlobal(
    seqA: SequenceData,
    seqB: SequenceData,
    options?: AlignmentOptions
  ): AlignmentResult {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const stepsA = seqA.steps;
    const stepsB = seqB.steps;

    // Handle empty sequences
    if (stepsA.length === 0 && stepsB.length === 0) {
      return this.emptyAlignment(1.0);
    }
    if (stepsA.length === 0 || stepsB.length === 0) {
      return this.emptyAlignment(0.0);
    }

    const simMatrix = this.buildSimilarityMatrix(stepsA, stepsB, opts);

    // Run Needleman-Wunsch
    const { dpMatrix, traceMatrix } = this.needlemanWunsch(simMatrix, opts);

    // Traceback to get alignment
    const alignment = this.tracebackGlobal(
      dpMatrix,
      traceMatrix,
      stepsA,
      stepsB,
      simMatrix,
      opts
    );

    return this.buildAlignmentResult(alignment, stepsA.length, stepsB.length);
  }

  alignLocal(
    seqA: SequenceData,
    seqB: SequenceData,
    options?: AlignmentOptions
  ): LocalAlignmentResult {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const stepsA = seqA.steps;
    const stepsB = seqB.steps;

    // Handle empty sequences
    if (stepsA.length === 0 || stepsB.length === 0) {
      return {
        ...this.emptyAlignment(0.0),
        regionA: { start: 0, end: 0 },
        regionB: { start: 0, end: 0 },
      };
    }

    const simMatrix = this.buildSimilarityMatrix(stepsA, stepsB, opts);

    // Run Smith-Waterman
    const { dpMatrix, traceMatrix, maxPos } = this.smithWaterman(simMatrix, opts);

    // Traceback from max position
    const { alignment, regionA, regionB } = this.tracebackLocal(
      dpMatrix,
      traceMatrix,
      stepsA,
      stepsB,
      simMatrix,
      maxPos,
      opts
    );

    const result = this.buildAlignmentResult(alignment, stepsA.length, stepsB.length);

    return {
      ...result,
      regionA,
      regionB,
    };
  }

  alignCircular(
    seqA: SequenceData,
    seqB: SequenceData,
    options?: AlignmentOptions
  ): CircularAlignmentResult {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const stepsA = seqA.steps;
    const stepsB = seqB.steps;

    // Must be same length for meaningful circular alignment
    if (stepsA.length !== stepsB.length) {
      return {
        ...this.alignGlobal(seqA, seqB, opts),
        circularOffset: 0,
      };
    }

    // Handle empty sequences
    if (stepsA.length === 0) {
      return {
        ...this.emptyAlignment(1.0),
        circularOffset: 0,
      };
    }

    // Try all circular rotations of seqB
    let bestResult: AlignmentResult | null = null;
    let bestOffset = 0;

    for (let offset = 0; offset < stepsB.length; offset++) {
      // Create rotated version of stepsB
      const rotatedSteps = this.rotateSteps(stepsB, offset);
      const rotatedSeq = { ...seqB, steps: rotatedSteps };

      const result = this.alignGlobal(seqA, rotatedSeq, opts);

      if (!bestResult || result.score > bestResult.score) {
        bestResult = result;
        bestOffset = offset;
      }

      // Perfect score - no need to continue
      if (result.score === 1.0) {
        break;
      }
    }

    return {
      ...(bestResult || this.emptyAlignment(0.0)),
      circularOffset: bestOffset,
    };
  }

  // PRIVATE: Similarity Matrix

  private buildSimilarityMatrix(
    stepsA: readonly Step[],
    stepsB: readonly Step[],
    opts: Required<AlignmentOptions>
  ): {
    scores: number[][];
    transforms: (SpatialTransform | null)[][];
  } {
    const n = stepsA.length;
    const m = stepsB.length;

    const scores: number[][] = Array.from({ length: n }, () => Array(m).fill(0));
    const transforms: (SpatialTransform | null)[][] = Array.from({ length: n }, () =>
      Array(m).fill(null)
    );

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < m; j++) {
        const stepA = stepsA[i];
        const stepB = stepsB[j];
        if (!stepA || !stepB) continue;

        const { similarity, transform } = this.computeBeatSimilarity(
          stepA,
          stepB,
          opts
        );
        scores[i]![j] = similarity;
        transforms[i]![j] = transform;
      }
    }

    return { scores, transforms };
  }

  private computeBeatSimilarity(
    stepA: Step,
    stepB: Step,
    opts: Required<AlignmentOptions>
  ): { similarity: number; transform: SpatialTransform | null } {
    // Direct comparison
    const sigA = this.beatSignatureGenerator.generateSignature(stepA);
    const sigB = this.beatSignatureGenerator.generateSignature(stepB);

    if (this.beatSignatureGenerator.signaturesMatch(sigA, sigB)) {
      return { similarity: 1.0, transform: null };
    }

    const directResult = this.beatSignatureGenerator.compareSignatures(sigA, sigB);
    let bestSimilarity = directResult.similarity;
    let bestTransform: SpatialTransform | null = null;

    // Try spatial transforms if enabled
    if (opts.trySpatialTransforms) {
      const transforms = this.spatialTransformDetector.getAllTransforms();

      for (const transform of transforms) {
        if (transform.rotationSteps === 0) continue; // Already tried direct

        if (this.spatialTransformDetector.isRotationOf(stepA, stepB, transform.rotationSteps)) {
          return { similarity: 1.0, transform };
        }

        // Compute similarity with transform consideration
        // For non-exact matches, we give a bonus if positions are related by transform
        const transformedSimilarity = this.computeTransformedSimilarity(
          stepA,
          stepB,
          transform
        );

        if (transformedSimilarity > bestSimilarity) {
          bestSimilarity = transformedSimilarity;
          bestTransform = transform;
        }
      }
    }

    return { similarity: bestSimilarity, transform: bestTransform };
  }

  private computeTransformedSimilarity(
    stepA: Step,
    stepB: Step,
    _transform: SpatialTransform
  ): number {
    // For now, we just check if the transform makes them match better
    // A full implementation would apply the transform and compare
    const sigA = this.beatSignatureGenerator.generateSignature(stepA);
    const sigB = this.beatSignatureGenerator.generateSignature(stepB);

    const result = this.beatSignatureGenerator.compareSignatures(sigA, sigB);

    // Give a small bonus for potential transform relationship
    return Math.min(1.0, result.similarity * 1.1);
  }

  // PRIVATE: Needleman-Wunsch (Global Alignment)

  private needlemanWunsch(
    simMatrix: { scores: number[][] },
    opts: Required<AlignmentOptions>
  ): {
    dpMatrix: number[][];
    traceMatrix: ("diag" | "up" | "left")[][];
  } {
    const n = simMatrix.scores.length;
    const m = simMatrix.scores[0]?.length || 0;

    const dpMatrix: number[][] = Array.from({ length: n + 1 }, () =>
      Array(m + 1).fill(0)
    );
    const traceMatrix: ("diag" | "up" | "left")[][] = Array.from(
      { length: n + 1 },
      () => Array(m + 1).fill("diag")
    );

    // Initialize first row and column (gap penalties)
    for (let i = 1; i <= n; i++) {
      dpMatrix[i]![0] = opts.gapOpenPenalty + (i - 1) * opts.gapExtendPenalty;
      traceMatrix[i]![0] = "up";
    }
    for (let j = 1; j <= m; j++) {
      dpMatrix[0]![j] = opts.gapOpenPenalty + (j - 1) * opts.gapExtendPenalty;
      traceMatrix[0]![j] = "left";
    }

    // Fill DP matrix
    for (let i = 1; i <= n; i++) {
      for (let j = 1; j <= m; j++) {
        const match = dpMatrix[i - 1]![j - 1]! + simMatrix.scores[i - 1]![j - 1]!;
        const gapA =
          dpMatrix[i - 1]![j]! +
          (traceMatrix[i - 1]![j] === "up" ? opts.gapExtendPenalty : opts.gapOpenPenalty);
        const gapB =
          dpMatrix[i]![j - 1]! +
          (traceMatrix[i]![j - 1] === "left" ? opts.gapExtendPenalty : opts.gapOpenPenalty);

        if (match >= gapA && match >= gapB) {
          dpMatrix[i]![j] = match;
          traceMatrix[i]![j] = "diag";
        } else if (gapA >= gapB) {
          dpMatrix[i]![j] = gapA;
          traceMatrix[i]![j] = "up";
        } else {
          dpMatrix[i]![j] = gapB;
          traceMatrix[i]![j] = "left";
        }
      }
    }

    return { dpMatrix, traceMatrix };
  }

  private tracebackGlobal(
    dpMatrix: number[][],
    traceMatrix: ("diag" | "up" | "left")[][],
    stepsA: readonly Step[],
    stepsB: readonly Step[],
    simMatrix: { scores: number[][]; transforms: (SpatialTransform | null)[][] },
    _opts: Required<AlignmentOptions>
  ): AlignedBeatPair[] {
    const alignment: AlignedBeatPair[] = [];
    let i = stepsA.length;
    let j = stepsB.length;

    while (i > 0 || j > 0) {
      if (i === 0) {
        // Gap in A
        alignment.unshift({
          indexA: null,
          indexB: j - 1,
          similarity: 0,
          transform: null,
        });
        j--;
      } else if (j === 0) {
        // Gap in B
        alignment.unshift({
          indexA: i - 1,
          indexB: null,
          similarity: 0,
          transform: null,
        });
        i--;
      } else {
        const trace = traceMatrix[i]![j]!;

        if (trace === "diag") {
          alignment.unshift({
            indexA: i - 1,
            indexB: j - 1,
            similarity: simMatrix.scores[i - 1]![j - 1]!,
            transform: simMatrix.transforms[i - 1]![j - 1]!,
          });
          i--;
          j--;
        } else if (trace === "up") {
          alignment.unshift({
            indexA: i - 1,
            indexB: null,
            similarity: 0,
            transform: null,
          });
          i--;
        } else {
          alignment.unshift({
            indexA: null,
            indexB: j - 1,
            similarity: 0,
            transform: null,
          });
          j--;
        }
      }
    }

    return alignment;
  }

  // PRIVATE: Smith-Waterman (Local Alignment)

  private smithWaterman(
    simMatrix: { scores: number[][] },
    opts: Required<AlignmentOptions>
  ): {
    dpMatrix: number[][];
    traceMatrix: ("diag" | "up" | "left" | "stop")[][];
    maxPos: { i: number; j: number };
  } {
    const n = simMatrix.scores.length;
    const m = simMatrix.scores[0]?.length || 0;

    const dpMatrix: number[][] = Array.from({ length: n + 1 }, () =>
      Array(m + 1).fill(0)
    );
    const traceMatrix: ("diag" | "up" | "left" | "stop")[][] = Array.from(
      { length: n + 1 },
      () => Array(m + 1).fill("stop")
    );

    let maxScore = 0;
    let maxPos = { i: 0, j: 0 };

    // Fill DP matrix (no negative scores in Smith-Waterman)
    for (let i = 1; i <= n; i++) {
      for (let j = 1; j <= m; j++) {
        const match = dpMatrix[i - 1]![j - 1]! + simMatrix.scores[i - 1]![j - 1]!;
        const gapA =
          dpMatrix[i - 1]![j]! +
          (traceMatrix[i - 1]![j] === "up" ? opts.gapExtendPenalty : opts.gapOpenPenalty);
        const gapB =
          dpMatrix[i]![j - 1]! +
          (traceMatrix[i]![j - 1] === "left" ? opts.gapExtendPenalty : opts.gapOpenPenalty);

        const scores = [0, match, gapA, gapB];
        const maxLocalScore = Math.max(...scores);

        dpMatrix[i]![j] = maxLocalScore;

        if (maxLocalScore === 0) {
          traceMatrix[i]![j] = "stop";
        } else if (maxLocalScore === match) {
          traceMatrix[i]![j] = "diag";
        } else if (maxLocalScore === gapA) {
          traceMatrix[i]![j] = "up";
        } else {
          traceMatrix[i]![j] = "left";
        }

        if (maxLocalScore > maxScore) {
          maxScore = maxLocalScore;
          maxPos = { i, j };
        }
      }
    }

    return { dpMatrix, traceMatrix, maxPos };
  }

  private tracebackLocal(
    dpMatrix: number[][],
    traceMatrix: ("diag" | "up" | "left" | "stop")[][],
    stepsA: readonly Step[],
    stepsB: readonly Step[],
    simMatrix: { scores: number[][]; transforms: (SpatialTransform | null)[][] },
    maxPos: { i: number; j: number },
    _opts: Required<AlignmentOptions>
  ): {
    alignment: AlignedBeatPair[];
    regionA: { start: number; end: number };
    regionB: { start: number; end: number };
  } {
    const alignment: AlignedBeatPair[] = [];
    let i = maxPos.i;
    let j = maxPos.j;

    const endA = i - 1;
    const endB = j - 1;

    while (i > 0 && j > 0 && traceMatrix[i]![j] !== "stop") {
      const trace = traceMatrix[i]![j]!;

      if (trace === "diag") {
        alignment.unshift({
          indexA: i - 1,
          indexB: j - 1,
          similarity: simMatrix.scores[i - 1]![j - 1]!,
          transform: simMatrix.transforms[i - 1]![j - 1]!,
        });
        i--;
        j--;
      } else if (trace === "up") {
        alignment.unshift({
          indexA: i - 1,
          indexB: null,
          similarity: 0,
          transform: null,
        });
        i--;
      } else {
        alignment.unshift({
          indexA: null,
          indexB: j - 1,
          similarity: 0,
          transform: null,
        });
        j--;
      }
    }

    const startA = i;
    const startB = j;

    return {
      alignment,
      regionA: { start: startA, end: endA },
      regionB: { start: startB, end: endB },
    };
  }

  // PRIVATE: Helpers

  private rotateSteps(steps: readonly StepData[], offset: number): readonly StepData[] {
    if (offset === 0 || steps.length === 0) {
      return steps;
    }

    const normalizedOffset = offset % steps.length;
    return [...steps.slice(normalizedOffset), ...steps.slice(0, normalizedOffset)];
  }

  private emptyAlignment(score: number): AlignmentResult {
    return {
      score,
      alignment: [],
      matchedBeats: 0,
      mismatchedBeats: 0,
      gaps: 0,
    };
  }

  private buildAlignmentResult(
    alignment: AlignedBeatPair[],
    lengthA: number,
    lengthB: number
  ): AlignmentResult {
    let matchedBeats = 0;
    let mismatchedBeats = 0;
    let gaps = 0;
    let totalSimilarity = 0;

    for (const pair of alignment) {
      if (pair.indexA === null || pair.indexB === null) {
        gaps++;
      } else if (pair.similarity >= 0.7) {
        matchedBeats++;
        totalSimilarity += pair.similarity;
      } else if (pair.similarity < 0.3) {
        mismatchedBeats++;
        totalSimilarity += pair.similarity;
      } else {
        totalSimilarity += pair.similarity; // eslint-disable-line @typescript-eslint/no-unused-vars
      }
    }

    // Calculate overall score
    const maxLength = Math.max(lengthA, lengthB, 1);
    const alignedPairs = alignment.filter((p) => p.indexA !== null && p.indexB !== null);
    const avgSimilarity =
      alignedPairs.length > 0
        ? alignedPairs.reduce((sum, p) => sum + p.similarity, 0) / alignedPairs.length
        : 0;

    // Penalize for gaps
    const gapPenalty = gaps / maxLength;
    const score = Math.max(0, avgSimilarity - gapPenalty * 0.2);

    return {
      score,
      alignment,
      matchedBeats,
      mismatchedBeats,
      gaps,
    };
  }
}
