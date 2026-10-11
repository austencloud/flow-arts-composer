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

export function buildOverridePlacementBundle(): OverridePlacementBundle {
  return {
    default: getDefaultOverrideRepository()?.getAll() ?? [],
    special: getSpecialOverrideRepository()?.getAll() ?? [],
    global: getGlobalAdjustmentRepository()?.getAll() ?? [],
    propGeometry: getPropGeometryRepository()?.getAll() ?? [],
  };
}
