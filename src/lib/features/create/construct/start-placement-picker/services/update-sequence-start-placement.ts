import { recalculateSequenceMotionFrom } from "$lib/features/create/shared/services/recalculate-sequence-motion";
import { withLoopCertificateCleared } from "$lib/shared/create/services/loop-certificate";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { StartPlacementData } from "$lib/shared/foundation/domain/models/start-placement-data";
import type {
  GridMode,
  GridPlacement,
} from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { getGridPlacementFromLocations } from "$lib/shared/pictograph/grid/services/grid-placement-deriver";
import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";

export type StartPlacementUpdateResult =
  | { ok: true; sequence: SequenceData }
  | { ok: false; reason: "grid-mismatch" | "broken-transition" };

function deriveBoundaryPlacement(
  pictograph: PictographData,
  boundary: "start" | "end"
): GridPlacement | null {
  const left = pictograph.motions.left;
  const right = pictograph.motions.right;
  if (!left || !right) return null;

  try {
    return getGridPlacementFromLocations(
      boundary === "start" ? left.startLocation : left.endLocation,
      boundary === "start" ? right.startLocation : right.endLocation
    );
  } catch {
    return null;
  }
}

/**
 * Change a sequence start only when the existing first beat remains reachable.
 * Orientation changes are propagated through every downstream beat.
 */
export function updateSequenceStartPlacement(
  sequence: SequenceData,
  startPlacement: StartPlacementData,
  gridMode: GridMode
): StartPlacementUpdateResult {
  const firstStep = sequence.steps[0];
  const changesGrid =
    sequence.steps.length > 0 &&
    sequence.gridMode !== undefined &&
    sequence.gridMode !== gridMode;

  if (changesGrid) {
    return { ok: false, reason: "grid-mismatch" };
  }

  if (firstStep) {
    const poseEnd = deriveBoundaryPlacement(startPlacement, "end");
    const firstStart = deriveBoundaryPlacement(firstStep, "start");
    if (!poseEnd || !firstStart || poseEnd !== firstStart) {
      return { ok: false, reason: "broken-transition" };
    }
  }

  const updated = withLoopCertificateCleared({
    ...sequence,
    startPlacement,
    startingPlacement: startPlacement,
  });

  return {
    ok: true,
    sequence: recalculateSequenceMotionFrom(updated, 0),
  };
}
