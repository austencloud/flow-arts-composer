/**
 * Panel Persistence Service Implementation
 *
 * Extracted from CreateModule.svelte to handle panel state persistence
 * across navigation changes.
 */

import { navigationState } from "#lib/shared/navigation/state/navigation-state.svelte.js";
import type { PanelCoordinationState } from "../state/panel-coordination-state.svelte";

export type PanelId =
  | "animation"
  | "stepEditor"
  | "videoRecord"
  | "filter"
  | "sequenceActions"
  | "cap"
  | "customize";

/**
 * Maps panel IDs to the tabs that support them.
 * Panels should only be restored for tabs that can actually use them.
 *
 * - Spell tab has its own self-contained UI and doesn't use shared panels
 * - Beat Editor only makes sense for tabs with beat sequences
 * - Filter is primarily for generator
 */
const PANEL_TAB_SUPPORT: Record<PanelId, Set<string>> = {
  animation: new Set(["construct", "assemble", "generate", "spell"]),
  videoRecord: new Set(["construct", "assemble", "generate", "spell"]),
  filter: new Set(["construct", "generate"]),
  sequenceActions: new Set(["construct", "assemble", "generate"]),
  cap: new Set(["construct", "assemble", "generate"]),
  customize: new Set(["construct", "generate"]),
  stepEditor: new Set(["construct", "assemble", "generate"]),
};

/**
 * Check if a panel is supported by a given tab.
 */
function isPanelSupportedForTab(panelId: PanelId, tab: string): boolean {
  const supportedTabs = PANEL_TAB_SUPPORT[panelId];
  return supportedTabs?.has(tab) ?? false;
}

export class PanelPersister {
  getCurrentOpenPanel(panelState: PanelCoordinationState): PanelId | null {
    if (panelState.isAnimationPanelOpen) return "animation";
    if (panelState.isVideoRecordPanelOpen) return "videoRecord";
    if (panelState.isFilterPanelOpen) return "filter";
    if (panelState.isSequenceActionsPanelOpen) return "sequenceActions";
    if (panelState.isLOOPPanelOpen) return "cap";
    if (panelState.isCustomizeOverlayOpen) return "customize";
    if (panelState.isStepEditorPanelOpen) return "stepEditor";
    return null;
  }

  closeAllPanels(panelState: PanelCoordinationState): void {
    panelState.closeAnimationPanel();
    panelState.closeVideoRecordPanel();
    panelState.closeFilterPanel();
    panelState.closeSequenceActionsPanel();
    panelState.closeLOOPPanel();
    panelState.closeCustomizeOverlay();
    panelState.closeStepEditorPanel();
  }

  restoreSavedPanel(
    panelState: PanelCoordinationState,
    panelId: PanelId
  ): void {
    switch (panelId) {
      case "animation":
        panelState.openAnimationPanel();
        break;
      case "videoRecord":
        panelState.openVideoRecordPanel();
        break;
      case "filter":
        panelState.openFilterPanel();
        break;
      case "sequenceActions":
        panelState.openSequenceActionsPanel("restore");
        break;
      // edit and cap panels require context (step data, LOOP type)
      // so we don't restore them - they need user interaction
    }
  }

  isPanelSupportedForTab(panelId: PanelId, tab: string): boolean {
    return isPanelSupportedForTab(panelId, tab);
  }

  startTracking(params: {
    panelState: PanelCoordinationState;
    canRestorePanels: () => boolean;
  }): () => void {
    const { panelState, canRestorePanels } = params;

    let previousModule: string | null = null;
    let previousTab: string | null = null;
    let previousPanelOpen: PanelId | null = null;
    let isTracking = true;

    // Create reactive tracking using $effect.root for service context
    const cleanup = $effect.root(() => {
      // Effect 1: Detect user-initiated panel closes
      $effect(() => {
        if (!isTracking) return;

        const currentModule = navigationState.currentModule;
        if (currentModule !== "create") return;

        const currentPanelOpen = this.getCurrentOpenPanel(panelState);

        // If a panel was open and is now closed (user closed it), clear saved state
        if (previousPanelOpen !== null && currentPanelOpen === null) {
          navigationState.clearPanelForTab();
        }

        previousPanelOpen = currentPanelOpen;
      });

      // Effect 2: Handle navigation changes (module/tab switches)
      $effect(() => {
        if (!isTracking) return;

        const currentModule = navigationState.currentModule;
        const currentTab = navigationState.activeTab;

        const moduleChanged =
          previousModule !== null && currentModule !== previousModule;
        const tabChanged =
          previousTab !== null &&
          currentTab !== previousTab &&
          currentModule === "create";

        if (moduleChanged || tabChanged) {
          // Save which panel was open before closing
          if (
            panelState.isAnyPanelOpen &&
            previousModule === "create" &&
            previousTab
          ) {
            const openPanelId = this.getCurrentOpenPanel(panelState);
            if (openPanelId) {
              navigationState.setLastPanelForTab(
                openPanelId,
                previousModule as "create",
                previousTab
              );
            }
          }

          // Close all panels when navigating away or switching tabs
          if (panelState.isAnyPanelOpen) {
            this.closeAllPanels(panelState);
          }

          // Restore panel for the new tab if conditions are met
          if (
            currentModule === "create" &&
            !panelState.isAnyPanelOpen &&
            canRestorePanels()
          ) {
            const savedPanel = navigationState.getLastPanelForTab(
              "create",
              currentTab
            );
            // Only restore if the panel is supported for this tab
            if (
              savedPanel &&
              isPanelSupportedForTab(savedPanel as PanelId, currentTab)
            ) {
              // Delay to allow close animation to complete
              setTimeout(() => {
                if (isTracking) {
                  this.restoreSavedPanel(panelState, savedPanel as PanelId);
                }
              }, 100);
            }
          }
        }

        previousModule = currentModule;
        previousTab = currentTab;
      });
    });

    // Return cleanup function
    return () => {
      isTracking = false;
      cleanup();
    };
  }
}

export const panelPersister = new PanelPersister();
