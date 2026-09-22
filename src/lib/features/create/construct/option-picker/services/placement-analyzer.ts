/**
 * Placement Analyzer Implementation
 *
 * Handles analysis of placement data for end placement calculations, grouping,
 * and rotation relationships. Used by option picker and sequence extension.
 */

import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
import { GridPlacementGroup } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import type { GridPlacement } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import type { RotationRelation } from "./types";
import { getGridPlacementFromLocations } from "$lib/shared/pictograph/grid/services/grid-placement-deriver";

export class PlacementAnalyzer {

  /**
   * Get the placement group (alpha, beta, gamma, zeta, eta, tau, terra) from a GridPlacement
   */
  getEndPlacementGroup(
    endPlacement: GridPlacement | null | undefined
  ): GridPlacementGroup | null {
    if (!endPlacement) return null;

    const placementStr = endPlacement.toString().toLowerCase();

    if (placementStr.startsWith("alpha")) return GridPlacementGroup.ALPHA;
    if (placementStr.startsWith("beta")) return GridPlacementGroup.BETA;
    if (placementStr.startsWith("gamma")) return GridPlacementGroup.GAMMA;
    if (placementStr.startsWith("zeta")) return GridPlacementGroup.ZETA;
    if (placementStr.startsWith("eta")) return GridPlacementGroup.ETA;
    if (placementStr.startsWith("tau")) return GridPlacementGroup.TAU;
    if (placementStr.startsWith("terra")) return GridPlacementGroup.TERRA;

    return null;
  }

  /**
   * Calculate end placement from motion data
   */
  getEndPlacement(pictographData: PictographData): string | null {
    if (!pictographData.motions.left || !pictographData.motions.right) {
      return null;
    }

    try {
      const endPlacement = getGridPlacementFromLocations(
        pictographData.motions.left.endLocation,
        pictographData.motions.right.endLocation
      );

      return endPlacement.toString();
    } catch (error) {
      console.error("Error calculating end placement:", error);
      return null;
    }
  }

  /**
   * Extract the numeric part of a placement (e.g., "alpha3" → 3)
   */
  getPlacementNumber(placement: GridPlacement): number | null {
    const match = placement.toString().match(/(\d+)$/);
    return match?.[1] ? parseInt(match[1], 10) : null;
  }

  /**
   * Calculate the rotation relationship between two placements in the same group.
   */
  getRotationRelation(
    startPlacement: GridPlacement,
    endPlacement: GridPlacement
  ): RotationRelation | null {
    const startGroup = this.getEndPlacementGroup(startPlacement);
    const endGroup = this.getEndPlacementGroup(endPlacement);

    // Must be in same group
    if (!startGroup || !endGroup || startGroup !== endGroup) {
      return null;
    }

    const startNum = this.getPlacementNumber(startPlacement);
    const endNum = this.getPlacementNumber(endPlacement);

    if (startNum === null || endNum === null) {
      return null;
    }

    // Same placement = exact
    if (startNum === endNum) {
      return "exact";
    }

    // Calculate the difference (accounting for circular wraparound)
    // Gamma, zeta, eta, and tau have 16 placements; alpha/beta have 8;
    // terra has 1 and never reaches this branch.
    // "half"/"quarter" are index distances (index+8, index+4), gamma's
    // convention before 2026-09-21, mirrored here for zeta, eta, and tau.
    // circular-placement-maps.ts disagrees on "quarter" for all four
    // 16-groups, tau included: QUARTER_PLACEMENT_MAP_CW steps every one of
    // them by index+2, not this function's index+4. For gamma/zeta/eta that
    // index+4 happens to equal HALF_PLACEMENT_MAP's own step, so this
    // function's "quarter" is literally the maps' "half" there; tau's
    // HALF_PLACEMENT_MAP instead steps by index+8, so this function's
    // quarter matches neither map value for tau. The maps are not even
    // self-consistent for tau: two quarters (+2 each) sum to +4, not their
    // own half (+8), so a follow-up must resolve that before treating the
    // maps as source of truth. This mismatch feeds bridge-finder.ts and
    // calculateResultingLength (2x length for half, 4x for quarter) with an
    // off estimate (pre-existing for gamma, new for zeta/eta, which used to
    // return null). The fix: read the maps here instead of index math; that
    // also changes gamma's estimate, so it is a separate change.
    const sixteenSlots =
      startGroup === GridPlacementGroup.GAMMA ||
      startGroup === GridPlacementGroup.ZETA ||
      startGroup === GridPlacementGroup.ETA ||
      startGroup === GridPlacementGroup.TAU;
    const totalPlacements = sixteenSlots ? 16 : 8;
    const quarterStep = sixteenSlots ? 4 : 2;
    const halfStep = sixteenSlots ? 8 : 4;

    // Calculate absolute difference, accounting for wraparound
    let diff = Math.abs(endNum - startNum);
    if (diff > totalPlacements / 2) {
      diff = totalPlacements - diff;
    }

    if (diff === halfStep) {
      return "half";
    }
    if (diff === quarterStep || diff === quarterStep * 3) {
      return "quarter";
    }

    // Default to quarter for other valid placement relationships
    return "quarter";
  }

  /**
   * Check if two placements are in the same group (can potentially form a loop)
   */
  areInSameGroup(placement1: GridPlacement, placement2: GridPlacement): boolean {
    const group1 = this.getEndPlacementGroup(placement1);
    const group2 = this.getEndPlacementGroup(placement2);
    return group1 !== null && group1 === group2;
  }
}

export const placementAnalyzer = new PlacementAnalyzer();
