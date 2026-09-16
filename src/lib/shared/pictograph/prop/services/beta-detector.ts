/**
 * Beta Detector Implementation
 *
 * Provides methods for detecting beta placements in pictographs.
 * Migrated from utils/betaDetection.ts to proper service architecture.
 */

import { getGridPlacementFromLocations } from "../../grid/services/grid-placement-deriver";
import type { GridPlacement } from "../../grid/domain/enums/grid-enums";
import type { PictographData } from "../../shared/domain/models/pictograph-data";
import { isVisibleMotion } from "../../shared/domain/models/motion-data";

export class BetaDetector {
  /**
   * Check if a grid placement is a beta placement
   * Beta placements are the BETA enum values
   */
  isBetaPlacement(placement: GridPlacement): boolean {
    return placement.toString().startsWith("beta");
  }

  /**
   * Check if a pictograph starts with beta (start placement is a beta placement)
   */
  startsWithBeta(pictographData: PictographData): boolean {
    if (
      !isVisibleMotion(pictographData.motions.left) ||
      !isVisibleMotion(pictographData.motions.right)
    ) {
      return false;
    }

    const startPlacement = getGridPlacementFromLocations(
      pictographData.motions.left.startLocation,
      pictographData.motions.right.startLocation
    );

    return this.isBetaPlacement(startPlacement);
  }

  /**
   * Check if a pictograph ends with beta (end placement is a beta placement)
   */
  endsWithBeta(pictographData: PictographData): boolean {
    if (
      !isVisibleMotion(pictographData.motions.left) ||
      !isVisibleMotion(pictographData.motions.right)
    ) {
      // No motion data = can't end with beta placement
      // This is expected in some contexts (static pictographs, loading states)
      return false;
    }

    const rightEndLocation = pictographData.motions.right.endLocation;
    const leftEndLocation = pictographData.motions.left.endLocation;

    // Beta detection: both props end at the same location
    return rightEndLocation === leftEndLocation;
  }
}

// DIRECT EXPORT - Use this instead of betaDetector
// This avoids DI container rebuilds when this file changes
export const betaDetector = new BetaDetector();
