/**
 * Factory function for creating StartPlacementData
 *
 * Creates a start placement with proper type discriminator.
 * Start placements represent initial prop configurations before sequence begins.
 */
import type { StartPlacementData } from "$lib/shared/foundation/domain/models/start-placement-data";

export function createStartPlacementData(
  data: Partial<StartPlacementData> = {}
): StartPlacementData {
  return {
    // Type discriminator
    isStartPlacement: true as const,

    // PictographData properties
    id: data.id ?? crypto.randomUUID(),
    letter: data.letter ?? null,
    startPlacement: data.startPlacement ?? null,
    endPlacement: data.endPlacement ?? null,
    motions: data.motions ?? {},

    // StartPlacement-specific properties
    gridPlacement: data.gridPlacement ?? null,
  };
}
