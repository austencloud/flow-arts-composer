/**
 * Rotated End Placement Selector
 *
 * Determines the required end placement for rotated LOOPs based on:
 * - The start placement
 * - The period (halved or quartered)
 *
 * For halved LOOPs: Returns the opposite placement (180 degree rotation)
 * For quartered LOOPs: Randomly chooses between clockwise or counter-clockwise 90 degree rotation
 *
 * Ported from app's RotatedEndPlacementSelector.ts.
 */

import {
  HALF_PLACEMENT_MAP,
  QUARTER_PLACEMENT_MAP_CW,
  QUARTER_PLACEMENT_MAP_CCW,
} from "../placement-maps/circular-placement-maps.js";
import { Period } from "../loop-types.js";

export class RotatedEndPlacementSelector {
  /**
   * Determine the required end placement for a rotated LOOP.
   * @param period - Whether the rotation is halved (180 degrees) or quartered (90 degrees)
   * @param startPlacement - The starting placement of the sequence
   * @returns The required end placement to complete the rotation
   */
  determineRotatedEndPlacement(period: Period, startPlacement: string): string {
    if (period === Period.QUARTERED) {
      const cwEndPlacement = QUARTER_PLACEMENT_MAP_CW[startPlacement];
      const ccwEndPlacement = QUARTER_PLACEMENT_MAP_CCW[startPlacement];

      if (!cwEndPlacement || !ccwEndPlacement) {
        throw new Error(`No quartered rotation mapping for placement: ${startPlacement}`);
      }

      // Randomly select CW or CCW
      return Math.random() < 0.5 ? cwEndPlacement : ccwEndPlacement;
    }

    // Period.HALVED — use opposite placement (180 degree rotation)
    const halvedEnd = HALF_PLACEMENT_MAP[startPlacement];
    if (!halvedEnd) {
      throw new Error(`No halved rotation mapping for placement: ${startPlacement}`);
    }
    return halvedEnd;
  }

  isValidRotatedPair(period: Period, startPlacement: string, endPlacement: string): boolean {
    if (period === Period.HALVED) {
      return HALF_PLACEMENT_MAP[startPlacement] === endPlacement;
    }
    // Period.QUARTERED
    const cwEndPlacement = QUARTER_PLACEMENT_MAP_CW[startPlacement];
    const ccwEndPlacement = QUARTER_PLACEMENT_MAP_CCW[startPlacement];
    return endPlacement === cwEndPlacement || endPlacement === ccwEndPlacement;
  }
}

export const rotatedEndPlacementSelector = new RotatedEndPlacementSelector();
