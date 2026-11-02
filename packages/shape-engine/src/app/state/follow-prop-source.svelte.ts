/**
 * Installs the effect that keeps a ShapeMatrixAppState's prop pair aligned
 * with a host-owned ShapeMatrixPropSource (the Create module's Shape tab
 * mirrors settings). Pulled out of ShapeMatrixApp.svelte so a test can call
 * the exact same effect body inside its own `$effect.root`, instead of
 * re-implementing it against a mock.
 */
import { untrack } from "svelte";
import type {
  ShapeMatrixAppState,
  ShapeMatrixPropSource,
} from "./shape-matrix-app-state.svelte";

export function followPropSource(
  state: ShapeMatrixAppState,
  propSource: ShapeMatrixPropSource | undefined
): void {
  // Settings to engine. The state ignores an unchanged pair, and an adopted
  // pair is never announced back, so a pick made here does not echo.
  $effect(() => {
    if (!propSource) return;
    const pair = { left: propSource.left, right: propSource.right };
    const catDog = propSource.catDog;
    // adoptPropPair reads the state's own leftPropType/rightPropType/data/
    // loading. Tracking those would re-run this effect the instant a pick's
    // own load commits, while the source (settings) has not been written yet
    // -- the effect would then "adopt" the stale settings pair, reverting the
    // pick and starting a second load, right before the pick's own write
    // lands. Untracked, this effect only reacts to the source itself.
    untrack(() => state.adoptPropPair(pair, catDog));
  });
}
