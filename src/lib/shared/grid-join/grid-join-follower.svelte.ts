/**
 * Lets a component that builds a right-click menu follow the join controller
 * it finds in context: a version number to read inside `$derived` so the menu
 * rebuilds with fresh checked states when the join changes anywhere.
 *
 * Call during component init; the subscription is dropped on destroy.
 */
import { onDestroy } from "svelte";
import {
  tryGetGridJoinContext,
  type GridJoinController,
} from "./grid-join-controller";

export interface GridJoinFollower {
  /** The surrounding controller, or null where the join cannot be changed. */
  readonly controller: GridJoinController | null;
  /** Changes whenever the join does; read it to depend on the join. */
  version(): number;
}

export function followGridJoin(): GridJoinFollower {
  const controller = tryGetGridJoinContext();
  let version = $state(0);
  const unsubscribe = controller?.subscribe(() => {
    version++;
  });
  onDestroy(() => unsubscribe?.());
  return { controller, version: () => version };
}
