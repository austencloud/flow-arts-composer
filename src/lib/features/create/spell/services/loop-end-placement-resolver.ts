/**
 * LOOP End Placement Resolver
 *
 * Determines valid end placements for a sequence seed given a start placement and LOOP type.
 * Composes from existing placement maps (rotation, mirror, swap) rather than introducing
 * new data. Follows the same precedence as LOOPEndPlacementSelector:
 *
 *   ROTATED > MIRRORED > INVERTED > SWAPPED
 *
 * For composite LOOPs, only the highest-precedence transformation constrains the
 * seed's end placement. Outer transformations operate on the already-extended result.
 */

import type { GridPlacement } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import {
  LOOPType,
  Period,
} from "$lib/shared/foundation/domain/models/generation/circular-models";

/**
 * Interface describing the shape of the LOOP end placement resolver module.
 * Consumers that previously held a class instance can use this type.
 */
export interface LOOPEndPlacementResolver {
  getValidEndPlacements: (startPlacement: GridPlacement, loopType: LOOPType, period?: Period) => GridPlacement[];
  isValidEndPlacement: (startPlacement: GridPlacement, endPlacement: GridPlacement, loopType: LOOPType, period?: Period) => boolean;
}
import {
  HALF_PLACEMENT_MAP,
  QUARTER_PLACEMENT_MAP_CW,
  QUARTER_PLACEMENT_MAP_CCW,
} from "$lib/shared/foundation/domain/models/generation/circular-placement-maps";
import {
  VERTICAL_MIRROR_PLACEMENT_MAP,
  HORIZONTAL_MIRROR_PLACEMENT_MAP,
  SWAPPED_PLACEMENT_MAP,
} from "$lib/features/create/generate/circular/domain/constants/strict-loop-placement-maps";

export function getValidEndPlacements(
  startPlacement: GridPlacement,
  loopType: LOOPType,
  period: Period = Period.HALVED
): GridPlacement[] {
  switch (loopType) {
    // --- REWOUND: No placement constraint ---
    case LOOPType.STRICT_REWOUND:
      return [];

    // --- ROTATED (and composites where rotation takes precedence) ---
    case LOOPType.ROTATED:
    case LOOPType.ROTATED_INVERTED:
    case LOOPType.ROTATED_SWAPPED:
    case LOOPType.ROTATED_SWAPPED_INVERTED:
    case LOOPType.MIRRORED_ROTATED:
    case LOOPType.MIRRORED_INVERTED_ROTATED:
    case LOOPType.MIRRORED_ROTATED_INVERTED_SWAPPED:
      return getRotatedEndPlacements(startPlacement, period);

    // --- MIRRORED (vertical mirror, and composites without rotation) ---
    case LOOPType.MIRRORED:
    case LOOPType.MIRRORED_INVERTED:
      return getSingleEndPlacement(VERTICAL_MIRROR_PLACEMENT_MAP, startPlacement);

    // --- FLIPPED (horizontal mirror) ---
    case LOOPType.FLIPPED:
      return getSingleEndPlacement(HORIZONTAL_MIRROR_PLACEMENT_MAP, startPlacement);

    // --- MIRRORED_SWAPPED: compose mirror then swap ---
    case LOOPType.MIRRORED_SWAPPED: {
      const mirrored = VERTICAL_MIRROR_PLACEMENT_MAP[startPlacement];
      if (!mirrored) return [];
      const swapped = SWAPPED_PLACEMENT_MAP[mirrored];
      return swapped ? [swapped] : [];
    }

    // --- SWAPPED (strict only, no rotation/mirror) ---
    case LOOPType.SWAPPED:
    case LOOPType.SWAPPED_INVERTED:
      return getSingleEndPlacement(SWAPPED_PLACEMENT_MAP, startPlacement);

    // --- INVERTED alone: must return to start ---
    case LOOPType.INVERTED:
      return [startPlacement];

    default:
      // Unknown LOOP type - return empty (unconstrained) so generation still works
      console.warn(
        `[LOOPEndPlacementResolver] Unknown LOOP type: ${loopType}. Skipping end placement constraint.`
      );
      return [];
  }
}

export function isValidEndPlacement(
  startPlacement: GridPlacement,
  endPlacement: GridPlacement,
  loopType: LOOPType,
  period: Period = Period.HALVED
): boolean {
  const validPlacements = getValidEndPlacements(startPlacement, loopType, period);

  // Empty array means unconstrained - any placement is valid
  if (validPlacements.length === 0) return true;

  return validPlacements.includes(endPlacement);
}

// ============================================================================
// PRIVATE HELPERS
// ============================================================================

/**
 * Get valid end placements for rotation-based LOOPs.
 * For halved: returns the single 180-rotated placement.
 * For quartered: returns both CW and CCW 90 targets for maximum flexibility.
 */
function getRotatedEndPlacements(
  startPlacement: GridPlacement,
  period: Period
): GridPlacement[] {
  if (period === Period.QUARTERED) {
    const placements: GridPlacement[] = [];
    const cw = QUARTER_PLACEMENT_MAP_CW[startPlacement];
    const ccw = QUARTER_PLACEMENT_MAP_CCW[startPlacement];
    if (cw) placements.push(cw);
    if (ccw && ccw !== cw) placements.push(ccw);
    return placements;
  }

  // HALVED - single 180 placement
  const halved = HALF_PLACEMENT_MAP[startPlacement];
  return halved ? [halved] : [];
}

/**
 * Look up a single end placement from a Record<GridPlacement, GridPlacement> map.
 */
function getSingleEndPlacement(
  map: Record<GridPlacement, GridPlacement>,
  startPlacement: GridPlacement
): GridPlacement[] {
  const result = map[startPlacement];
  return result ? [result] : [];
}
