/**
 * Construct Tab State - Sub-tab State
 *
 * Manages state specific to the Construct sub-tab functionality.
 * Handles start placement selection, option picking, and construct-specific UI state.
 *
 * ✅ All construct-specific runes ($state, $derived, $effect) live here
 * ✅ Pure reactive wrappers - no business logic
 * ✅ Services injected via parameters
 * ✅ Component-scoped state (not global singleton)
 */

import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";

import { createSimplifiedStartPlacementState } from "$lib/shared/create/state/start-placement-state.svelte";
import { createComponentLogger } from "$lib/shared/utils/debug-logger";
import type { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";

const debug = createComponentLogger("ConstructTabState");
import { createStartPlacementData } from "$lib/shared/create/factories/create-start-placement-data";
import type { CreateModuleOrchestrator } from "$lib/features/create/shared/services/create-module-orchestrator";
import type { SequencePersister } from "$lib/features/create/shared/services/sequence-persister";
import type { SequenceRepository } from "$lib/shared/create/services/sequence-repository";
import type { SequenceStatsCalculator } from "$lib/features/create/shared/services/sequence-stats-calculator";
import type { SequenceTransformer } from "$lib/features/create/shared/services/sequence-transforms/sequence-transformer";
import type { SequenceValidator } from "$lib/features/create/shared/services/sequence-validator";
import {
  reversalDetector,
  type ReversalDetector,
} from "$lib/shared/create/services/reversal-detector";
import { createSequenceState } from "./sequence-state-orchestrator.svelte";
import type { SequenceState } from "./sequence-state-orchestrator.svelte";
import type { UndoMetadata } from "../services/undo-manager";
import { UndoOperationType } from "../services/undo-manager";
import type { BuildModeId } from "$lib/shared/foundation/ui/ui-types";
import type { IFilterPersister } from "../../construct/option-picker/services/filter-persister";
import { ensureGuestIdentity } from "$lib/shared/auth/services/guest-identity";
import { invalidateLoopDisplayCache } from "$lib/shared/create/services/loop-certificate";
import { updateSequenceStartPlacement } from "../../construct/start-placement-picker/services/update-sequence-start-placement";
import { createOptionInteractionHintState } from "../../construct/option-picker/state/option-interaction-hint-state.svelte";
import {
  hasSeenOptionInteractionHint,
  markOptionInteractionHintSeen,
} from "../../construct/option-picker/services/option-interaction-hint-marker";

/**
 * Minimal interface for createModuleState dependency
 * Only includes what createConstructTabState actually needs to avoid circular references
 */
interface CreateModuleStateMinimal {
  readonly activeSection: BuildModeId | null;
}
import { createUndoController } from "./create-module/undo-controller.svelte";
import { undoManager } from "../services/undo-manager";

import { getFilterPersister } from "$lib/features/create/construct/option-picker/get-filter-persister";

/**
 * Creates construct tab state for construct-specific concerns
 *
 * @param CreateModuleOrchestrator - Injected create module service for business logic
 * @param sequenceService - Sequence service for creating Construct tab's own sequence state
 * @param SequencePersister - Persistence service for state survival
 * @param sequenceStatisticsService - Optional statistics service for sequence analysis
 * @param SequenceTransformer - Optional transformation service for sequence operations
 * @param sequenceValidationService - Optional validation service for sequence validation
 * @param createModuleState - Create module state for accessing navigation (minimal interface to avoid circular refs)
 * @returns Reactive state object with getters and state mutations
 */
export function createConstructTabState(
  CreateModuleOrchestrator: CreateModuleOrchestrator,
  sequenceService?: SequenceRepository,
  SequencePersister?: SequencePersister,
  sequenceStatisticsService?: SequenceStatsCalculator,
  SequenceTransformer?: SequenceTransformer,
  sequenceValidationService?: SequenceValidator,
  createModuleState?: CreateModuleStateMinimal | null
) {

  // Create HMR backup for critical state - temporarily disabled to debug effect_orphan error
  const hmrBackup = {
    initialValue: {
      showStartPlacementPicker: null as boolean | null,
      selectedStartPlacement: null as PictographData | null,
      isInitialized: false,
    },
  };

  // REACTIVE STATE (Construct-specific)

  let isLoading = $state(false);
  let error = $state<string | null>(null);
  let isTransitioning = $state(false);
  let showStartPlacementPicker = $state<boolean | null>(
    hmrBackup.initialValue.showStartPlacementPicker
  );
  let selectedStartPlacement = $state<PictographData | null>(
    hmrBackup.initialValue.selectedStartPlacement
  );
  let isInitialized = $state(hmrBackup.initialValue.isInitialized);
  // Filter persistence service - resolved lazily to avoid circular dependency issues
  let filterPersister: IFilterPersister | null = null;

  // Load persisted continuous filter on initialization
  function loadPersistedContinuousFilter(): boolean {
    try {
      if (!filterPersister) {
        filterPersister = getFilterPersister();
      }
      return filterPersister.loadContinuousOnly();
    } catch (e) {
      console.warn(
        "⚠️ ConstructTabState: Failed to load continuous filter:",
        e
      );
      return false;
    }
  }

  let isContinuousOnly = $state(loadPersistedContinuousFilter()); // Filter state for option viewer (persisted)

  // Construct tab has its own independent sequence state
  // IMPORTANT: Pass tabId="construct" to ensure persistence loads/saves only construct's data
  const ReversalDetector: ReversalDetector | undefined = reversalDetector;
  const sequenceState: SequenceState | null = sequenceService
    ? createSequenceState({
        sequenceService,
        ...(SequencePersister && { SequencePersister }),
        ...(sequenceStatisticsService && { sequenceStatisticsService }),
        ...(SequenceTransformer && { SequenceTransformer }),
        ...(sequenceValidationService && { sequenceValidationService }),
        ...(ReversalDetector && { ReversalDetector }),
        tabId: "construct", // Persistence isolation - only load/save construct's data
      })
    : null;

  // Construct tab has its own independent undo controller
  const undoController = sequenceState
    ? createUndoController({
        UndoManager: undoManager,
        sequenceState,
        getActiveSection: () => createModuleState?.activeSection || "construct",
        setActiveSectionInternal: async (_panel, _addToHistory) => {
          // Construct tab doesn't need to change active section since it's always construct
          // This is just for compatibility with the undo controller interface
        },
      })
    : null;

  // Sub-states (construct-specific)
  // Start placement state service using proper simplified state
  const startPlacementStateService = createSimplifiedStartPlacementState();
  const optionInteractionHintState = createOptionInteractionHintState({
    hasSeen: hasSeenOptionInteractionHint,
    markSeen: markOptionInteractionHintSeen,
  });
  let unsubscribeStartPlacementListener: (() => void) | null = null;

  // Creation failed, so there is no sequence to add steps to. Send the user back
  // to the start placement picker instead of stranding them on an option picker
  // whose taps can only fail.
  function failStartPlacementSelection() {
    setError("Could not start that sequence. Pick a start placement again.");
    setSelectedStartPlacement(null);
    sequenceState?.setSelectedStartPlacement(null);
    startPlacementStateService.clearSelectedPlacement();
    setShowStartPlacementPicker(true);
  }

  // Event handler function for start placement selection (reactive listener compatible)
  function handleStartPlacementSelected(
    pictographData: PictographData | null,
    source: "user" | "sync" = "user"
  ) {
    if (!pictographData) {
      setSelectedStartPlacement(null);
      if (sequenceState) {
        sequenceState.setSelectedStartPlacement(null);
      }
      if (source === "user") {
        setShowStartPlacementPicker(true);
      }
      return;
    }

    const currentSequence = sequenceState?.currentSequence ?? null;
    const currentStart =
      currentSequence?.startingPlacement ?? currentSequence?.startPlacement;
    const startPlacementData = createStartPlacementData({
      ...pictographData,
      id: currentStart?.id ?? `start-${Date.now()}`,
    });

    if (source !== "user" || !sequenceState) {
      setShowStartPlacementPicker(false);
      setSelectedStartPlacement(startPlacementData);
      sequenceState?.setSelectedStartPlacement(startPlacementData);
      return;
    }

    // Provision a guest identity the moment a user starts building, so their
    // work persists and survives refresh. Non-blocking: never delays the UI.
    void ensureGuestIdentity();

    // Get the current grid mode from the start placement picker to ensure
    // the sequence is created with the correct grid mode (Diamond or Box)
    const currentGridMode = startPlacementStateService.currentGridMode;

    if (currentSequence) {
      const update = updateSequenceStartPlacement(
        currentSequence,
        startPlacementData,
        currentGridMode
      );

      if (!update.ok) {
        setError(
          update.reason === "grid-mismatch"
            ? "This sequence uses a different grid. Keep its current grid to edit the start placement."
            : "This pose does not connect to step 1. Move the props to the placement where step 1 begins."
        );
        setShowStartPlacementPicker(true);
        return;
      }

      undoController?.pushUndoSnapshot(UndoOperationType.UPDATE_BEAT, {
        stepNumber: 0,
        stepIndex: 0,
        description: "Update start placement",
      });

      sequenceState.setCurrentSequence(update.sequence);
      sequenceState.clearSelection();
      setSelectedStartPlacement(startPlacementData);
      setShowStartPlacementPicker(false);
      clearError();
      invalidateLoopDisplayCache();
      return;
    }

    undoController?.pushUndoSnapshot(UndoOperationType.SELECT_START_PLACEMENT, {
      description: "Select start placement",
    });

    setShowStartPlacementPicker(false);
    setSelectedStartPlacement(pictographData);
    sequenceState.setSelectedStartPlacement(startPlacementData);

    sequenceState
      .createSequence({
        name: `Sequence ${new Date().toLocaleTimeString()}`,
        length: 0,
      })
      .then((newSequence) => {
        if (newSequence) {
          // IMPORTANT: Set the gridMode on the sequence to match the start placement picker
          // This ensures the option picker loads options for the correct grid mode after undo
          const sequenceWithGridMode = {
            ...newSequence,
            gridMode: currentGridMode,
          };
          sequenceState.setCurrentSequence(sequenceWithGridMode);
          try {
            sequenceState.setStartPlacement(startPlacementData);
          } catch (error) {
            console.error(
              "? ConstructTabState: Error setting start placement:",
              error
            );
          }
        } else {
          console.error("? ConstructTabState: Failed to create new sequence");
          failStartPlacementSelection();
        }
      })
      .catch((error: unknown) => {
        console.error("? ConstructTabState: Error creating sequence:", error);
        failStartPlacementSelection();
      });
  }
  // ============================================================================
  // DERIVED STATE (Construct-specific derived state)
  // ============================================================================

  const hasError = $derived(error !== null);
  const canSelectOptions = $derived(selectedStartPlacement !== null);

  const shouldShowStartPlacementPicker = $derived(() => {
    // Don't return any state until initialization is complete
    if (!isInitialized) return null;

    // SAFEGUARD: If Constructor has NO sequence data (no steps and no start placement),
    // ALWAYS show the Start Placement Picker, regardless of what showStartPlacementPicker says.
    // This prevents the bug where Option Viewer shows "No options available" when
    // there's nothing to show options for.
    if (sequenceState) {
      const currentSeqData = sequenceState.getCurrentSequenceData();
      const hasStartPos = sequenceState.hasStartPlacement;

      // Also check currentSequence.steps directly as a backup
      // getCurrentSequenceData() can return empty in some edge cases
      const currentSeq = sequenceState.currentSequence;
      const directBeatsLength = currentSeq?.steps?.length ?? 0;

      // Has data if we have start placement OR steps (from either source)
      const hasNoData =
        !hasStartPos && currentSeqData.length === 0 && directBeatsLength === 0;

      if (hasNoData) {
        return true; // Force Start Placement Picker when there's no data
      }
    }

    return showStartPlacementPicker;
  });
  const isPickerStateLoading = $derived(
    !isInitialized || showStartPlacementPicker === null
  ); // Loading state detection like main navigation

  // ============================================================================
  // EFFECTS (Construct-specific effects)
  // ============================================================================

  // NOTE: $effect has been removed from the factory function to prevent effect_orphan error
  // The sync logic is now handled in the initializeConstructTab function
  // This is necessary because factory functions called after async operations lose Svelte context

  // Load start placements when construct tab is initialized - using onMount to prevent infinite loops
  let startPlacementsLoaded = $state(false);
  let coordinationSetup = $state(false);

  // Initialize construct tab - called from component onMount
  async function initializeConstructTab() {
    if (!startPlacementsLoaded) {
      // Start placements are loaded automatically on state creation
      startPlacementsLoaded = true;
    }

    if (!coordinationSetup) {
      void CreateModuleOrchestrator.initialize();
      coordinationSetup = true;
    }

    if (
      !unsubscribeStartPlacementListener &&
      startPlacementStateService.onSelectedPlacementChange
    ) {
      unsubscribeStartPlacementListener =
        startPlacementStateService.onSelectedPlacementChange(
          (placement: PictographData | null, source) => {
            handleStartPlacementSelected(placement, source);
          }
        );
    }

    // Register callbacks with local undo controller for undo functionality
    undoController?.setShowStartPlacementPickerCallback(() => {
      setShowStartPlacementPicker(true);
    });

    // Register sync picker state callback for smart picker detection after undo
    undoController?.setSyncPickerStateCallback(() => {
      syncPickerStateWithSequence();
    });

    // Check for pending edit from Browse gallery - that takes priority
    const hasPendingEdit =
      localStorage.getItem("tka-pending-edit-sequence") !== null;

    // CRITICAL FIX: Set a default state and mark initialized BEFORE async operations.
    // This allows the UI to render immediately with the start placement picker shown,
    // rather than showing a loading spinner while waiting for persistence.
    // The persisted state will update this after loading if needed.
    if (!hasPendingEdit) {
      // Default: show start placement picker (safe default for new sequences)
      setShowStartPlacementPicker(true);
    }
    // Mark as initialized EARLY so UI can render while we load persisted state
    isInitialized = true;

    // Now load persisted state asynchronously - this may update the picker state
    if (hasPendingEdit) {
      // Just initialize without loading saved state
      if (sequenceState) {
        await sequenceState.initializeWithPersistence();
      }
      // Don't set showStartPlacementPicker here - let the pending edit effect handle it
    } else if (SequencePersister && sequenceState) {
      try {
        await sequenceState.initializeWithPersistence();

        // Check if we have a persisted state that should affect UI
        // IMPORTANT: Pass "construct" to load only Construct's persisted data
        // Without this, it loads based on navigationState.currentSection which could be another tab
        const savedState =
          await SequencePersister.loadCurrentState("construct");
        debug.log("init: savedState =", savedState);
        debug.log(
          "init: savedState?.hasStartPlacement =",
          savedState?.hasStartPlacement
        );
        debug.log(
          "init: sequenceState.hasStartPlacement =",
          sequenceState.hasStartPlacement
        );
        debug.log(
          "init: sequenceState.getCurrentSequenceData() =",
          sequenceState.getCurrentSequenceData()
        );

        if (savedState?.hasStartPlacement) {
          debug.log(
            "Persisted state has start placement, setting showStartPlacementPicker = false"
          );
          setShowStartPlacementPicker(false);
          setSelectedStartPlacement(savedState.selectedStartPlacement);
          if (savedState.selectedStartPlacement) {
            startPlacementStateService.setSelectedPlacement(
              savedState.selectedStartPlacement
            );
          }
        } else {
          // No saved state - we already set the default above, just clear any stale state
          debug.log(
            "No persisted start placement, keeping showStartPlacementPicker = true"
          );
          startPlacementStateService.clearSelectedPlacement();
        }
      } catch (error) {
        console.error(
          "❌ ConstructTabState: Failed to restore persisted state:",
          error
        );
        // On error, default is already set to show start placement picker
        startPlacementStateService.clearSelectedPlacement();
      }
    } else {
      // No persistence service - we already set the default above
      debug.log(
        "No persistence service, keeping showStartPlacementPicker = true"
      );
      startPlacementStateService.clearSelectedPlacement();
    }

    // Sync picker state with construct tab's own sequence state's hasStartPlacement
    // This logic was moved from $effect to avoid effect_orphan error
    // IMPORTANT: Uses construct tab's own sequence state, not the shared state
    if (sequenceState) {
      debug.log(
        "sync: sequenceState.hasStartPlacement =",
        sequenceState.hasStartPlacement
      );
      debug.log("sync: showStartPlacementPicker =", showStartPlacementPicker);
      if (sequenceState.hasStartPlacement && showStartPlacementPicker === true) {
        debug.log("sync: Sequence has start placement, hiding picker");
        setShowStartPlacementPicker(false);
      } else if (
        !sequenceState.hasStartPlacement &&
        showStartPlacementPicker === false
      ) {
        debug.log("sync: Sequence has NO start placement, showing picker");
        setShowStartPlacementPicker(true);
      }
    }

    debug.log(
      "init complete: showStartPlacementPicker =",
      showStartPlacementPicker
    );
  }

  // ============================================================================
  // STATE MUTATIONS (Construct-specific state updates)
  // ============================================================================

  function setLoading(loading: boolean) {
    isLoading = loading;
  }

  function setTransitioning(transitioning: boolean) {
    isTransitioning = transitioning;
  }

  function setError(errorMessage: string | null) {
    error = errorMessage;
  }

  function clearError() {
    error = null;
  }

  function setShowStartPlacementPicker(show: boolean | null) {
    showStartPlacementPicker = show;
  }

  function setSelectedStartPlacement(placement: PictographData | null) {
    selectedStartPlacement = placement;
  }

  function setContinuousOnly(continuous: boolean) {
    isContinuousOnly = continuous;
    // Persist the continuous filter setting
    try {
      if (!filterPersister) {
        filterPersister = getFilterPersister();
      }
      filterPersister.saveContinuousOnly(continuous);
    } catch (e) {
      console.warn(
        "⚠️ ConstructTabState: Failed to save continuous filter:",
        e
      );
    }
  }

  async function clearSequenceCompletely() {
    try {
      // Start UI transition and sequence clearing simultaneously for smooth UX
      setShowStartPlacementPicker(true);
      setSelectedStartPlacement(null);
      startPlacementStateService.clearSelectedPlacement();
      clearError();

      // TODO: Navigation logic needs to be updated after state refactoring
      // The properties lastContentTab and methods setCurrentSection have been moved/renamed
      // Commented out until navigation state is properly wired up

      // Clear sequence state asynchronously
      if (sequenceState) {
        sequenceState
          .clearSequenceCompletely()
          .then(() => {
            // Navigation logic commented out - needs update after state refactoring
          })
          .catch((error: unknown) => {
            console.error(
              "❌ ConstructTabState: Failed to clear sequence state:",
              error
            );
            setError(
              error instanceof Error
                ? error.message
                : "Failed to clear sequence"
            );
          });
      }
    } catch (error) {
      console.error(
        "❌ ConstructTabState: Failed to initiate sequence clear:",
        error
      );
      setError(
        error instanceof Error ? error.message : "Failed to clear sequence"
      );
    }
  }

  /**
   * Restore picker state after undo - shows option picker instead of start placement picker
   * Called when undoing a clear sequence operation
   */
  function restorePickerStateAfterUndo() {
    setShowStartPlacementPicker(false);
  }

  /**
   * Sync picker state with sequence state's hasStartPlacement and grid mode
   * This replaces the $effect that was causing effect_orphan error
   * Call this method whenever sequence state changes that might affect picker visibility
   *
   * IMPORTANT: Uses the construct tab's OWN sequence state, not the shared createModuleState
   */
  function syncPickerStateWithSequence() {
    if (!isInitialized) return;

    // Use construct tab's own sequence state as the source of truth
    // This is critical - construct tab manages its own sequence independently
    if (!sequenceState) return;

    // When sequence state has a start placement, hide the start placement picker
    if (sequenceState.hasStartPlacement && showStartPlacementPicker === true) {
      setShowStartPlacementPicker(false);
    }

    // When sequence state loses start placement, show the start placement picker
    if (!sequenceState.hasStartPlacement && showStartPlacementPicker === false) {
      setShowStartPlacementPicker(true);
    }

    // Sync grid mode from the current sequence
    const currentSequence = sequenceState.currentSequence;
    if (currentSequence?.gridMode) {
      const sequenceGridMode = currentSequence.gridMode;
      const currentPickerGridMode = startPlacementStateService.currentGridMode;

      if (sequenceGridMode !== currentPickerGridMode) {
        // Update the start placement state's grid mode to match the sequence
        startPlacementStateService.loadPlacements(sequenceGridMode);
      }
    }
  }

  /**
   * Sync grid mode from an imported sequence
   * Call this after importing a sequence to ensure the option picker uses the correct grid mode
   * Uses synchronous setGridMode to avoid async delays that cause UI flicker
   */
  function syncGridModeFromSequence(sequenceGridMode: GridMode | undefined) {
    if (!sequenceGridMode) return;

    const currentPickerGridMode = startPlacementStateService.currentGridMode;
    if (sequenceGridMode !== currentPickerGridMode) {
      // Use synchronous setter to avoid UI flicker from async loadPlacements
      startPlacementStateService.setGridMode(sequenceGridMode);
    }
  }

  // ============================================================================
  // DERIVED STATE - REMOVED
  // ============================================================================

  // CONSOLIDATION: Remove duplicate sequence data management
  // The SequenceState is now the single source of truth for all sequence data
  // Components should access sequence data directly through sequenceState

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  return {
    // Readonly state access
    get isLoading() {
      return isLoading;
    },
    get error() {
      return error;
    },
    get isTransitioning() {
      return isTransitioning;
    },
    get hasError() {
      return hasError;
    },
    get canSelectOptions() {
      return canSelectOptions;
    },
    get showStartPlacementPicker() {
      return showStartPlacementPicker;
    },
    get shouldShowStartPlacementPicker() {
      return shouldShowStartPlacementPicker;
    },
    get isPickerStateLoading() {
      return isPickerStateLoading;
    },
    get isInitialized() {
      return isInitialized;
    },
    // Alias for compatibility with CreationToolPanelSlot
    get isPersistenceInitialized() {
      return isInitialized;
    },
    get selectedStartPlacement() {
      return selectedStartPlacement;
    },
    get isContinuousOnly() {
      return isContinuousOnly;
    },
    // CONSOLIDATION: Direct access to sequence state - no duplicate data management
    get sequenceState() {
      return sequenceState;
    },

    // Sub-states
    get startPlacementStateService() {
      return startPlacementStateService;
    },
    get optionInteractionHintState() {
      return optionInteractionHintState;
    },

    // Undo controller (tab-scoped)
    get undoController() {
      return undoController;
    },
    get canUndo() {
      return undoController?.canUndo || false;
    },
    get canRedo() {
      return undoController?.canRedo || false;
    },
    get undoHistory() {
      return undoController?.undoHistory || [];
    },
    pushUndoSnapshot: (type: UndoOperationType, metadata?: UndoMetadata) => {
      undoController?.pushUndoSnapshot(type, metadata);
    },
    undo: () => {
      return undoController?.undo() || false;
    },
    redo: () => {
      return undoController?.redo() || false;
    },
    clearUndoHistory: () => {
      undoController?.clearUndoHistory();
    },

    // State mutations
    setLoading,
    setTransitioning,
    setError,
    clearError,
    setShowStartPlacementPicker,
    setSelectedStartPlacement,
    setContinuousOnly,
    clearSequenceCompletely,
    restorePickerStateAfterUndo,
    syncPickerStateWithSequence,
    syncGridModeFromSequence,

    // Event handlers
    handleStartPlacementSelected,

    // Initialization
    initializeConstructTab,
  };
}

/**
 * Type for ConstructTabState - the return type of createConstructTabState
 */
export type ConstructTabState = ReturnType<typeof createConstructTabState>;

// Import required state factories
