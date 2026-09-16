/**
 * Option Loader Service Implementation
 *
 * Handles loading of available pictograph options based on sequence context.
 * Extracted from OptionPickerService for better separation of concerns.
 */

import type { IMotionQueryHandler } from "$lib/shared/foundation/services/data/data-contracts";
import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
import type { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import type { PlacementAnalyzer } from "./placement-analyzer";
import { getGridPlacementFromLocations } from "$lib/shared/pictograph/grid/services/grid-placement-deriver";

export class OptionLoader {
  constructor(
    private motionQueryHandler: IMotionQueryHandler,
    private placementAnalyzer: PlacementAnalyzer
  ) {}

  /**
   * Load available options based on current sequence and grid mode
   * PRESERVED: Core working logic from OptionPickerDataService
   */
  async loadOptions(
    sequence: PictographData[],
    gridMode: GridMode
  ): Promise<PictographData[]> {
    if (sequence.length === 0) {
      return [];
    }

    const lastStep = sequence[sequence.length - 1]!;
    const endPlacement = this.placementAnalyzer.getEndPlacement(lastStep);

    if (!endPlacement || typeof endPlacement !== "string") {
      return [];
    }

    // Errors propagate to the caller — option-picker-state catches them and
    // routes to its error state so the user sees a retryable error instead of
    // a silently empty picker.
    const allOptions =
      await this.motionQueryHandler.getNextOptionsForSequence(
        sequence,
        gridMode
      );

    // Filter options based on sequence context
    // The next beat's start placement should match the current beat's end placement
    const filteredOptions = allOptions.filter((option) => {
      if (!option.motions.left || !option.motions.right) {
        return false;
      }

      // Calculate the start placement of this option
      const optionStartPlacement =
        getGridPlacementFromLocations(
          option.motions.left.startLocation,
          option.motions.right.startLocation
        );

      const optionStartPlacementStr = optionStartPlacement
        .toString()
        .toLowerCase();
      const targetEndPlacement = endPlacement.toLowerCase();

      return optionStartPlacementStr === targetEndPlacement;
    });

    return filteredOptions;
  }
}

import { motionQueryHandler } from "$lib/shared/pictograph/shared/services/motion-query-handler";
import { placementAnalyzer } from "./placement-analyzer";

export const optionLoader = new OptionLoader(
  motionQueryHandler,
  placementAnalyzer
);
