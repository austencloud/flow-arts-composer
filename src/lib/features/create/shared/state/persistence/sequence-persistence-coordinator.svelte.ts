/**
 * Sequence Persistence Coordinator
 *
 * Coordinates persistence operations for sequence state:
 * - Initializes persistence service
 * - Auto-saves state changes
 * - Manages persistence lifecycle
 *
 * RESPONSIBILITY: Persistence coordination, observes state changes
 */

import type { StartPlacementData } from "$lib/shared/foundation/domain/models/start-placement-data";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { SequencePersister } from "$lib/features/create/shared/services/sequence-persister";
import { captureEvent } from "$lib/shared/analytics/services/posthog";
import type { ActiveCreateModule } from "$lib/shared/foundation/ui/ui-types";

export interface PersistenceState {
  currentSequence: SequenceData | null;
  selectedStartPlacement: StartPlacementData | null;
  hasStartPlacement: boolean;
  activeBuildSection: ActiveCreateModule;
}

export interface SequencePersistenceStateData {
  isInitialized: boolean;
  autoSaveEnabled: boolean;
}

export function createSequencePersistenceCoordinator(
  persistenceService: SequencePersister | null,
  applyReversalDetection?: (sequence: SequenceData) => SequenceData,
  /**
   * IMPORTANT: Tab ID for persistence isolation.
   * If provided, this coordinator will ONLY load/save data for this specific tab,
   * ignoring navigationState.currentSection. This prevents cross-tab data pollution
   * where one tab's sequence appears in another tab's beat grid.
   */
  tabId?: ActiveCreateModule
) {
  const state = $state<SequencePersistenceStateData>({
    isInitialized: false,
    autoSaveEnabled: true,
  });

  // 🚀 PERFORMANCE: Cache the active tab to avoid unnecessary load operations
  // If tabId is provided, use it as the fixed tab; otherwise start with "construct"
  let cachedActiveTab: ActiveCreateModule = tabId ?? "construct";

  return {
    // Getters
    get isInitialized() {
      return state.isInitialized;
    },
    get autoSaveEnabled() {
      return state.autoSaveEnabled;
    },

    // Core operations
    async initialize(): Promise<PersistenceState | null> {
      if (!persistenceService || state.isInitialized) return null;

      try {
        await persistenceService.initialize();
        // IMPORTANT: Use tabId if provided to load only this tab's data
        // This prevents cross-tab data pollution where Generator's sequence
        // appears in Assembler's beat grid
        const savedState = await persistenceService.loadCurrentState(tabId);

        if (savedState?.currentSequence && applyReversalDetection) {
          savedState.currentSequence = applyReversalDetection(
            savedState.currentSequence
          );
        }

        // Cache the active tab for future saves
        // If tabId is set, always use it; otherwise use saved state's tab
        if (tabId) {
          cachedActiveTab = tabId;
        } else if (savedState?.activeBuildSection) {
          cachedActiveTab = savedState.activeBuildSection;
        }

        state.isInitialized = true;
        return savedState;
      } catch (error) {
        console.error(
          "❌ PersistenceCoordinator: Failed to initialize:",
          error
        );
        state.isInitialized = true; // Continue without persistence
        return null;
      }
    },

    async saveState(persistenceState: PersistenceState): Promise<void> {
      if (!persistenceService || !state.autoSaveEnabled) return;

      try {
        // Update cached active tab
        cachedActiveTab = persistenceState.activeBuildSection;
        await persistenceService.saveCurrentState(persistenceState);
      } catch (error) {
        console.error(
          "❌ PersistenceCoordinator: Failed to save state:",
          error
        );
      }
    },

    async saveSequenceOnly(
      currentSequence: SequenceData | null,
      selectedStartPlacement: StartPlacementData | null,
      hasStartPlacement: boolean
    ): Promise<void> {
      if (!persistenceService || !state.autoSaveEnabled) return;

      try {
        // 🚀 PERFORMANCE: Use cached active tab instead of loading from storage
        // This eliminates an expensive IndexedDB read operation on every beat addition
        await persistenceService.saveCurrentState({
          currentSequence,
          selectedStartPlacement,
          hasStartPlacement,
          activeBuildSection: cachedActiveTab,
        });

        // This is the 500ms-debounced autosave that runs on every beat edit,
        // NOT a deliberate user action - captured as its own event so it
        // never gets confused with (or inflates) the explicit "Save to
        // Library" milestone, which fires sequence_save separately from
        // save-panel-state.svelte.ts's handleSave().
        if (currentSequence) {
          try {
            captureEvent("sequence_autosaved", {
              sequence_id: currentSequence.id,
              word: currentSequence.word,
              beat_count: currentSequence.steps.length,
            });
          } catch {
            // Silently fail - activity logging is non-critical
          }
        }
      } catch (error) {
        console.error(
          "❌ PersistenceCoordinator: Failed to save sequence:",
          error
        );
      }
    },

    async clearState(): Promise<void> {
      if (!persistenceService || !state.autoSaveEnabled) return;

      try {
        await persistenceService.clearCurrentState();
      } catch (error) {
        console.error(
          "❌ PersistenceCoordinator: Failed to clear state:",
          error
        );
      }
    },

    updateCachedActiveTab(activeTab: ActiveCreateModule) {
      cachedActiveTab = activeTab;
    },

    setAutoSaveEnabled(enabled: boolean) {
      state.autoSaveEnabled = enabled;
    },

    reset() {
      state.isInitialized = false;
      state.autoSaveEnabled = true;
    },
  };
}

export type SequencePersistenceCoordinator = ReturnType<
  typeof createSequencePersistenceCoordinator
>;
