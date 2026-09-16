import type { GridPlacement } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";

import {
  SWAPPED_PLACEMENT_MAP,
  VERTICAL_MIRROR_PLACEMENT_MAP,
  HORIZONTAL_MIRROR_PLACEMENT_MAP,
} from "../domain/constants/strict-loop-placement-maps";
import type { Period } from "../domain/models/circular-models";
import { LOOPType } from "../domain/models/circular-models";
import { determineRotatedEndPlacement } from "./rotated-end-placement-selector";

/**
 * Determine the required end placement based on LOOP type
 *
 * Routes to the appropriate placement calculation based on LOOP type:
 * - Rotated (with or without Inverted/Swapped): Uses rotation maps (depends on slice size)
 * - Mirrored (with or without Inverted/Swapped): Uses vertical mirror map
 * - Swapped + Inverted (no Rotated/Mirrored): Returns to start placement
 * - Inverted alone: Returns to start placement (no transformation)
 * - Swapped alone: Uses swap placement map
 *
 * Precedence order when combined:
 * 1. ROTATED (rotation takes precedence)
 * 2. MIRRORED (mirror takes precedence over inverted/swapped)
 * 3. INVERTED (return to start takes precedence over swapped)
 * 4. SWAPPED (only for strict swapped)
 */
export function determineEndPlacement(
  loopType: LOOPType,
  startPlacement: GridPlacement,
  period: Period
): GridPlacement | null {
  switch (loopType) {
    case LOOPType.ROTATED:
      return determineRotatedEndPlacement(period, startPlacement);

    case LOOPType.MIRRORED: {
      const mirroredEnd = VERTICAL_MIRROR_PLACEMENT_MAP[startPlacement]!;
      return mirroredEnd;
    }

    case LOOPType.FLIPPED: {
      const flippedEnd = HORIZONTAL_MIRROR_PLACEMENT_MAP[startPlacement]!;
      return flippedEnd;
    }

    case LOOPType.SWAPPED: {
      const swappedEnd = SWAPPED_PLACEMENT_MAP[startPlacement]!;
      return swappedEnd;
    }

    case LOOPType.INVERTED:
      return startPlacement;

    case LOOPType.ROTATED_INVERTED:
    case LOOPType.ROTATED_SWAPPED:
    case LOOPType.ROTATED_SWAPPED_INVERTED:
      return determineRotatedEndPlacement(period, startPlacement);

    case LOOPType.MIRRORED_ROTATED:
      return determineRotatedEndPlacement(period, startPlacement);

    case LOOPType.MIRRORED_INVERTED_ROTATED:
      return determineRotatedEndPlacement(period, startPlacement);

    case LOOPType.MIRRORED_ROTATED_INVERTED_SWAPPED:
      return determineRotatedEndPlacement(period, startPlacement);

    case LOOPType.MIRRORED_INVERTED:
      return VERTICAL_MIRROR_PLACEMENT_MAP[startPlacement]!;

    case LOOPType.MIRRORED_SWAPPED: {
      const mirroredPlacement = VERTICAL_MIRROR_PLACEMENT_MAP[startPlacement]!;
      return SWAPPED_PLACEMENT_MAP[mirroredPlacement]!;
    }

    case LOOPType.SWAPPED_INVERTED:
      return startPlacement;

    case LOOPType.STRICT_REWOUND:
      return null;

    default:
      throw new Error(
        `LOOP type "${loopType}" is not yet implemented. ` +
          `Currently supported: ROTATED, MIRRORED, FLIPPED, SWAPPED, ` +
          `INVERTED, MIRRORED_INVERTED, MIRRORED_SWAPPED, ` +
          `ROTATED_INVERTED, ROTATED_SWAPPED, ROTATED_SWAPPED_INVERTED, SWAPPED_INVERTED, MIRRORED_ROTATED, ` +
          `MIRRORED_INVERTED_ROTATED, MIRRORED_ROTATED_INVERTED_SWAPPED`
      );
  }
}
