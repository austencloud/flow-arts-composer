import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { SpatialTransform } from "../domain/models/signatures";
import type { SequenceSignature } from "../domain/models/signatures";

/**
 * Result of aligning two sequences.
 */
export interface AlignmentResult {
  /** Overall alignment score (0.0 - 1.0) */
  readonly score: number;

  /** Beat-by-beat alignment */
  readonly alignment: readonly AlignedBeatPair[];

  /** Number of beats that matched well (similarity > 0.7) */
  readonly matchedBeats: number;

  /** Number of beats that matched poorly (similarity < 0.3) */
  readonly mismatchedBeats: number;

  /** Number of gaps in the alignment (beats with no correspondence) */
  readonly gaps: number;
}

/**
 * A pair of aligned beats from two sequences.
 */
export interface AlignedBeatPair {
  /** Index in sequence A (null = gap in A) */
  readonly indexA: number | null;

  /** Index in sequence B (null = gap in B) */
  readonly indexB: number | null;

  /** Similarity score between these beats (0.0 - 1.0) */
  readonly similarity: number;

  /** Spatial transform that relates these beats (if any) */
  readonly transform: SpatialTransform | null;
}

/**
 * Result of local alignment - includes the region boundaries.
 */
export interface LocalAlignmentResult extends AlignmentResult {
  /** Region in sequence A that was matched */
  readonly regionA: { readonly start: number; readonly end: number };

  /** Region in sequence B that was matched */
  readonly regionB: { readonly start: number; readonly end: number };
}

/**
 * Result of circular alignment - includes the optimal rotation offset.
 */
export interface CircularAlignmentResult extends AlignmentResult {
  /** Best circular offset (how many beats to rotate sequence B) */
  readonly circularOffset: number;
}

/**
 * Options for alignment algorithms.
 */
export interface AlignmentOptions {
  /** Penalty for opening a gap (default: -0.5) */
  readonly gapOpenPenalty?: number;

  /** Penalty for extending a gap (default: -0.1) */
  readonly gapExtendPenalty?: number;

  /** Minimum similarity to consider a match (default: 0.3) */
  readonly matchThreshold?: number;

  /** Whether to try spatial transforms when aligning (default: true) */
  readonly trySpatialTransforms?: boolean;
}

/**
 * A sequence in canonical (normalized) form.
 */
export interface CanonicalSequence {
  /** The canonicalized sequence data */
  readonly sequence: SequenceData;

  /** Number of 45° spatial rotation steps applied to reach canonical form (0-7) */
  readonly spatialRotationApplied: number;

  /** Number of beat positions shifted for circular sequences (0 to length-1) */
  readonly circularOffsetApplied: number;

  /** Hash for quick comparison */
  readonly canonicalHash: string;

  /** Full signature with beat-level detail */
  readonly signature: SequenceSignature;
}

/**
 * Comprehensive similarity report between two sequences.
 */
export interface SimilarityReport {
  /** Overall similarity score (0.0 - 1.0) */
  readonly overallScore: number;

  /** Component similarity scores */
  readonly wordSimilarity: number;
  readonly motionSimilarity: number;
  readonly placementSimilarity: number;
  readonly structuralSimilarity: number;

  /** Per-beat similarity scores */
  readonly stepByBeatScores: readonly number[];

  /** Common subsequences found between the sequences */
  readonly commonSubsequences: readonly CommonSubsequence[];

  /** Human-readable summary of the comparison */
  readonly summary: string;

  /** Detailed breakdown of what matches and what differs */
  readonly breakdown: SimilarityBreakdown;
}

/**
 * A common subsequence found in both sequences.
 */
export interface CommonSubsequence {
  /** Starting index in sequence A */
  readonly startIndexA: number;

  /** Starting index in sequence B */
  readonly startIndexB: number;

  /** Length of the common subsequence */
  readonly length: number;

  /** Average similarity of beats in this subsequence */
  readonly similarity: number;
}

/**
 * Detailed breakdown of similarity components.
 */
export interface SimilarityBreakdown {
  /** Length comparison */
  readonly lengthMatch: boolean;
  readonly lengthDifference: number;

  /** Circularity comparison */
  readonly circularityMatch: boolean;

  /** Word comparison */
  readonly wordMatch: boolean;
  readonly wordEditDistance: number;

  /** Motion pattern analysis */
  readonly motionTypeMatches: number;
  readonly motionTypeMismatches: number;

  /** Placement pattern analysis */
  readonly placementGroupMatches: number;
  readonly placementGroupMismatches: number;

  /** Individual beat analysis */
  readonly perfectBeatMatches: number;
  readonly partialBeatMatches: number;
  readonly beatMismatches: number;
}

/**
 * Quick similarity result (less detailed, faster computation).
 */
export interface QuickSimilarityResult {
  /** Overall similarity score (0.0 - 1.0) */
  readonly score: number;

  /** Whether sequences are likely equivalent */
  readonly likelyEquivalent: boolean;

  /** Confidence in the assessment (0.0 - 1.0) */
  readonly confidence: number;
}

/**
 * Options for similarity calculation.
 */
export interface SimilarityOptions {
  /** Weight for word similarity component (default: 0.2) */
  readonly wordWeight?: number;

  /** Weight for motion similarity component (default: 0.35) */
  readonly motionWeight?: number;

  /** Weight for position similarity component (default: 0.25) */
  readonly placementWeight?: number;

  /** Weight for structural similarity component (default: 0.2) */
  readonly structuralWeight?: number;

  /** Minimum subsequence length to report (default: 2) */
  readonly minSubsequenceLength?: number;

  /** Whether to consider spatial transforms (default: true) */
  readonly considerSpatialTransforms?: boolean;
}
