/**
 * Beat Signature Generator Implementation
 *
 * Creates rotation-invariant signatures for complete beats (both hands).
 * Composes motion signatures with position group and hand angle information.
 */

import type { StepLike } from "$lib/shared/foundation/domain/models/step-like";
import type { MotionSignatureGenerator } from "./motion-signature-generator";
import type {
  StepSignature,
  StepComparisonResult,
  MotionSignature,
} from "../domain/models/signatures";
import type { GridPlacement } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import {
  GridLocation,
  GridPlacementGroup,
} from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { HandSide } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { getPlacementGroup } from "$lib/shared/foundation/domain/models/generation/circular-placement-maps";

/**
 * Scoring weights for beat similarity calculation.
 */
const SCORING_WEIGHTS = {
  leftMotion: 0.35,
  rightMotion: 0.35,
  placementGroup: 0.2,
  handAngle: 0.1,
} as const;

/**
 * Map of grid locations to their angular position (in 45° steps from north).
 */
const LOCATION_TO_ANGLE: Record<GridLocation, number> = {
  [GridLocation.NORTH]: 0,
  [GridLocation.NORTHEAST]: 1,
  [GridLocation.EAST]: 2,
  [GridLocation.SOUTHEAST]: 3,
  [GridLocation.SOUTH]: 4,
  [GridLocation.SOUTHWEST]: 5,
  [GridLocation.WEST]: 6,
  [GridLocation.NORTHWEST]: 7,
  [GridLocation.CENTER]: 0,
};

export class StepSignatureGenerator {
  constructor(
    private readonly motionSignatureGenerator: MotionSignatureGenerator
  ) {}

  generateSignature(step: StepLike): StepSignature {
    const leftMotion = step.motions[HandSide.LEFT];
    const rightMotion = step.motions[HandSide.RIGHT];

    if (!leftMotion || !rightMotion) {
      throw new Error("Beat must have both left and right motions");
    }

    const leftSignature =
      this.motionSignatureGenerator.generateSignature(leftMotion);
    const rightSignature =
      this.motionSignatureGenerator.generateSignature(rightMotion);

    const startPlacementGroup = this.derivePlacementGroup(step.startPlacement);
    const endPlacementGroup = this.derivePlacementGroup(step.endPlacement);

    const startHandAngle = this.calculateHandAngle(
      leftMotion.startLocation,
      rightMotion.startLocation
    );
    const endHandAngle = this.calculateHandAngle(
      leftMotion.endLocation,
      rightMotion.endLocation
    );

    const hash = this.generateHash(
      leftSignature,
      rightSignature,
      startPlacementGroup,
      endPlacementGroup,
      startHandAngle,
      endHandAngle
    );

    return {
      startPlacementGroup,
      endPlacementGroup,
      left: leftSignature,
      right: rightSignature,
      startHandAngle,
      endHandAngle,
      hash,
    };
  }

  signaturesMatch(a: StepSignature, b: StepSignature): boolean {
    // Quick check: if hashes differ, definitely not equal
    if (a.hash !== b.hash) {
      return false;
    }

    return (
      a.startPlacementGroup === b.startPlacementGroup &&
      a.endPlacementGroup === b.endPlacementGroup &&
      this.motionSignatureGenerator.signaturesMatch(a.left, b.left) &&
      this.motionSignatureGenerator.signaturesMatch(a.right, b.right) &&
      a.startHandAngle === b.startHandAngle &&
      a.endHandAngle === b.endHandAngle
    );
  }

  compareSignatures(a: StepSignature, b: StepSignature): StepComparisonResult {
    const leftComparison = this.motionSignatureGenerator.compareSignatures(
      a.left,
      b.left
    );
    const rightComparison = this.motionSignatureGenerator.compareSignatures(
      a.right,
      b.right
    );

    const placementGroupMatch =
      a.startPlacementGroup === b.startPlacementGroup &&
      a.endPlacementGroup === b.endPlacementGroup;

    const handAngleMatch =
      a.startHandAngle === b.startHandAngle &&
      a.endHandAngle === b.endHandAngle;

    let score = 0;
    score += SCORING_WEIGHTS.leftMotion * leftComparison.similarity;
    score += SCORING_WEIGHTS.rightMotion * rightComparison.similarity;
    score += SCORING_WEIGHTS.placementGroup * (placementGroupMatch ? 1 : 0);
    score += SCORING_WEIGHTS.handAngle * (handAngleMatch ? 1 : 0);

    const isExactMatch =
      leftComparison.isExactMatch &&
      rightComparison.isExactMatch &&
      placementGroupMatch &&
      handAngleMatch;

    return {
      isExactMatch,
      similarity: Math.min(1, Math.max(0, score)),
      breakdown: {
        placementGroupMatch,
        leftSimilarity: leftComparison.similarity,
        rightSimilarity: rightComparison.similarity,
        handAngleMatch,
      },
    };
  }

  generateSignatures(steps: readonly StepLike[]): readonly StepSignature[] {
    return steps.map((step) => this.generateSignature(step));
  }

  /**
   * Derive position group from a GridPlacement.
   * Falls back to ALPHA if position is not provided.
   */
  private derivePlacementGroup(
    position: GridPlacement | null | undefined
  ): GridPlacementGroup {
    if (!position) {
      return GridPlacementGroup.ALPHA;
    }

    try {
      return getPlacementGroup(position);
    } catch (error) {
      // If position doesn't match expected format, try parsing the prefix.
      if (position.startsWith("alpha")) return GridPlacementGroup.ALPHA;
      if (position.startsWith("beta")) return GridPlacementGroup.BETA;
      if (position.startsWith("gamma")) return GridPlacementGroup.GAMMA;
      if (position.startsWith("zeta")) return GridPlacementGroup.ZETA;
      if (position.startsWith("eta")) return GridPlacementGroup.ETA;
      // Nothing matched — the position data is corrupt. Surface it instead of
      // silently treating every bad value as ALPHA, which would produce wrong
      // signatures (and wrong comparison results) with no trace.
      console.warn(
        `[StepSignatureGenerator] Unrecognized position "${position}"; falling back to ALPHA. Comparison results may be inaccurate.`,
        error
      );
      return GridPlacementGroup.ALPHA;
    }
  }

  /**
   * Calculate the angular distance between two hand locations.
   * Returns value from 0-4 (in 45° steps):
   * - 0 = same location (beta)
   * - 1 = 45° apart (eta)
   * - 2 = 90° apart (gamma)
   * - 3 = 135° apart (zeta)
   * - 4 = 180° apart (alpha)
   */
  private calculateHandAngle(
    leftLocation: GridLocation,
    rightLocation: GridLocation
  ): number {
    const leftAngle = LOCATION_TO_ANGLE[leftLocation];
    const rightAngle = LOCATION_TO_ANGLE[rightLocation];

    // Calculate absolute angular difference
    let diff = Math.abs(leftAngle - rightAngle);

    // Normalize to 0-4 range (shortest path around the circle)
    if (diff > 4) {
      diff = 8 - diff;
    }

    return diff;
  }

  /**
   * Generate a hash for quick inequality checking.
   */
  private generateHash(
    left: MotionSignature,
    right: MotionSignature,
    startPosGroup: GridPlacementGroup,
    endPosGroup: GridPlacementGroup,
    startAngle: number,
    endAngle: number
  ): string {
    const leftHash = this.motionSignatureGenerator.hashSignature(left);
    const rightHash = this.motionSignatureGenerator.hashSignature(right);
    return `${startPosGroup}>${endPosGroup}:${startAngle}-${endAngle}:B[${leftHash}]R[${rightHash}]`;
  }
}
