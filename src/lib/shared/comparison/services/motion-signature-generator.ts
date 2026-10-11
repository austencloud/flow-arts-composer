/**
 * Motion Signature Generator Implementation
 *
 * Creates rotation-invariant signatures for individual motions.
 * The signature captures the geometric essence independent of grid position.
 */

import type { MotionWithView } from "#lib/shared/pictograph/shared/domain/models/motion-view.js";
import type {
  MotionSignature,
  MotionComparisonResult,
  LocationDelta,
  OrientationTransition,
} from "../domain/models/signatures";
import { GridLocation } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import { HandPath, MotionType } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";

/**
 * Scoring weights for motion similarity calculation.
 * These can be adjusted based on what aspects matter most for comparison.
 */
const SCORING_WEIGHTS = {
  motionType: 0.35,
  rotationDirection: 0.20,
  turns: 0.20,
  orientationTransition: 0.15,
  locationDelta: 0.10,
} as const;

/**
 * Map of grid locations to their angular position (in 45° steps from north).
 * North = 0, Northeast = 1, East = 2, etc.
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

export class MotionSignatureGenerator {
  generateSignature(motion: MotionWithView): MotionSignature {
    return {
      motionType: motion.motionType,
      rotationDirection: motion.rotationDirection,
      turns: motion.turns,
      orientationTransition: this.extractOrientationTransition(motion),
      locationDelta: this.extractLocationDelta(motion),
      skewSteps: motion.skewSteps ?? 0,
      skewDir: motion.skewDir ?? null,
    };
  }

  signaturesMatch(a: MotionSignature, b: MotionSignature): boolean {
    return (
      a.motionType === b.motionType &&
      a.rotationDirection === b.rotationDirection &&
      a.turns === b.turns &&
      this.orientationTransitionsMatch(a.orientationTransition, b.orientationTransition) &&
      this.locationDeltasMatch(a.locationDelta, b.locationDelta) &&
      a.skewSteps === b.skewSteps &&
      a.skewDir === b.skewDir
    );
  }

  compareSignatures(a: MotionSignature, b: MotionSignature): MotionComparisonResult {
    const breakdown = {
      motionTypeMatch: a.motionType === b.motionType,
      rotationDirectionMatch: a.rotationDirection === b.rotationDirection,
      turnsMatch: a.turns === b.turns,
      orientationTransitionMatch: this.orientationTransitionsMatch(
        a.orientationTransition,
        b.orientationTransition
      ),
      locationDeltaMatch: this.locationDeltasMatch(a.locationDelta, b.locationDelta),
    };

    // Calculate weighted similarity score
    let score = 0;

    // Motion type: exact match or nothing
    if (breakdown.motionTypeMatch) {
      score += SCORING_WEIGHTS.motionType;
    }

    // Rotation direction: full match, partial for NO_ROTATION, zero for opposite
    if (breakdown.rotationDirectionMatch) {
      score += SCORING_WEIGHTS.rotationDirection;
    } else if (
      a.rotationDirection === "noRotation" ||
      b.rotationDirection === "noRotation"
    ) {
      score += SCORING_WEIGHTS.rotationDirection * 0.5;
    }

    // Turns: proportional similarity
    if (breakdown.turnsMatch) {
      score += SCORING_WEIGHTS.turns;
    } else {
      const turnsA = typeof a.turns === "number" ? a.turns : 0;
      const turnsB = typeof b.turns === "number" ? b.turns : 0;
      const maxTurns = Math.max(turnsA, turnsB, 1);
      const turnsSimilarity = 1 - Math.abs(turnsA - turnsB) / maxTurns;
      score += SCORING_WEIGHTS.turns * turnsSimilarity;
    }

    // Orientation transition
    if (breakdown.orientationTransitionMatch) {
      score += SCORING_WEIGHTS.orientationTransition;
    }

    // Location delta
    if (breakdown.locationDeltaMatch) {
      score += SCORING_WEIGHTS.locationDelta;
    }

    return {
      isExactMatch: Object.values(breakdown).every(Boolean),
      similarity: Math.min(1, Math.max(0, score)),
      breakdown,
    };
  }

  hashSignature(signature: MotionSignature): string {
    // Create a compact string representation
    const parts = [
      signature.motionType,
      signature.rotationDirection,
      String(signature.turns),
      `${signature.orientationTransition.from}-${signature.orientationTransition.to}`,
      `${signature.locationDelta.steps}:${signature.locationDelta.direction}`,
      signature.skewSteps > 0 ? `sk${signature.skewSteps}${signature.skewDir ?? ""}` : "",
    ];
    return parts.filter(Boolean).join("|");
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  private extractOrientationTransition(motion: MotionWithView): OrientationTransition {
    return {
      from: motion.startOrientation,
      to: motion.endOrientation,
    };
  }

  private extractLocationDelta(motion: MotionWithView): LocationDelta {
    const startLoc = motion.startLocation;
    const endLoc = motion.endLocation;

    // Handle center-involved movements (hash paths)
    const startIsCenter = startLoc === GridLocation.CENTER;
    const endIsCenter = endLoc === GridLocation.CENTER;

    if (startIsCenter && endIsCenter) {
      return { steps: 0, direction: HandPath.STATIC };
    }
    if (startIsCenter && !endIsCenter) {
      // Center → perimeter = hash-out (half-dash distance)
      return { steps: 2, direction: HandPath.HASH_OUT };
    }
    if (!startIsCenter && endIsCenter) {
      // Perimeter → center = hash-in (half-dash distance)
      return { steps: 2, direction: HandPath.HASH_IN };
    }

    const startAngle = LOCATION_TO_ANGLE[startLoc];
    const endAngle = LOCATION_TO_ANGLE[endLoc];

    // Calculate angular distance (0-7 steps)
    let steps = (endAngle - startAngle + 8) % 8;

    // Normalize to shortest path (e.g., 7 steps CW = 1 step CCW)
    // But keep the full distance for dashes (4 steps = 180°)
    let direction: HandPath;

    if (steps === 0) {
      direction = HandPath.STATIC;
    } else if (steps === 4) {
      // Dash: straight across, direction is ambiguous
      direction = HandPath.DASH;
    } else if (steps < 4) {
      // Clockwise (shorter path)
      direction = HandPath.CLOCKWISE;
    } else {
      // Counter-clockwise (shorter path when steps > 4)
      steps = 8 - steps;
      direction = HandPath.COUNTER_CLOCKWISE;
    }

    // Override with explicit handPath if available
    if (motion.handPath && motion.motionType !== MotionType.STATIC) {
      direction = motion.handPath;
    }

    return { steps, direction };
  }

  private orientationTransitionsMatch(
    a: OrientationTransition,
    b: OrientationTransition
  ): boolean {
    return a.from === b.from && a.to === b.to;
  }

  private locationDeltasMatch(a: LocationDelta, b: LocationDelta): boolean {
    return a.steps === b.steps && a.direction === b.direction;
  }
}
