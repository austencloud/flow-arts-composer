// Main-thread snapshot of the four override stores' loaded docs, in exactly
// the shape each store's *State.loadAll(docs) consumes. Structured-clone
// transferred into the composition worker, which hydrates the import-clean
// *State classes and registers resolvers — so worker placement resolution
// matches main pixel-for-pixel. NEVER import this module from the worker
// (it imports the firebase/auth-bound singletons).
import { getDefaultOverrideRepository } from "#lib/shared/pictograph/arrow/positioning/default-override/services/default-override-singleton.js";
import { getSpecialOverrideRepository } from "#lib/shared/pictograph/arrow/positioning/special-override/services/special-override-singleton.js";
import { getGlobalAdjustmentRepository } from "#lib/shared/pictograph/arrow/positioning/global/services/global-adjustment-singleton.js";
import { getPropGeometryRepository } from "#lib/shared/pictograph/arrow/positioning/prop-geometry/services/prop-geometry-singleton.js";
import {
  isArrowPlacementDataLoaded,
  onArrowPlacementDataLoaded,
  whenArrowPlacementDataReady,
} from "#lib/shared/pictograph/arrow/positioning/placement/services/initialize-arrow-placement-data.js";
import type { DefaultArrowPlacementDoc } from "#lib/shared/pictograph/arrow/positioning/default-override/domain/default-arrow-placement.js";
import type { SpecialArrowPlacement } from "#lib/shared/pictograph/arrow/positioning/special-override/domain/special-arrow-placement.js";
import type { GlobalArrowAdjustment } from "#lib/shared/pictograph/arrow/positioning/global/domain/global-arrow-adjustment.js";
import type { PropGeometryAdjustment } from "#lib/shared/pictograph/arrow/positioning/prop-geometry/domain/prop-geometry-adjustment.js";

export interface OverridePlacementBundle {
  default: DefaultArrowPlacementDoc[];
  special: SpecialArrowPlacement[];
  global: GlobalArrowAdjustment[];
  propGeometry: PropGeometryAdjustment[];
}

/**
 * The snapshot to seed a worker with. Waits for the placement stores' first
 * load: a snapshot taken earlier is empty, and the worker would draw every
 * later card with default arrow positions.
 */
export async function loadOverridePlacementBundle(): Promise<OverridePlacementBundle> {
  await whenArrowPlacementDataReady();
  lastSnapshotComplete = isArrowPlacementDataLoaded();
  return buildOverridePlacementBundle();
}

// Whether the latest awaited snapshot was taken with every store loaded. A
// caller installs it some time later (the pool seed also waits for its asset
// bundle), and the data can land in that gap.
let lastSnapshotComplete = true;

export function buildOverridePlacementBundle(): OverridePlacementBundle {
  return {
    default: getDefaultOverrideRepository()?.getAll() ?? [],
    special: getSpecialOverrideRepository()?.getAll() ?? [],
    global: getGlobalAdjustmentRepository()?.getAll() ?? [],
    propGeometry: getPropGeometryRepository()?.getAll() ?? [],
  };
}

let reseedPending = false;

/**
 * A snapshot taken after a miss (ceiling or failed load) holds empty stores.
 * Hand `apply` a complete snapshot, once, the moment the data loads, so a
 * worker pool seeded unloaded is re-seeded (callers pass the dispatcher's
 * existing `update-overrides` push). No-op when the data is already loaded or
 * a re-seed is already waiting.
 */
export function reseedWhenPlacementLoaded(
  apply: (bundle: OverridePlacementBundle) => void
): void {
  if (reseedPending) return;
  if (isArrowPlacementDataLoaded()) {
    // The data landed between the snapshot and its install: no listener will
    // fire for it any more, so push the complete set now.
    if (!lastSnapshotComplete) {
      lastSnapshotComplete = true;
      apply(buildOverridePlacementBundle());
    }
    return;
  }
  reseedPending = true;
  onArrowPlacementDataLoaded(() => {
    reseedPending = false;
    lastSnapshotComplete = true;
    apply(buildOverridePlacementBundle());
  });
}
