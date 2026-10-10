/**
 * Factory function to create a NEW AnimationPlaybackController instance.
 * Use this when you need multiple independent controllers (e.g., tunnel mode with multiple sequences).
 * Each call returns a fresh controller with its own orchestrator and loop.
 */
import { AnimationStateManager } from "./services/animation-state-manager";
import { SequenceAnimationOrchestrator } from "#lib/shared/animation-engine/services/sequence-animation-orchestrator.js";
import { getViewerAnimationPropConfig } from "#lib/shared/animation-engine/get-viewer-animation-prop-config.js";
import { AnimationLoop } from "./services/animation-loop";
import { AnimationPlaybackController } from "#lib/shared/animation-engine/services/animation-playback-controller.js";
import type { AnimationVisibilityStateManager } from "./state/animation-visibility-state.svelte";

/**
 * @param visibilityManager The manager whose motion policy (path shape, By
 * Motion, effort) positions these props. A canvas that runs on a scoped
 * manager MUST pass it: without it the orchestrator silently interpolates
 * against the global singleton, so the canvas draws the shape the user picked
 * while the props keep travelling on the old one.
 */
export function createPlaybackControllerFactory(
  visibilityManager?: AnimationVisibilityStateManager
): AnimationPlaybackController {
  const stateManager = new AnimationStateManager();

  const orchestrator = new SequenceAnimationOrchestrator(
    stateManager,
    getViewerAnimationPropConfig
  );
  if (visibilityManager) {
    orchestrator.setVisibilityManager(visibilityManager);
  }
  const loop = new AnimationLoop();

  return new AnimationPlaybackController(orchestrator, loop);
}
