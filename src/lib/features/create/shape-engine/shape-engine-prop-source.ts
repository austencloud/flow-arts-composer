/**
 * The Shape tab's prop source: the app's settings pair. Reads are live
 * (getSettings returns the reactive settings object) so the engine's
 * adoption effect follows the Construct prop sheet and the settings drawer;
 * writes go through updateSettings so a pick in Shape is a pick everywhere.
 */
import type { ShapeMatrixPropSource } from "#lib/shared/shape-matrix/app/state/shape-matrix-app-state.svelte.js";
import type { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import type { PropLook } from "#lib/shared/pictograph/prop/domain/prop-look.js";
import { propPairFromLegacy } from "#lib/shared/shape-matrix/domain/prop-pair.js";

/** AppSettings keeps these optional; older saves carry only `propType`. */
interface ShapeEnginePropSettings {
  propType?: PropType;
  leftPropType?: PropType;
  rightPropType?: PropType;
  catDogMode?: boolean;
  propArtwork?: PropLook;
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
      // A pick that names a version writes it with the pair. The pair write
      // lands after the engine's load, and a pair write that names no version
      // resets Version 2 to Version 1 (see withPickVersion).
      void dependencies.updateSettings({
        leftPropType: pair.left,
        rightPropType: pair.right,
        catDogMode: pair.catDog,
        ...(pair.look === undefined ? {} : { propArtwork: pair.look }),
      });
    },
  };
}
