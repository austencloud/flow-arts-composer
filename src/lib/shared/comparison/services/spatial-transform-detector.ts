/**
 * Spatial Transform Detector Implementation
 *
 * Detects what spatial transform (if any) relates two beats or sequences.
 * A spatial transform is a rotation around the grid center (0-7 steps of 45°).
 */

import type { Step } from "@tka/tka-types";
import type { SpatialTransform, SpatialTransformResult } from "../domain/models/signatures";
import { GridLocation } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { HandSide } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { LOCATION_MAP_EIGHTH_CW } from "$lib/shared/foundation/domain/models/generation/circular-placement-maps";

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

/**
 * All 8 possible spatial transforms (0° to 315° in 45° increments)
 */
const ALL_TRANSFORMS: readonly SpatialTransform[] = Array.from({ length: 8 }, (_, i) => ({
  rotationSteps: i,
  gridModeToggled: i % 2 === 1,
}));

export class SpatialTransformDetector {
  findTransform(beatA: Step, beatB: Step): SpatialTransformResult {
    // Try all 8 possible rotations
    for (const transform of ALL_TRANSFORMS) {
      if (this.isRotationOf(beatA, beatB, transform.rotationSteps)) {
        return {
          found: true,
          transform,
        };
      }
    }

    return {
      found: false,
      transform: null,
    };
  }

  isRotationOf(beatA: Step, beatB: Step, rotationSteps: number): boolean {
    const leftA = beatA.motions[HandSide.LEFT];
    const rightA = beatA.motions[HandSide.RIGHT];
    const leftB = beatB.motions[HandSide.LEFT];
    const rightB = beatB.motions[HandSide.RIGHT];

    if (!leftA || !rightA || !leftB || !rightB) {
      return false;
    }

    // Rotate beatA's locations by the specified steps and compare to beatB
    const rotatedLeftStart = this.rotateLocation(leftA.startLocation, rotationSteps);
    const rotatedLeftEnd = this.rotateLocation(leftA.endLocation, rotationSteps);
    const rotatedRightStart = this.rotateLocation(rightA.startLocation, rotationSteps);
    const rotatedRightEnd = this.rotateLocation(rightA.endLocation, rotationSteps);

    // Check if locations match
    const locationsMatch =
      rotatedLeftStart === leftB.startLocation &&
      rotatedLeftEnd === leftB.endLocation &&
      rotatedRightStart === rightB.startLocation &&
      rotatedRightEnd === rightB.endLocation;

    if (!locationsMatch) {
      return false;
    }

    // Check if motion types match
    const motionTypesMatch =
      leftA.motionType === leftB.motionType &&
      rightA.motionType === rightB.motionType;

    if (!motionTypesMatch) {
      return false;
    }

    // Check if rotation directions match
    const rotationDirectionsMatch =
      leftA.rotationDirection === leftB.rotationDirection &&
      rightA.rotationDirection === rightB.rotationDirection;

    if (!rotationDirectionsMatch) {
      return false;
    }

    // Check if turns match
    const turnsMatch = leftA.turns === leftB.turns && rightA.turns === rightB.turns;

    if (!turnsMatch) {
      return false;
    }

    // Check if orientations match
    const orientationsMatch =
      leftA.startOrientation === leftB.startOrientation &&
      leftA.endOrientation === leftB.endOrientation &&
      rightA.startOrientation === rightB.startOrientation &&
      rightA.endOrientation === rightB.endOrientation;

    return orientationsMatch;
  }

  rotateLocation(location: GridLocation, steps: number): GridLocation {
    // Normalize steps to 0-7 range
    const normalizedSteps = ((steps % 8) + 8) % 8;

    if (normalizedSteps === 0) {
      return location;
    }

    // Apply rotation steps iteratively
    let rotated = location;
    for (let i = 0; i < normalizedSteps; i++) {
      rotated = LOCATION_MAP_EIGHTH_CW[rotated] ?? rotated;
    }

    return rotated;
  }

  getAllTransforms(): readonly SpatialTransform[] {
    return ALL_TRANSFORMS;
  }

  getAngularDistance(from: GridLocation, to: GridLocation): number {
    const fromAngle = LOCATION_TO_ANGLE[from];
    const toAngle = LOCATION_TO_ANGLE[to];

    // Calculate clockwise distance
    const cwDistance = (toAngle - fromAngle + 8) % 8;

    // Return the shorter of clockwise or counter-clockwise
    return Math.min(cwDistance, 8 - cwDistance);
  }
}
