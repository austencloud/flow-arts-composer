/**
 * Generator Tab State - Sub-tab State
 *
 * Manages state specific to the Generator sub-tab functionality.
 * Handles LOOP (Circular Auto-Pattern) generation and generator-specific UI state.
 *
 * ✅ All generator-specific runes ($state, $derived, $effect) live here
 * ✅ Pure reactive wrappers - no business logic
 * ✅ Services injected via parameters
 * ✅ Component-scoped state (not global singleton)
 * ✅ Each tab maintains its own independent sequence state
 */

import type { SequenceRepository } from "#lib/shared/create/services/sequence-repository.js";
import type { SequencePersister } from "#lib/features/create/shared/services/sequence-persister.js";
import type { SequenceStatsCalculator } from "#lib/features/create/shared/services/sequence-stats-calculator.js";
import type { SequenceTransformer } from "#lib/features/create/shared/services/sequence-transforms/sequence-transformer.js";
import type { SequenceValidator } from "#lib/features/create/shared/services/sequence-validator.js";
import { reversalDetector, type ReversalDetector } from "#lib/shared/create/services/reversal-detector.js";
import { createSequenceState } from "./sequence-state-orchestrator.svelte";
import type { SequenceState } from "./sequence-state-orchestrator.svelte";
import type { UndoMetadata } from "../services/undo-manager";
import type { UndoOperationType } from "../services/undo-manager";
import { createUndoController } from "./create-module/undo-controller.svelte";
import { undoManager } from "../services/undo-manager";

/**
 * Creates generator tab state for generator-specific concerns
 *
 * @param sequenceService - Injected sequence service for business logic
 * @param SequencePersister - Optional persistence service for state survival
 * @param sequenceStatisticsService - Optional statistics service for sequence analysis
 * @param SequenceTransformer - Optional transformation service for sequence operations
 * @param sequenceValidationService - Optional validation service for sequence validation
 * @returns Reactive state object with getters and state mutations
 */
export function createGeneratorTabState(
  sequenceService?: SequenceRepository,
  SequencePersister?: SequencePersister,
  sequenceStatisticsService?: SequenceStatsCalculator,
  SequenceTransformer?: SequenceTransformer,
  sequenceValidationService?: SequenceValidator
) {
  // REACTIVE STATE (Generator-specific)

  let isLoading = $state(false);
  let error = $state<string | null>(null);
  let isTransitioning = $state(false);
  let isInitialized = $state(false);

  // Generator tab has its own independent sequence state
  // IMPORTANT: Pass tabId="generate" to ensure persistence loads/saves only generator's data
  const ReversalDetector: ReversalDetector | undefined = reversalDetector;
  const sequenceState: SequenceState | null = sequenceService
    ? createSequenceState({
        sequenceService,
        ...(SequencePersister && { SequencePersister }),
        ...(sequenceStatisticsService && { sequenceStatisticsService }),
        ...(SequenceTransformer && { SequenceTransformer }),
        ...(sequenceValidationService && { sequenceValidationService }),
        ...(ReversalDetector && { ReversalDetector }),
        tabId: "generate", // Persistence isolation - only load/save generator's data
      })
    : null;

  // Generator tab has its own independent undo controller
  const undoController = sequenceState
    ? createUndoController({
        UndoManager: undoManager,
        sequenceState,
        getActiveSection: () => "generate",
        setActiveSectionInternal: async (_panel, _addToHistory) => {
          // Generator tab doesn't need to change active section since it's always generate
          // This is just for compatibility with the undo controller interface
        },
      })
    : null;


  const hasError = $derived(error !== null);
  const hasSequence = $derived(() => {
    return sequenceState ? sequenceState.hasSequence() : false;
  });


  /**
   * Initialize generator tab - called from component onMount
   */
  async function initializeGeneratorTab() {
    if (!sequenceState) {
      console.warn(
        "⚠️ GeneratorTabState: No sequence service provided, skipping sequence state initialization"
      );
      isInitialized = true;
      return;
    }

    try {
      // Initialize persistence and restore state if available
      if (SequencePersister) {
        await sequenceState.initializeWithPersistence();
      }

      isInitialized = true;
    } catch (error) {
      console.error("❌ GeneratorTabState: Failed to initialize:", error);
      setError(error instanceof Error ? error.message : "Failed to initialize");
    }
  }


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

  async function clearSequenceCompletely() {
    try {
      clearError();

      // Clear sequence state asynchronously
      if (sequenceState) {
        await sequenceState.clearSequenceCompletely();
      }
    } catch (error) {
      console.error("❌ GeneratorTabState: Failed to clear sequence:", error);
      setError(
        error instanceof Error ? error.message : "Failed to clear sequence"
      );
    }
  }


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
    get isInitialized() {
      return isInitialized;
    },
    get isPersistenceInitialized() {
      return isInitialized;
    },
    get hasSequence() {
      return hasSequence;
    },

    // Sequence state access
    get sequenceState() {
      return sequenceState;
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
    clearSequenceCompletely,

    // Initialization
    initializeGeneratorTab,
  };
}

/**
 * Type for GeneratorTabState - the return type of createGeneratorTabState
 */
export type GeneratorTabState = ReturnType<typeof createGeneratorTabState>;
