/**
 * Persistence Controller
 *
 * Centralizes initialization and cross-tab workspace persistence logic for the
 * create module. The navigation controller delegates to this module whenever a
 * mode transition requires saving or loading workspace data.
 *
 * IMPORTANT: Uses getSequenceStateForTab to get tab-specific sequence states.
 * Each tab (construct, generator, assembler) has its own independent sequence state.
 */

import type { BuildModeId } from "#lib/shared/foundation/ui/ui-types.js";
import type { SequenceState } from "../sequence-state-orchestrator.svelte";
import type { SequencePersister } from "#lib/features/create/shared/services/sequence-persister.js";
import { navigationState } from "#lib/shared/navigation/state/navigation-state.svelte.js";
import type { OptionHistoryManager } from "./option-history-manager.svelte";

type ConstructTabState =
  | {
      setShowStartPlacementPicker: (show: boolean) => void;
      setSelectedStartPlacement: (value: unknown) => void;
    }
  | null
  | undefined;

type PersistenceControllerDeps = {
  sequenceState: SequenceState;
  SequencePersister?: SequencePersister;
  optionHistoryManager: OptionHistoryManager;
  /** Function to get the sequence state for a specific tab (or fallback to shared) */
  getSequenceStateForTab?: (tab: BuildModeId) => SequenceState;
};

export function createCreateModulePersistenceController({
  sequenceState,
  SequencePersister,
  optionHistoryManager,
  getSequenceStateForTab,
}: PersistenceControllerDeps) {
  let isPersistenceInitialized = $state(false);
  const initializedModes = new Set<BuildModeId>();

  /**
   * Get the sequence state for a specific tab.
   * Uses getSequenceStateForTab if provided, otherwise falls back to shared state.
   */
  function getSequenceStateFor(tab: BuildModeId): SequenceState {
    if (getSequenceStateForTab) {
      return getSequenceStateForTab(tab);
    }
    return sequenceState;
  }

  async function initialize(skipRestore = false): Promise<BuildModeId> {
    const modeToLoad =
      (navigationState.activeTab as BuildModeId) || "construct";

    try {
      if (SequencePersister) {
        await restoreWorkspaceForMode(modeToLoad, null, {
          bypassInitializationGuard: true,
          skipRestore,
        });
      }

      optionHistoryManager.rebuildFromSequence();
      // Note: Undo history loading is now handled by each tab's undo controller
    } catch (error) {
      console.error(
        "? CreateModuleState: Failed to initialize persistence:",
        error
      );
    } finally {
      isPersistenceInitialized = true;
    }

    return modeToLoad;
  }

  async function saveCurrentState(activeSection: BuildModeId): Promise<void> {
    if (!isPersistenceInitialized) {
      return;
    }

    try {
      // Get the correct sequence state for the tab being saved
      const tabSequenceState = getSequenceStateFor(activeSection);
      await tabSequenceState.saveCurrentState(activeSection);
    } catch (error) {
      console.error(
        "? CreateModuleState: Failed to save current state:",
        error
      );
    }
  }

  async function restoreWorkspaceForMode(
    panel: BuildModeId,
    constructTabState: ConstructTabState,
    options?: { bypassInitializationGuard?: boolean; skipRestore?: boolean }
  ): Promise<void> {
    if (!SequencePersister) {
      return;
    }

    if (!isPersistenceInitialized && !options?.bypassInitializationGuard) {
      return;
    }

    // Get the correct sequence state for the tab being restored
    const tabSequenceState = getSequenceStateFor(panel);
    tabSequenceState.updateCachedActiveTab(panel);

    if (!initializedModes.has(panel)) {
      if (!tabSequenceState.isInitialized) {
        await tabSequenceState.initializeWithPersistence(options?.skipRestore);
      }
      initializedModes.add(panel);
    }

    syncConstructTabState(
      constructTabState,
      tabSequenceState.hasStartPlacement,
      tabSequenceState.selectedStartPlacement
    );
  }

  function syncConstructTabState(
    constructTabState: ConstructTabState,
    hasStartPlacement: boolean,
    selectedStartPlacement: unknown
  ) {
    if (!constructTabState) {
      return;
    }

    if (hasStartPlacement && selectedStartPlacement) {
      constructTabState.setShowStartPlacementPicker(false);
      constructTabState.setSelectedStartPlacement(selectedStartPlacement);
    } else {
      constructTabState.setShowStartPlacementPicker(true);
      constructTabState.setSelectedStartPlacement(null);
    }
  }

  return {
    get isInitialized() {
      return isPersistenceInitialized;
    },
    initialize,
    saveCurrentState,
    restoreWorkspaceForMode,
  };
}

export type CreateModulePersistenceController = ReturnType<
  typeof createCreateModulePersistenceController
>;
