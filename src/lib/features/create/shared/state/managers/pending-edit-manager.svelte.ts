/**
 * Pending Edit Manager
 *
 * Handles pending edits from Browse gallery.
 * When user clicks "Edit" on a sequence in Browse, it's stored
 * and processed when Create module mounts.
 */

import { navigationState } from "$lib/shared/navigation/state/navigation-state.svelte";
import { getSequenceOverlayState } from "$lib/shared/sequence-viewer/state/sequence-viewer-overlay-state.svelte";
import type { DeepLinkSequenceHandler } from "../../services/deep-link-sequence-handler";
import type { CreateModuleState } from "../create-module-state.svelte";
import type { ConstructTabState } from "../construct-tab-state.svelte";

export interface PendingEditConfig {
  getDeepLinker: () => DeepLinkSequenceHandler | null;
  getCreateModuleState: () => CreateModuleState | null;
  getConstructTabState: () => ConstructTabState | null;
  isServicesInitialized: () => boolean;
}

export function createPendingEditEffect(config: PendingEditConfig): () => void {
  const {
    getDeepLinker,
    getCreateModuleState,
    getConstructTabState,
    isServicesInitialized,
  } = config;

  const viewer = getSequenceOverlayState();

  const cleanup = $effect.root(() => {
    $effect(() => {
      const currentModule = navigationState.currentModule;
      if (currentModule !== "create") return;

      // Create stays mounted behind the viewer. Closing it must check for a
      // new remix even when the module and active tab have not changed.
      if (viewer.isOpen) return;

      const deepLinkService = getDeepLinker();
      const createModuleState = getCreateModuleState();
      const constructTabState = getConstructTabState();

      if (
        !deepLinkService ||
        !createModuleState ||
        !constructTabState ||
        !isServicesInitialized()
      ) {
        return;
      }

      const hasPending = deepLinkService.hasPendingEdit();
      if (!hasPending) return;

      void deepLinkService.loadFromPendingEdit((sequence) => {
        const constructorSequenceState = constructTabState?.sequenceState;
        if (constructorSequenceState) {
          constructorSequenceState.setCurrentSequence(sequence);
          constructTabState?.syncPickerStateWithSequence();
        } else {
          createModuleState.sequenceState.setCurrentSequence(sequence);
        }

        if (constructTabState?.setShowStartPositionPicker) {
          constructTabState.setShowStartPositionPicker(false);
        }
      });
    });
  });

  return cleanup;
}
