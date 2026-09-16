/**
 * Start Placement Selector Implementation
 *
 * Selects start placements for sequence generation.
 * Can select a specific placement or random from available placements.
 * Extracted from SequenceGenerationService for single responsibility.
 *
 * MIGRATION NOTE: Now returns StartPlacementData instead of StepData with stepNumber===0
 */
import { calculateAllArrowPoints } from "$lib/shared/pictograph/arrow/orchestration/services/arrow-positioning-orchestrator";
import type {
  GridMode,
  GridPlacement,
} from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import type { ILetterQueryHandler } from "$lib/shared/foundation/services/data/data-contracts";
import type { StartPlacementData } from "$lib/shared/foundation/domain/models/start-placement-data";
import type { stepConverter as StepConverterType } from "$lib/features/create/generate/shared/services/step-converter";
import type { pictographFilter as PictographFilterType } from "./pictograph-filter";

// Local aliases so the constructor param annotations are readable
type StepConverter = typeof StepConverterType;
type PictographFilter = typeof PictographFilterType;
export class StartPlacementSelector {
  constructor(
    private letterQueryHandler: ILetterQueryHandler,
    private PictographFilter: PictographFilter,
    private StepConverter: StepConverter
  ) {}

  /**
   * Select a start placement
   * @param gridMode - Grid mode (diamond/box)
   * @param specificPlacement - Optional specific placement to use (random if not provided)
   * @returns StartPlacementData with proper type discriminator
   */
  async selectStartPlacement(
    gridMode: GridMode,
    specificPlacement?: GridPlacement
  ): Promise<StartPlacementData> {
    const allOptions =
      await this.letterQueryHandler.getAllPictographVariations(gridMode);
    const startPlacements =
      this.PictographFilter.filterStartPlacements(allOptions);

    // If a specific placement is requested, find it; otherwise select random
    let startPictograph;
    if (specificPlacement) {
      startPictograph = startPlacements.find(
        (p) => p.startPlacement === specificPlacement
      );
      // Fallback to random if specific placement not found
      if (!startPictograph) {
        console.warn(
          `Start placement ${specificPlacement} not found, falling back to random`
        );
        startPictograph = this.PictographFilter.selectRandom(startPlacements);
      }
    } else {
      startPictograph = this.PictographFilter.selectRandom(startPlacements);
    }

    // Use the new convertToStartPlacement method instead of convertToStep(pictograph, 0, gridMode)
    let startPlacement = this.StepConverter.convertToStartPlacement(
      startPictograph,
      gridMode
    );

    // 🎯 CRITICAL FIX: Calculate arrow placements for start placement
    // This ensures start placement arrows have correct positions instead of default (0, 0)
    const updatedPictographData =
      await calculateAllArrowPoints(startPlacement);
    startPlacement = { ...startPlacement, ...updatedPictographData };

    return startPlacement;
  }
}

// ============================================================================
// DIRECT SINGLETON EXPORT
// ============================================================================
import { letterQueryHandler } from "$lib/shared/pictograph/tka-glyph/services/letter-query-handler";
import { pictographFilter } from "./pictograph-filter";
import { stepConverter } from "./step-converter";

export const startPlacementSelector = new StartPlacementSelector(
  letterQueryHandler,
  pictographFilter,
  stepConverter
);
