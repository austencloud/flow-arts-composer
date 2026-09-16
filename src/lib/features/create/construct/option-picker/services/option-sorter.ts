/**
 * Option Sorter Implementation
 *
 * Handles sorting of pictograph options by different methods.
 * Extracted from OptionPickerService for better separation of concerns.
 */

import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
import type { SortMethod } from "../domain/option-picker-types";
import type { PlacementAnalyzer } from "./placement-analyzer";
import { hasReversals } from "./reversal-checker";

export class OptionSorter {
  constructor(
    private placementAnalyzer: PlacementAnalyzer
  ) {}

  /**
   * Apply sorting to options based on the specified sort method
   * PRESERVED: Core sorting logic from OptionPickerService
   */
  applySorting(
    options: PictographData[],
    sortMethod: SortMethod
  ): PictographData[] {
    const sorted = [...options];

    switch (sortMethod) {
      case "type":
        return sorted.sort((a, b) => {
          const aLetter = a.letter ?? "";
          const bLetter = b.letter ?? "";
          return aLetter.localeCompare(bLetter);
        });

      case "endPlacement":
        return sorted.sort((a, b) => {
          const aPlacement = this.placementAnalyzer.getEndPlacement(a) ?? "";
          const bPlacement = this.placementAnalyzer.getEndPlacement(b) ?? "";
          return aPlacement.localeCompare(bPlacement);
        });

      case "reversals":
        return sorted.sort((a, b) => {
          const aHasRev = hasReversals(a);
          const bHasRev = hasReversals(b);
          if (aHasRev === bHasRev) {
            // If both have or don't have reversals, sort by letter
            const aLetter = a.letter ?? "";
            const bLetter = b.letter ?? "";
            return aLetter.localeCompare(bLetter);
          }
          return aHasRev ? -1 : 1; // Reversals first
        });

      default:
        return sorted;
    }
  }
}

import { placementAnalyzer } from "./placement-analyzer";

export const optionSorter = new OptionSorter(placementAnalyzer);
