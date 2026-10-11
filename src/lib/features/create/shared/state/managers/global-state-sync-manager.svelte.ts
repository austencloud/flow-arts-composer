/**
 * Global State Sync Manager
 *
 * Syncs local component state to global application state.
 * Handles: panel open state, layout state, animation beat number.
 *
 * IMPORTANT: When the sequence viewer is open, workspace animation sync
 * is SKIPPED to keep the viewer's animation state completely isolated.
 */

import {
  setAnyPanelOpen,
  setSideBySideLayout,
} from "#lib/shared/application/state/animation-visibility-state.svelte.js";
import { sharedAnimationState } from "#lib/shared/animation-engine/state/shared-animation-state.svelte.js";
import type { PanelCoordinationState } from "../panel-coordination-state.svelte";

export interface GlobalStateSyncConfig {
  panelState: PanelCoordinationState;
  getShouldUseSideBySideLayout: () => boolean;
  setAnimatingStepNumber: (beat: number | null) => void;
}

export function createGlobalStateSyncEffects(
  config: GlobalStateSyncConfig
): () => void {
  const { panelState, getShouldUseSideBySideLayout, setAnimatingStepNumber } =
    config;

  const cleanup = $effect.root(() => {
    // Sync panel and layout states to global state
    $effect(() => {
      setAnyPanelOpen(panelState.isAnyPanelOpen);
      setSideBySideLayout(getShouldUseSideBySideLayout());
    });

    // Sync animating beat number from shared animation state
    // Only show the word label glow effect while animation is actively playing
    // When stopped/paused, clear the highlight so it doesn't persist after closing the drawer
    //
    // CRITICAL: Skip sync when sequence viewer is open!
    // The viewer has its own isolated animation state and should NOT affect workspace UI.
    $effect(() => {
      // When the sequence viewer is open, never sync workspace animation
      if (panelState.isSequenceViewerOpen) {
        setAnimatingStepNumber(null);
        return;
      }

      if (sharedAnimationState.isPlaying) {
        const currentStep = sharedAnimationState.currentStep;
        setAnimatingStepNumber(Math.floor(currentStep));
      } else {
        setAnimatingStepNumber(null);
      }
    });
  });

  return cleanup;
}
