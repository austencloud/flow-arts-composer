/**
 * The sixteen start placement pictographs, loaded and oriented the one way
 * every surface that draws them must agree on.
 *
 * MultiSelectPlacementPicker draws them as toggles; the Customize overview
 * draws them as a preview of what the picker holds. Both call these two
 * functions so the preview can never show a different set, order or prop
 * orientation from the screen it opens.
 */

import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
import type { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import type { Orientation } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import { startPlacementManager } from "#lib/shared/create/services/start-placement-manager.js";
import { createStartPlacementVariations } from "./start-placement-utils";

/**
 * Every start placement variation for a grid mode, in picker order. Falls
 * back to the static table when the manager cannot serve them.
 */
export function loadStartPlacementVariations(mode: GridMode): PictographData[] {
  try {
    return startPlacementManager.getAllStartPlacementVariations(mode);
  } catch (error) {
    console.warn(
      "placement-variations: manager failed, using static variations:",
      error
    );
    return createStartPlacementVariations(mode);
  }
}

/**
 * Re-orient each variation's props to the chosen start orientations. Start
 * placements are static holds, so start == end orientation (mirrors how the
 * engine seeds beat 0). Returns new objects so PictographContainer re-renders
 * when an orientation changes.
 */
export function orientStartPlacementVariations(
  variations: readonly PictographData[],
  leftStartOrientation: Orientation,
  rightStartOrientation: Orientation
): PictographData[] {
  return variations.map((p) => ({
    ...p,
    motions: {
      ...p.motions,
      left: p.motions?.left
        ? {
            ...p.motions.left,
            startOrientation: leftStartOrientation,
            endOrientation: leftStartOrientation,
          }
        : p.motions?.left,
      right: p.motions?.right
        ? {
            ...p.motions.right,
            startOrientation: rightStartOrientation,
            endOrientation: rightStartOrientation,
          }
        : p.motions?.right,
    },
  }));
}
