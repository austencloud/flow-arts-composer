/**
 * Clear Sequence Workflow Utility
 *
 * Orchestrates the complex workflow for clearing a sequence with smooth animations.
 * Extracted from CreateModule to reduce complexity and improve testability.
 *
 * Workflow:
 * 1. Push undo snapshot (Assemble's builder records its own entry in step 2)
 * 2. Clear ONLY the active tab's sequence data and UI state
 * 3. Close related panels
 *
 * IMPORTANT: This workflow is TAB-AWARE and only clears the currently active tab's state.
 * Each tab (Construct, Generate, Assembler) maintains independent state.
 *
 * Domain: Create module - Sequence management
 */

import { navigationState } from "#lib/shared/navigation/state/navigation-state.svelte.js";
import type {
  CreateModuleState,
  ConstructTabState,
} from "#lib/shared/create/state/create-module-state-types.js";
import type { createPanelCoordinationState as PanelCoordinationStateType } from "#lib/shared/create/state/panel-coordination-state.svelte.js";
import { UndoOperationType } from "#lib/shared/create/domain/undo-operation-types.js";

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

    // Capture a reference to the active tab's sequence state up front, so a
    // tab switch while persistence clears cannot redirect the clear.
    const activeTabSequenceState = CreateModuleState.sequenceState;
    const assembleBuilder =
      activeTab === "assemble"
        ? (CreateModuleState.assembleTabState?.assembleBuilderState ?? null)
        : null;

    // 1. Push undo snapshot. Assemble's builder owns its history: reset()
    // records one "Clear sequence" entry holding both hands and the document,
    // so a generic snapshot here would leave a second, dead entry behind.
    if (!assembleBuilder) {
      CreateModuleState.pushUndoSnapshot(UndoOperationType.CLEAR_SEQUENCE, {
        description: "Clear sequence",
      });
    }

    // Clear persistence first so auto-save cannot write during the clear.
    if (activeTabSequenceState) {
      await activeTabSequenceState.clearPersistedState();
    }

    // 2. Clear the active tab's data and reset UI. The workspace fade and the
    // tool panel's slide back to full width are driven by this state change
    // (PanelGroup and the workspace wrapper own them), so there is nothing to
    // wait for first; a fixed pause here was half a second of nothing moving.

    // Clear Construct tab state if we're in the Construct tab
    if (activeTab === "construct" && constructTabState) {
      constructTabState.setShowStartPlacementPicker(true);
      constructTabState.setSelectedStartPlacement(null);
      constructTabState.startPlacementStateService.clearSelectedPlacement();
      constructTabState.clearError();
    }

    // Assemble's reset() clears both hands and publishes the empty document
    // to its sequence state itself.
    assembleBuilder?.reset();

    // Clear the active tab's sequence state using the captured reference.
    // Only clear a sequence that is still there: on Assemble, setting null
    // again reads as a newly loaded document and wipes the builder's history,
    // including the clear that was just recorded.
    if (activeTabSequenceState) {
      if (activeTabSequenceState.currentSequence !== null) {
        activeTabSequenceState.setCurrentSequence(null);
      }
      activeTabSequenceState.clearSelection();
      activeTabSequenceState.clearError();
    }

    // 3. End the quick preview and close all sequence-related panels
    panelState.stopWorkspacePlayback();
    panelState.closeAllPanels();
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Failed to clear sequence";
    throw new Error(errorMessage);
  }
}
