import { registerLoopDetector } from "../create/get-loop-detector";
import { loopDetector } from "#lib/features/create/generate/circular/services/loop-detector.js";
import {
  registerLoopDisplayCacheClearer,
  registerLoopDisplayResolver,
} from "../loop-labeler/get-loop-display-resolver";
import {
  clearLoopDisplayCache,
  resolveLoopDisplay,
} from "#lib/features/loop-labeler/services/loop-display-resolver.js";

/**
 * Wire up everything a LOOP badge needs: the detector, the display resolver
 * and its cache clearer. The app's composition root calls this at boot, and
 * the public landing hero calls it before its player mounts, because the
 * landing never loads the full composition root and the badge would otherwise
 * never appear. Calling it again just reassigns the same functions, so both
 * callers can run it without coordinating.
 */
export function registerLoopDisplay(): void {
  registerLoopDetector(loopDetector);
  registerLoopDisplayResolver(resolveLoopDisplay);
  registerLoopDisplayCacheClearer(clearLoopDisplayCache);
}
