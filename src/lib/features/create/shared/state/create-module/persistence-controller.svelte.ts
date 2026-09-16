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

import type { BuildModeId } from "$lib/shared/foundation/ui/ui-types";
import type { SequenceState } from "../sequence-state-orchestrator.svelte";
import type { SequencePersister } from "$lib/features/create/shared/services/sequence-persister";
import { deepLinker } from "$lib/shared/navigation/services/deep-linker";
import type { OptionHistoryManager } from "./option-history-manager.svelte";

import { getDeepLinkSequenceHandler } from "$lib/features/create/shared/get-deep-link-sequence-handler";

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

  async function initialize(): Promise<BuildModeId> {
    let modeToLoad: BuildModeId = "construct";

    try {
      if (SequencePersister) {
        const lastActiveState = await SequencePersister.loadCurrentState();
        if (lastActiveState?.activeBuildSection) {
          modeToLoad = lastActiveState.activeBuildSection;
        }
      }

      await sequenceState.initializeWithPersistence();

      if (SequencePersister) {
        await restoreWorkspaceForMode(modeToLoad, null, {
          bypassInitializationGuard: true,
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
    options?: { bypassInitializationGuard?: boolean }
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

    // Check if there's a pending deep link OR pending edit - if so, skip restoring saved state
    // This prevents overwriting deep link/pending edit sequences with empty/old persisted state
    let hasDeepLink = false;
    let hasPendingEdit = false;
    let pendingEditWasProcessed = false;
    try {
      hasDeepLink = deepLinker.hasDataForModule("create") ?? false;

      // Also check for pending edit from Browse gallery (stored in localStorage)
      hasPendingEdit =
        localStorage.getItem("tka-pending-edit-sequence") !== null;

      // CRITICAL: Also check session flag - pending edit may have already been processed
      // (and localStorage cleared) by the $effect before this function runs
      const DeepLinkSequenceHandler = getDeepLinkSequenceHandler();
      pendingEditWasProcessed =
        DeepLinkSequenceHandler.wasPendingEditProcessedThisSession();
    } catch {
      // Service not available - assume no deep link
      void 0; // Suppress unused catch binding warning
    }

    if (hasDeepLink || hasPendingEdit || pendingEditWasProcessed) {
      return;
    }

    try {
      const savedState = await SequencePersister.loadCurrentState(panel);

      if (savedState) {
        // Load saved state for this tab's specific sequence state
        tabSequenceState.setCurrentSequence(savedState.currentSequence);
        tabSequenceState.setSelectedStartPlacement(
          savedState.selectedStartPlacement ?? null
        );

        syncConstructTabState(
          constructTabState,
          savedState.hasStartPlacement,
          savedState.selectedStartPlacement
        );
      } else {
        // FIX: No saved state exists - preserve in-memory sequence!
        // Previously, this would unconditionally clear in-memory sequences on every tab switch
        // if no localStorage data existed. This caused the workspace collapse bug where
        // Constructor's in-memory sequence was cleared when switching back from other tabs.
        // Now we only preserve existing in-memory data instead of clearing it.

        // Don't touch the sequence state - it may already have valid in-memory data
        // Only sync construct tab state to show the start placement picker if needed
        if (constructTabState && !tabSequenceState.currentSequence) {
          syncConstructTabState(constructTabState, false, null);
        }
      }
    } catch (error) {
      console.error(`? Failed to load ${panel} state:`, error);
    }
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
