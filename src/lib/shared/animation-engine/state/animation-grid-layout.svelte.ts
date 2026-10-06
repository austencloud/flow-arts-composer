/**
 * The 2D animation's grid layout (its Conjoined switch) as reactive state, for
 * cards and pictures that join their grids while the animation does. The
 * visibility manager is a plain class, so its observer feeds the value.
 *
 * Call during component init: the observer is removed on destroy.
 */
import { onDestroy } from "svelte";
import {
  getAnimationVisibilityManager,
  type GridLayout,
} from "./animation-visibility-state.svelte";

export function followAnimationGridLayout(): () => GridLayout {
  const manager = getAnimationVisibilityManager();
  let layout = $state(manager.getGridLayout());
  const sync = () => {
    layout = manager.getGridLayout();
  };
  manager.registerObserver(sync);
  onDestroy(() => manager.unregisterObserver(sync));
  return () => layout;
}
