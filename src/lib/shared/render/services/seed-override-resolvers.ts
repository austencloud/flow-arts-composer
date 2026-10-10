// Worker-safe hydration of the override resolver seam from a transferred
// OverridePlacementBundle. Builds the four import-clean *State instances,
// loads the docs, and registers resolvers backed by those states. Imports
// only state factories + resolver setters — no repo, persister, firebase,
// or auth — so it is safe to import inside the composition worker.
import type { OverridePlacementBundle } from "./override-placement-bundle";
import { createDefaultArrowPlacementState } from "#lib/shared/pictograph/arrow/positioning/default-override/state/default-arrow-placement-state.svelte.js";
import { createSpecialArrowPlacementState } from "#lib/shared/pictograph/arrow/positioning/special-override/state/special-arrow-placement-state.svelte.js";
import { createGlobalArrowAdjustmentState } from "#lib/shared/pictograph/arrow/positioning/global/state/global-arrow-adjustment-state.svelte.js";
import { createPropGeometryAdjustmentState } from "#lib/shared/pictograph/arrow/positioning/prop-geometry/state/prop-geometry-adjustment-state.svelte.js";
import { setDefaultOverrideResolver } from "#lib/shared/pictograph/arrow/positioning/placement/services/arrow-placer.js";
import {
  setSpecialOverrideResolver,
  setGlobalAdjustmentResolver,
  setPropGeometryResolver,
} from "#lib/shared/pictograph/arrow/positioning/placement/services/override-resolvers.js";

export function seedOverrideResolvers(bundle: OverridePlacementBundle): void {
  const defaultState = createDefaultArrowPlacementState();
  defaultState.loadAll(bundle.default);
  setDefaultOverrideResolver((gridMode, motionType, placementKey, turns, propType) =>
    defaultState.getValue(gridMode, propType, motionType, placementKey, turns),
  );

  const specialState = createSpecialArrowPlacementState();
  specialState.loadAll(bundle.special);
  setSpecialOverrideResolver({
    getOverride: (key) => specialState.getOverride(key),
    getFullOverride: (key) => specialState.getFullOverride(key),
  });

  const globalState = createGlobalArrowAdjustmentState();
  globalState.loadAll(bundle.global);
  setGlobalAdjustmentResolver((baseKey, thisPropType, otherPropType, legacyOriKey) =>
    globalState.getAdjustmentCascading(baseKey, thisPropType, otherPropType, legacyOriKey),
  );

  const propGeometryState = createPropGeometryAdjustmentState();
  propGeometryState.loadAll(bundle.propGeometry);
  setPropGeometryResolver((key) => propGeometryState.getAdjustmentCascading(key));
}
