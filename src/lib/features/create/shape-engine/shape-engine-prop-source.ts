/**
 * The Shape tab's prop source: the app's settings pair. Reads are live
 * (getSettings returns the reactive settings object) so the engine's
 * adoption effect follows the Construct prop sheet and the settings drawer;
 * writes go through updateSettings so a pick in Shape is a pick everywhere.
 */
import type { ShapeMatrixPropSource } from "$lib/shared/shape-matrix/app/state/shape-matrix-app-state.svelte";
import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import { propPairFromLegacy } from "$lib/shared/shape-matrix/domain/prop-pair";

/** AppSettings keeps these optional; older saves carry only `propType`. */
interface ShapeEnginePropSettings {
  propType?: PropType;
  leftPropType?: PropType;
  rightPropType?: PropType;
  catDogMode?: boolean;
}

export function createShapeEnginePropSource(dependencies: {
  getSettings: () => ShapeEnginePropSettings;
  updateSettings: (settings: Partial<ShapeEnginePropSettings>) => unknown;
}): ShapeMatrixPropSource {
  return {
    get left() {
      return propPairFromLegacy(dependencies.getSettings()).left;
    },
    get right() {
      return propPairFromLegacy(dependencies.getSettings()).right;
    },
    get catDog() {
      return dependencies.getSettings().catDogMode ?? false;
    },
    set(pair) {
      void dependencies.updateSettings({
        leftPropType: pair.left,
        rightPropType: pair.right,
        catDogMode: pair.catDog,
      });
    },
  };
}
