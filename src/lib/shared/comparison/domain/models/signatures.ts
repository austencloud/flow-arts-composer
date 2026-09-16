/**
 * Signature Models for Sequence Comparison
 *
 * These models represent rotation-invariant signatures for motions, beats, and sequences.
 * They capture the geometric essence of movements without absolute grid positions.
 */

// MotionType comes from the canonical package: it is a superset of the app
// enum (adds "shift"), and signatures are generated from canonical-compatible
// MotionWithView inputs. The other enums are structurally identical app-side.
import type { MotionType } from "@tka/tka-types";
import type { RotationDirection, Orientation, HandPath, SkewDirection } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import type { GridPlacementGroup } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";


/**
 * Rotation-invariant signature for a single motion.
 *
 * Captures the essence of a motion without absolute grid positions.
 * Two motions with the same signature are geometrically equivalent
 * (one could be a spatial rotation of the other).
 */
export interface MotionSignature {
  /** Core motion type: pro, anti, static, dash, float */
  readonly motionType: MotionType;

  /** Rotation direction of the prop: cw, ccw, noRotation */
  readonly rotationDirection: RotationDirection;

  /** Number of turns (or "fl" for float) */
  readonly turns: number | "fl";

  /** How orientation changes from start to end */
  readonly orientationTransition: OrientationTransition;

  /** How the hand moves (rotation-invariant representation) */
  readonly locationDelta: LocationDelta;

  /** Number of 45° skew steps (0 = normal motion) */
  readonly skewSteps: number;

  /** Direction of skew if applicable */
  readonly skewDir: SkewDirection | null;
}

/**
 * Describes how prop orientation changes during a motion.
 */
export interface OrientationTransition {
  readonly from: Orientation;
  readonly to: Orientation;
}

/**
 * Rotation-invariant representation of hand movement.
 *
 * Instead of absolute positions (n, e, s, w), we describe:
 * - How many 45° steps the hand travels
 * - Which direction relative to its starting point
 */
export interface LocationDelta {
  /**
   * Number of 45° steps between start and end location.
   * - 0 = static (hand doesn't move)
   * - 1 = one step (45°)
   * - 2 = shift (90° - adjacent position)
   * - 4 = dash (180° - opposite position)
   */
  readonly steps: number;

  /**
   * Direction of movement relative to hand's perspective.
   * - cw = clockwise around the grid
   * - ccw = counter-clockwise around the grid
   * - static = no movement
   * - dash = straight across (ambiguous direction)
   * - hashIn = straight line toward center (perimeter → center)
   * - hashOut = straight line away from center (center → perimeter)
   */
  readonly direction: HandPath;
}


/**
 * Rotation-invariant signature for a complete beat (both hands).
 *
 * Captures the full state of a single beat without absolute positions.
 */
export interface StepSignature {
  /** Position group at start (alpha, beta, gamma, etc.) */
  readonly startPlacementGroup: GridPlacementGroup;

  /** Position group at end */
  readonly endPlacementGroup: GridPlacementGroup;

  /** Blue hand motion signature */
  readonly left: MotionSignature;

  /** Red hand motion signature */
  readonly right: MotionSignature;

  /**
   * Angular relationship between hands at start.
   * Measured in 45° increments (0, 1, 2, 3, 4 = 0°, 45°, 90°, 135°, 180°).
   */
  readonly startHandAngle: number;

  /**
   * Angular relationship between hands at end.
   */
  readonly endHandAngle: number;

  /**
   * Compact hash for quick inequality checks.
   * Different hash = definitely not equivalent.
   * Same hash = need deeper comparison.
   */
  readonly hash: string;
}


/**
 * Rotation-invariant signature for a complete sequence.
 */
export interface SequenceSignature {
  /** TKA word in canonical (lexicographically smallest rotation) form */
  readonly canonicalWord: string;

  /** Number of steps in sequence */
  readonly stepCount: number;

  /** Whether sequence is circular */
  readonly isCircular: boolean;

  /** Signatures for each beat */
  readonly beatSignatures: readonly StepSignature[];

  /** Combined hash of all beat signatures */
  readonly hash: string;
}


/**
 * Result of comparing two motion signatures.
 */
export interface MotionComparisonResult {
  /** Whether signatures are exactly equal */
  readonly isExactMatch: boolean;

  /** Similarity score (0.0 - 1.0) */
  readonly similarity: number;

  /** Breakdown of what matched/differed */
  readonly breakdown: MotionComparisonBreakdown;
}

export interface MotionComparisonBreakdown {
  readonly motionTypeMatch: boolean;
  readonly rotationDirectionMatch: boolean;
  readonly turnsMatch: boolean;
  readonly orientationTransitionMatch: boolean;
  readonly locationDeltaMatch: boolean;
}

/**
 * Result of comparing two beat signatures.
 */
export interface StepComparisonResult {
  /** Whether beats are exactly equivalent */
  readonly isExactMatch: boolean;

  /** Overall similarity score (0.0 - 1.0) */
  readonly similarity: number;

  /** Detailed breakdown */
  readonly breakdown: StepComparisonBreakdown;
}

export interface StepComparisonBreakdown {
  readonly placementGroupMatch: boolean;
  readonly leftSimilarity: number;
  readonly rightSimilarity: number;
  readonly handAngleMatch: boolean;
}


/**
 * A spatial transform that can be applied to rotate a sequence around the grid.
 */
export interface SpatialTransform {
  /**
   * Number of 45° clockwise rotation steps (0-7).
   * - 0 = no rotation
   * - 1 = 45° clockwise
   * - 2 = 90° clockwise
   * - 4 = 180°
   * etc.
   */
  readonly rotationSteps: number;

  /**
   * Whether grid mode toggles (diamond ↔ box).
   * This happens on odd rotation steps.
   */
  readonly gridModeToggled: boolean;
}

/**
 * Result of detecting spatial transform between two beats.
 */
export interface SpatialTransformResult {
  /** Whether a transform was found that makes beats equivalent */
  readonly found: boolean;

  /** The transform (null if not found) */
  readonly transform: SpatialTransform | null;
}
