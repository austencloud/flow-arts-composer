import {
  registerLoopDisplayCacheClearer,
  registerLoopDisplayResolver,
} from "../loop-labeler/get-loop-display-resolver";
import {
  clearLoopDisplayCache,
  resolveLoopDisplay,
} from "$lib/features/loop-labeler/services/loop-display-resolver";

/**
 * Wire the canonical LOOP display service into an isolated composition worker.
 * Workers do not execute the browser composition-root entry point.
 */
export function registerWorkerLoopDisplayResolver(): void {
  registerLoopDisplayResolver(resolveLoopDisplay);
  registerLoopDisplayCacheClearer(clearLoopDisplayCache);
}
