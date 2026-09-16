/**
 * Sequence Features Domain Model
 *
 * Analyzable features extracted from sequences for rule-based tagging.
 * Used by auto-labeling systems to classify sequences.
 */

import type {
  GridMode,
  GridPlacementGroup,
} from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import type { CircularityAnalysis, StrictLoopType } from "../../../create/shared/services/sequence-analyzer";

/**
 * Position group dominance analysis
 *
 * Indicates which position groups are most used in the sequence.
 */
export interface PositionDominance {
  /** Primary position group used (most frequent) */
  readonly primaryGroup: GridPlacementGroup | null;

  /** Percentage of steps in each group (0-100) */
  readonly alphaPercent: number;
  readonly betaPercent: number;
  readonly gammaPercent: number;

  /** Dominance flags - true if group represents >50% of positions */
  readonly isAlphaHeavy: boolean;
  readonly isBetaHeavy: boolean;
  readonly isGammaHeavy: boolean;

  /** True if positions are evenly distributed (no single group >40%) */
  readonly isBalanced: boolean;
}

/**
 * Reversal analysis
 *
 * Tracks reversals (direction changes) for blue and red hands.
 */
export interface ReversalAnalysis {
  /** Number of blue handpath reversals */
  readonly leftReversalCount: number;

  /** Number of red handpath reversals */
  readonly rightReversalCount: number;

  /** Total reversal count */
  readonly totalReversals: number;

  /** Whether sequence contains reversals */
  readonly hasReversals: boolean;

  /** Whether reversals are synchronized (blue and red reverse at same steps) */
  readonly synchronizedReversals: boolean;

  /** Beat numbers where blue reversals occur */
  readonly leftReversalSteps: readonly number[];

  /** Beat numbers where red reversals occur */
  readonly rightReversalSteps: readonly number[];
}

/**
 * Complete Sequence Features
 *
 * All analyzable features extracted from a sequence for classification.
 */
export interface SequenceFeatures {
  /** Number of steps in the sequence */
  readonly stepCount: number;

  // NOTE: propType removed - prop type is a viewer preference, not sequence data
  // Tags should not include prop type since any sequence can be viewed with any prop

  /** Grid mode (diamond, box, skewed) */
  readonly gridMode: GridMode | null;

  /** Complete circularity analysis from SequenceAnalyzer */
  readonly circularity: CircularityAnalysis;

  /** Detected LOOP types for completed sequences */
  readonly detectedCapTypes: readonly StrictLoopType[];

  readonly reversals: ReversalAnalysis;

  readonly positionDominance: PositionDominance;

  /** Which position groups appear in the sequence */
  readonly hasAlphaPositions: boolean;
  readonly hasBetaPositions: boolean;
  readonly hasGammaPositions: boolean;

  /** True if sequence contains turns (pro or anti spin) */
  readonly hasTurns: boolean;

  /** Number of steps with turns (pro or anti motion) */
  readonly turnStepCount: number;

  /** Which motion types appear in the sequence */
  readonly hasProMotion: boolean;
  readonly hasAntiMotion: boolean;
  readonly hasFloatMotion: boolean;
  readonly hasDashMotion: boolean;
  readonly hasStaticMotion: boolean;
}

export function createDefaultSequenceFeatures(): SequenceFeatures {
  return {
    stepCount: 0,
    gridMode: null,
    circularity: {
      isCircular: false,
      circularType: null,
      startPlacement: null,
      endPlacement: null,
      startIsBeta: false,
      endIsBeta: false,
      possibleLoopTypes: [],
      description: "Not circular",
    },
    detectedCapTypes: [],
    reversals: {
      leftReversalCount: 0,
      rightReversalCount: 0,
      totalReversals: 0,
      hasReversals: false,
      synchronizedReversals: false,
      leftReversalSteps: [],
      rightReversalSteps: [],
    },
    positionDominance: {
      primaryGroup: null,
      alphaPercent: 0,
      betaPercent: 0,
      gammaPercent: 0,
      isAlphaHeavy: false,
      isBetaHeavy: false,
      isGammaHeavy: false,
      isBalanced: true,
    },
    hasAlphaPositions: false,
    hasBetaPositions: false,
    hasGammaPositions: false,
    hasTurns: false,
    turnStepCount: 0,
    hasProMotion: false,
    hasAntiMotion: false,
    hasFloatMotion: false,
    hasDashMotion: false,
    hasStaticMotion: false,
  };
}
