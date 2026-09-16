/**
 * Clear Sequence Workflow Utility
 *
 * Orchestrates the complex workflow for clearing a sequence with smooth animations.
 * Extracted from CreateModule to reduce complexity and improve testability.
 *
 * Workflow:
 * 1. Push undo snapshot
 * 2. Wait for fade/layout animations (300ms)
 * 3. Clear ONLY the active tab's sequence data and UI state
 * 4. Close related panels
 *
 * IMPORTANT: This workflow is TAB-AWARE and only clears the currently active tab's state.
 * Each tab (Construct, Generate, Assembler) maintains independent state.
 *
 * Domain: Create module - Sequence management
 */

import { navigationState } from "$lib/shared/navigation/state/navigation-state.svelte";
import type {
  CreateModuleState,
  ConstructTabState,
} from "$lib/shared/create/state/create-module-state-types";
import type { createPanelCoordinationState as PanelCoordinationStateType } from "$lib/shared/create/state/panel-coordination-state.svelte";
import { UndoOperationType } from "$lib/shared/create/domain/undo-operation-types";

type PanelCoordinationState = ReturnType<typeof PanelCoordinationStateType>;

export interface ClearSequenceConfig {
  CreateModuleState: CreateModuleState;
  constructTabState: ConstructTabState | null; // Made nullable since we might not need it for other tabs
  panelState: PanelCoordinationState;
}

/**
 * Executes the clear sequence workflow
 * @throws Error if the workflow fails
 */
export async function executeClearSequenceWorkflow(
  config: ClearSequenceConfig
): Promise<void> {
  const { CreateModuleState, constructTabState, panelState } = config;

  try {
    // Determine which tab is currently active
    const activeTab = navigationState.activeTab;

    // Capture a reference to the active tab's sequence state BEFORE the delay
    // This prevents race conditions if the user switches tabs during the 300ms animation delay
    const activeTabSequenceState = CreateModuleState.sequenceState;

    // 1. Push undo snapshot
    CreateModuleState.pushUndoSnapshot(UndoOperationType.CLEAR_SEQUENCE, {
      description: "Clear sequence",
    });

    // Clear persistence FIRST, before animations, to prevent auto-save during the animation delay
    if (activeTabSequenceState) {
      await activeTabSequenceState.clearPersistedState();
    }

    // 2. Wait for fade and layout transition to complete (300ms)
    // Everything fades together - steps, workspace, button panel, layout
    await new Promise((resolve) => setTimeout(resolve, 300));

    // 3. After animations complete, clear the active tab's data and reset UI
    // This happens after components have faded out to avoid visual popping

    // Clear Construct tab state if we're in the Construct tab
    if (activeTab === "construct" && constructTabState) {
      constructTabState.setShowStartPlacementPicker(true);
      constructTabState.setSelectedStartPlacement(null);
      constructTabState.startPlacementStateService.clearSelectedPlacement();
      constructTabState.clearError();
    }

    // Clear Assemble tab's visual builder state (must happen BEFORE clearing
    // sequence state, otherwise the builder's $effect will immediately re-sync
    // its steps back into the sequence)
    if (activeTab === "assemble") {
      const assembleBuilder =
        CreateModuleState.assembleTabState?.assembleBuilderState;
      if (assembleBuilder) {
        assembleBuilder.reset();
      }
    }

    // Clear the active tab's sequence state using the captured reference
    if (activeTabSequenceState) {
      activeTabSequenceState.setCurrentSequence(null);
      activeTabSequenceState.clearSelection();
      activeTabSequenceState.clearError();
    }

    // 4. End the quick preview and close all sequence-related panels
    panelState.stopWorkspacePlayback();
    panelState.closeAllPanels();
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Failed to clear sequence";
    throw new Error(errorMessage);
  }
}
