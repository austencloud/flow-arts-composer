/**
 * Start Placement Validator Implementation
 *
 * Validates that start placements are static pictographs (Type 6 letters only).
 * Start placements must have startPlacement === endPlacement (no movement).
 */

import type { LetterTransitionGraph } from "./letter-transition-graph";
import type { ILetterQueryHandler } from "$lib/shared/foundation/services/data/data-contracts";
import type { Letter } from "$lib/shared/foundation/domain/models/letter";
import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
import type { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { getLetterType } from "$lib/shared/foundation/domain/models/letter";
import { LetterType } from "$lib/shared/foundation/domain/models/letter-type";

export class StartPlacementValidator {
  constructor(
    private readonly letterTransitionGraph: LetterTransitionGraph,
    private readonly letterQueryHandler: ILetterQueryHandler
  ) {}

  async getValidStartPlacements(
    firstLetter: Letter,
    gridMode: GridMode
  ): Promise<PictographData[]> {
    // Get the placement group where the first letter starts
    const startGroup = this.letterTransitionGraph.getStartPlacementGroup(firstLetter);
    if (!startGroup) {
      throw new Error(
        `Cannot determine start placement group for letter: ${firstLetter}`
      );
    }

    // Get all pictograph variations
    const allPictographs =
      await this.letterQueryHandler.getAllPictographVariations(gridMode);

    // Filter for valid start placements that end at the required group
    const validStartPlacements = allPictographs.filter((p) => {
      // Must be a valid static pictograph
      if (!this.isValidStartPlacement(p)) {
        return false;
      }

      // Must end at the required placement group
      const endPos = this.getEndPlacement(p);
      const endGroup = this.placementToGroup(endPos);
      return endGroup === startGroup;
    });

    if (validStartPlacements.length === 0) {
      throw new Error(
        `No valid start placements found for letter ${firstLetter} in ${gridMode} mode. ` +
          `Start placements must be Type 6 (static) letters ending at placement group: ${startGroup}`
      );
    }

    return validStartPlacements;
  }

  isValidStartPlacement(pictograph: PictographData): boolean {
    // Check 1: Must be a Type 6 (static) letter
    if (!pictograph.letter) {
      return false;
    }

    const letterType = getLetterType(pictograph.letter);
    if (letterType !== LetterType.TYPE6) {
      return false;
    }

    // Check 2: Must have startPlacement === endPlacement (static/no movement)
    if (pictograph.startPlacement !== pictograph.endPlacement) {
      return false;
    }

    return true;
  }

  /**
   * Helper: Get the end placement from a pictograph
   */
  private getEndPlacement(pictograph: PictographData): string {
    return (pictograph.endPlacement || pictograph.startPlacement || "") as string;
  }

  /**
   * Helper: Convert a placement string to its group (alpha, beta, gamma)
   */
  private placementToGroup(placement: string): string | null {
    if (!placement) return null;
    if (placement.startsWith("alpha")) return "alpha";
    if (placement.startsWith("beta")) return "beta";
    if (placement.startsWith("gamma")) return "gamma";
    if (placement.startsWith("zeta")) return "zeta";
    if (placement.startsWith("eta")) return "eta";
    return null;
  }
}

// ============================================================================
// DIRECT SINGLETON EXPORT
// ============================================================================
import { letterTransitionGraph } from "./letter-transition-graph";
import { letterQueryHandler } from "$lib/shared/pictograph/tka-glyph/services/letter-query-handler";

export const startPlacementValidator = new StartPlacementValidator(
  letterTransitionGraph,
  letterQueryHandler
);
