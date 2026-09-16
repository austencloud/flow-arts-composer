/**
 * Rotated End Placement Selector
 *
 * Determines the required end placement for rotated LOOPs based on:
 * - The start placement
 * - The slice size (halved or quartered)
 *
 * For halved LOOPs: Returns the opposite placement (180° rotation)
 * For quartered LOOPs: Randomly chooses between clockwise or counter-clockwise 90° rotation
 */

import type { GridPlacement } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import {
  HALF_PLACEMENT_MAP,
  QUARTER_PLACEMENT_MAP_CCW,
  QUARTER_PLACEMENT_MAP_CW,
} from "../domain/constants/circular-placement-maps";
import { Period } from "../domain/models/circular-models";

/**
 * Determine the required end placement for a rotated LOOP.
 *
 * @param period - Whether the rotation is halved (180°) or quartered (90°)
 * @param startPlacement - The starting placement of the sequence
 * @returns The required end placement to complete the rotation
 */
export function determineRotatedEndPlacement(
  period: Period,
  startPlacement: GridPlacement
): GridPlacement {
  if (period === Period.QUARTERED) {
    // For quartered LOOPs, randomly choose between clockwise and counter-clockwise
    // Non-null assertion: LOOP operations only use alpha/beta/gamma placements
    const cwEndPlacement = QUARTER_PLACEMENT_MAP_CW[startPlacement]!;
    const ccwEndPlacement = QUARTER_PLACEMENT_MAP_CCW[startPlacement]!;

    // Randomly select one
    return Math.random() < 0.5 ? cwEndPlacement : ccwEndPlacement;
  }
  // Period.HALVED
  // For halved LOOPs, use the opposite placement (180° rotation)
  // Non-null assertion: LOOP operations only use alpha/beta/gamma placements
  return HALF_PLACEMENT_MAP[startPlacement]!;
}

/**
 * Check if a given (start, end) placement pair is valid for the slice size.
 *
 * @param period - The slice size to validate against
 * @param startPlacement - The start placement
 * @param endPlacement - The end placement
 * @returns Whether the placement pair is valid for the given slice size
 */
export function isValidRotatedPair(
  period: Period,
  startPlacement: GridPlacement,
  endPlacement: GridPlacement
): boolean {
  if (period === Period.HALVED) {
    return HALF_PLACEMENT_MAP[startPlacement] === endPlacement;
  }
  // Period.QUARTERED
  const cwEndPlacement = QUARTER_PLACEMENT_MAP_CW[startPlacement];
  const ccwEndPlacement = QUARTER_PLACEMENT_MAP_CCW[startPlacement];
  return endPlacement === cwEndPlacement || endPlacement === ccwEndPlacement;
}
