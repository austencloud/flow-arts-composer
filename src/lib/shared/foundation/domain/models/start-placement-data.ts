/**
 * Start Placement Domain Model
 *
 * Represents the initial prop configuration before a sequence begins.
 *
 * Start placements are NOT steps - they don't have:
 * - Duration (user holds placement indefinitely until starting sequence)
 * - Beat numbers (not part of the sequence progression)
 * - Reversals (no motion means no reversal)
 * - Motion/arrows (props are stationary)
 *
 * Start placements only show WHERE and HOW props are held initially.
 */
import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
import type { GridPlacement } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";

export interface StartPlacementData extends PictographData {
  // Type discriminator for TypeScript type guards
  readonly isStartPlacement: true;

  // Unique identifier
  readonly id: string;

  // Grid placement where sequence starts (e.g., "gamma13")
  // This represents the location in the grid system, not a beat position
  readonly gridPlacement?: GridPlacement | null;
}
