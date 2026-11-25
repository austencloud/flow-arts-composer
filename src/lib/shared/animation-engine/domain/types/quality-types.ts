/**
 * Quality Types
 *
 * Types for the adaptive frame quality system that dynamically adjusts
 * rendering quality based on frame budget and device capabilities.
 */

/**
 * Quality tier for rendering parameters
 */
export enum QualityTier {
  HIGH = "high",
  MEDIUM = "medium",
  LOW = "low",
}

/**
 * Hints passed to renderers each frame for quality-adaptive rendering
 */
export interface QualityHints {
  /** Current quality tier */
  tier: QualityTier;
  /** Target total spline subdivisions (150 / 60 / 20) */
  targetSubdivisions: number;
  /** Max subdivisions per spline segment (10 / 5 / 3) */
  maxSubdivisionsPerSegment: number;
  /** Whether glow (shadowBlur) should be rendered */
  glowEnabled: boolean;
  /** Maximum device pixel ratio to use (native / 2.0 / 1.0) */
  maxDpr: number;
  /**
   * Every trail drawn at its full width, head to tail, instead of thinning
   * towards the tail: for light that is kept rather than trailing off.
   */
  uniformWidth?: boolean;
}

/**
 * Device capability tier determined at startup
 */
export enum DeviceTier {
  /** Desktop or high-end mobile (8+ cores) */
  HIGH = "high",
  /** Mobile with >4 cores */
  MEDIUM = "medium",
  /** Mobile with <=4 cores */
  LOW = "low",
}

/**
 * Configuration for quality adaptation behavior
 */
export interface QualityAdaptationConfig {
  /** Target frame time in ms (default: 16.67 for 60fps) */
  targetFrameTimeMs: number;
  /** Frames over budget before degrading (default: 5) */
  degradeAfterFrames: number;
  /** Consecutive under-budget frames before recovering (default: 60) */
  recoverAfterFrames: number;
  /** Recovery threshold as fraction of target (default: 0.7 = 70%) */
  recoverThreshold: number;
  /** Minimum time between tier changes in ms (default: 2000) */
  minTimeBetweenChangesMs: number;
}

/** Quality parameters indexed by tier */
export const QUALITY_TIER_PARAMS: Record<QualityTier, Omit<QualityHints, "tier">> = {
  [QualityTier.HIGH]: {
    targetSubdivisions: 150,
    maxSubdivisionsPerSegment: 10,
    glowEnabled: true,
    maxDpr: Infinity, // native
  },
  [QualityTier.MEDIUM]: {
    targetSubdivisions: 60,
    maxSubdivisionsPerSegment: 5,
    glowEnabled: false,
    maxDpr: 2.0,
  },
  [QualityTier.LOW]: {
    targetSubdivisions: 20,
    maxSubdivisionsPerSegment: 3,
    glowEnabled: false,
    maxDpr: 1.0,
  },
};
