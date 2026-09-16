/**
 * Filter Service Implementation
 *
 * Handles filtering of pictograph options by type, end placement, and reversals.
 * Extracted from OptionPickerService for better separation of concerns.
 */

import type { Letter } from "$lib/shared/foundation/domain/models/letter";
import { getLetterType } from "$lib/shared/foundation/domain/models/letter";
import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
import { GridPlacementGroup } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import type {
  EndPlacementFilter,
  ReversalFilter,
  TypeFilter,
} from "../domain/option-picker-types";
import type { PlacementAnalyzer } from "./placement-analyzer";
import { getReversalCount } from "./reversal-checker";
import { LetterType } from "../../../../../shared/foundation/domain/models/letter-type";

export class OptionFilter {
  constructor(
    private placementAnalyzer: PlacementAnalyzer
  ) {}

  applyTypeFiltering(
    options: PictographData[],
    typeFilter: TypeFilter
  ): PictographData[] {
    return options.filter((option) => {
      const letterType = this.getLetterType(option.letter);

      switch (letterType) {
        case LetterType.TYPE1:
          return typeFilter.type1;
        case LetterType.TYPE2:
          return typeFilter.type2;
        case LetterType.TYPE3:
          return typeFilter.type3;
        case LetterType.TYPE4:
          return typeFilter.type4;
        case LetterType.TYPE5:
          return typeFilter.type5;
        case LetterType.TYPE6:
          return typeFilter.type6;
        default:
          return true; // Include unknown types by default
      }
    });
  }

  /**
   * Apply end placement filtering to options
   */
  applyEndPlacementFiltering(
    options: PictographData[],
    endPlacementFilter: EndPlacementFilter
  ): PictographData[] {
    return options.filter((option) => {
      const endPlacementGroup = this.placementAnalyzer.getEndPlacementGroup(
        option.endPlacement
      );

      switch (endPlacementGroup) {
        case GridPlacementGroup.ALPHA:
          return endPlacementFilter.alpha;
        case GridPlacementGroup.BETA:
          return endPlacementFilter.beta;
        case GridPlacementGroup.GAMMA:
          return endPlacementFilter.gamma;
        default:
          return true; // Include unknown placements by default
      }
    });
  }

  /**
   * Apply reversal filtering to options
   */
  applyReversalFiltering(
    options: PictographData[],
    reversalFilter: ReversalFilter,
    sequence: PictographData[]
  ): PictographData[] {
    return options.filter((option) => {
      const reversalCount = getReversalCount(option, sequence);

      switch (reversalCount) {
        case 0:
          return reversalFilter.continuous;
        case 1:
          return reversalFilter["1-reversal"];
        case 2:
          return reversalFilter["2-reversals"];
        default:
          return true; // Include unknown reversal counts by default
      }
    });
  }

  /**
   * Filter pictographs by letter type
   */
  filterPictographsByType(
    pictographs: PictographData[],
    letterType: LetterType
  ): PictographData[] {
    return pictographs.filter(
      (p: PictographData) =>
        this.getLetterTypeFromString(p.letter) === letterType
    );
  }

  /**
   * Determine letter type from letter string using shared infrastructure
   */
  private getLetterType(letter: string | null | undefined): LetterType {
    if (!letter) return LetterType.TYPE1;

    try {
      // Use the existing shared getLetterType function
      const letterEnum = letter as Letter;
      const letterType = getLetterType(letterEnum);
      return letterType as LetterType; // Returns LetterType enum value (e.g., "Type1")
    } catch (error) {
      // Fallback for invalid letters
      console.warn(
        `Failed to determine letter type for "${letter}", defaulting to TYPE1:`,
        error
      );
      return LetterType.TYPE1;
    }
  }

  /**
   * Helper function to convert string letter to Letter enum and get type
   * Uses shared infrastructure instead of duplicated logic
   */
  private getLetterTypeFromString(
    letter: string | null | undefined
  ): LetterType {
    // Delegate to the main getLetterType method which now uses shared infrastructure
    return this.getLetterType(letter);
  }
}

import { placementAnalyzer } from "./placement-analyzer";

export const optionFilter = new OptionFilter(placementAnalyzer);
