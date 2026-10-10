/**
 * Spell Tab State - Sub-tab State
 *
 * Manages state specific to the Spell sub-tab functionality.
 * Handles word-to-sequence conversion and spell-specific UI state.
 *
 * ✅ All spell-specific runes ($state, $derived, $effect) live here
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
import { createSequenceState } from "#lib/features/create/shared/state/sequence-state-orchestrator.svelte.js";
import type { SequenceState } from "#lib/features/create/shared/state/sequence-state-orchestrator.svelte.js";
import type { UndoMetadata } from "../../shared/services/undo-manager";
import type { UndoOperationType } from "../../shared/services/undo-manager";
import { createUndoController } from "#lib/features/create/shared/state/create-module/undo-controller.svelte.js";
import { undoManager } from "#lib/features/create/shared/services/undo-manager.js";
import { browser } from "$app/env";
import type {
  LetterSource,
  SpellPreferences,
  ExtensionAnalysis,
  LOOPType,
  CircularizationOption,
} from "../domain/models/spell-models";
import { DEFAULT_SPELL_PREFERENCES } from "#lib/shared/create/domain/spell-constants.js";
import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";

const HAS_GENERATED_STORAGE_KEY = "spell-has-generated-once";
const GRID_MODE_STORAGE_KEY = "spell-grid-mode";
const INPUT_WORD_STORAGE_KEY = "spell-input-word";

/**
 * Creates spell tab state for spell-specific concerns
 *
 * @param sequenceService - Injected sequence service for business logic
 * @param SequencePersister - Optional persistence service for state survival
 * @param sequenceStatisticsService - Optional statistics service for sequence analysis
 * @param SequenceTransformer - Optional transformation service for sequence operations
 * @param sequenceValidationService - Optional validation service for sequence validation
 * @returns Reactive state object with getters and state mutations
 */
export function createSpellTabState(
  sequenceService?: SequenceRepository,
  SequencePersister?: SequencePersister,
  sequenceStatisticsService?: SequenceStatsCalculator,
  SequenceTransformer?: SequenceTransformer,
  sequenceValidationService?: SequenceValidator
) {
  // REACTIVE STATE (Spell-specific)

  let isLoading = $state(false);
  let error = $state<string | null>(null);
  let isTransitioning = $state(false);
  let isInitialized = $state(false);

  // Spell-specific state
  const getInitialInputWord = (): string => {
    if (!browser) return "";
    try {
      return localStorage.getItem(INPUT_WORD_STORAGE_KEY) || "";
    } catch {
      return "";
    }
  };
  let inputWord = $state(getInitialInputWord());
  let expandedWord = $state("");
  let letterSources = $state<LetterSource[]>([]);
  let isGenerating = $state(false);
  let showLetterPalette = $state(false);
  let preferences = $state<SpellPreferences>({ ...DEFAULT_SPELL_PREFERENCES });
  let loopAnalysis = $state<ExtensionAnalysis | null>(null);
  let circularizationOptions = $state<CircularizationOption[]>([]);
  let directLoopUnavailableReason = $state<string | null>(null);

  // Track if user has generated at least once (for progressive disclosure)
  const getInitialHasGenerated = (): boolean => {
    if (!browser) return false;
    try {
      return localStorage.getItem(HAS_GENERATED_STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  };
  let hasGeneratedOnce = $state(getInitialHasGenerated());

  // Grid mode selection (persisted)
  const getInitialGridMode = (): GridMode => {
    if (!browser) return GridMode.DIAMOND;
    try {
      const stored = localStorage.getItem(GRID_MODE_STORAGE_KEY);
      if (stored === "BOX") return GridMode.BOX;
      return GridMode.DIAMOND;
    } catch {
      return GridMode.DIAMOND;
    }
  };
  let selectedGridMode = $state<GridMode>(getInitialGridMode());

  // Spell tab has its own independent sequence state
  // IMPORTANT: Pass tabId="spell" to ensure persistence loads/saves only spell's data
  const ReversalDetector: ReversalDetector | undefined = reversalDetector;
  const sequenceState: SequenceState | null = sequenceService
    ? createSequenceState({
        sequenceService,
        ...(SequencePersister && { SequencePersister }),
        ...(sequenceStatisticsService && { sequenceStatisticsService }),
        ...(SequenceTransformer && { SequenceTransformer }),
        ...(sequenceValidationService && { sequenceValidationService }),
        ...(ReversalDetector && { ReversalDetector }),
        tabId: "spell", // Persistence isolation - only load/save spell's data
      })
    : null;

  // Spell tab has its own independent undo controller
  const undoController = sequenceState
    ? createUndoController({
        UndoManager: undoManager,
        sequenceState,
        getActiveSection: () => "spell",
        setActiveSectionInternal: async () => {
          // Spell tab doesn't need to change active section since it's always spell
          // This is just for compatibility with the undo controller interface
        },
      })
    : null;


  const hasError = $derived(error !== null);
  const hasSequence = $derived(() => {
    return sequenceState ? sequenceState.hasSequence() : false;
  });
  const hasInput = $derived(inputWord.trim().length > 0);
  const canGenerate = $derived(hasInput && !isGenerating);
  const hasBridgeLetters = $derived(
    letterSources.some((source) => !source.isOriginal)
  );

  // LOOP-related derived state
  const hasAvailableLOOPs = $derived(
    loopAnalysis !== null && loopAnalysis.availableLOOPOptions.length > 0
  );
  const availableLOOPOptions = $derived(
    loopAnalysis?.availableLOOPOptions ?? []
  );

  // Circularization-related derived state
  const hasCircularizationOptions = $derived(circularizationOptions.length > 0);
  const needsCircularization = $derived(
    preferences.makeCircular && circularizationOptions.length > 0
  );


  /**
   * Initialize spell tab - called from component onMount
   */
  async function initializeSpellTab() {
    if (!sequenceState) {
      console.warn(
        "⚠️ SpellTabState: No sequence service provided, skipping sequence state initialization"
      );
      isInitialized = true;
      return;
    }

    try {
      // Initialize persistence and restore state if available
      if (SequencePersister) {
        await sequenceState.initializeWithPersistence();
      }

      // Restore spell-specific metadata from sequence if available
      restoreSpellMetadataFromSequence();

      isInitialized = true;
    } catch (error) {
      console.error("❌ SpellTabState: Failed to initialize:", error);
      setError(error instanceof Error ? error.message : "Failed to initialize");
    }
  }

  /**
   * Restore spell metadata (letterSources, inputWord, expandedWord) from sequence metadata.
   * This is called after sequence state is restored from persistence.
   */
  function restoreSpellMetadataFromSequence() {
    if (!sequenceState) return;

    // currentSequence is a getter property
    const currentSequence = sequenceState.currentSequence;
    if (!currentSequence) return;

    // Check if sequence has spell metadata
    const spellData = currentSequence.metadata?.spellData as
      | {
          originalWord?: string;
          expandedWord?: string;
          letterSources?: LetterSource[];
        }
      | undefined;

    if (spellData) {
      if (spellData.originalWord) {
        inputWord = spellData.originalWord;
      }
      if (spellData.expandedWord) {
        expandedWord = spellData.expandedWord;
      }
      if (spellData.letterSources && Array.isArray(spellData.letterSources)) {
        letterSources = spellData.letterSources;
      }
    }
  }

  // STATE MUTATIONS - Core

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
      clearSpellState();

      // Clear sequence state asynchronously
      if (sequenceState) {
        await sequenceState.clearSequenceCompletely();
      }
    } catch (error) {
      console.error("❌ SpellTabState: Failed to clear sequence:", error);
      setError(
        error instanceof Error ? error.message : "Failed to clear sequence"
      );
    }
  }

  // STATE MUTATIONS - Spell-specific

  function setInputWord(word: string) {
    inputWord = word;
    // Persist to localStorage
    if (browser) {
      try {
        localStorage.setItem(INPUT_WORD_STORAGE_KEY, word);
      } catch {
        // Ignore storage errors
      }
    }
    // Clear previous generation results when input changes
    if (expandedWord) {
      expandedWord = "";
      letterSources = [];
    }
  }

  function setExpandedWord(word: string) {
    expandedWord = word;
  }

  function setLetterSources(sources: LetterSource[]) {
    letterSources = sources;
  }

  function setGenerating(generating: boolean) {
    isGenerating = generating;
  }

  function setShowLetterPalette(show: boolean) {
    showLetterPalette = show;
  }

  function toggleLetterPalette() {
    showLetterPalette = !showLetterPalette;
  }

  function updatePreference<K extends keyof SpellPreferences>(
    key: K,
    value: SpellPreferences[K]
  ) {
    preferences = { ...preferences, [key]: value };
  }

  function resetPreferences() {
    preferences = { ...DEFAULT_SPELL_PREFERENCES };
  }

  // Bulk-apply persisted preferences (restore on mount). Merge onto defaults so
  // a missing/legacy persisted shape backfills any absent keys.
  function setPreferences(prefs: Partial<SpellPreferences>) {
    preferences = { ...DEFAULT_SPELL_PREFERENCES, ...prefs };
  }

  function setLoopAnalysis(analysis: ExtensionAnalysis | null) {
    loopAnalysis = analysis;
  }

  function selectLOOPType(loopType: LOOPType | null) {
    preferences = { ...preferences, selectedLOOPType: loopType };
  }

  function setCircularizationOptions(options: CircularizationOption[]) {
    circularizationOptions = options;
  }

  function setDirectLoopUnavailableReason(reason: string | null) {
    directLoopUnavailableReason = reason;
  }

  function markHasGeneratedOnce() {
    if (hasGeneratedOnce) return;
    hasGeneratedOnce = true;
    if (browser) {
      try {
        localStorage.setItem(HAS_GENERATED_STORAGE_KEY, "true");
      } catch {
        // Ignore localStorage errors
      }
    }
  }

  function clearSpellState() {
    inputWord = "";
    expandedWord = "";
    letterSources = [];
    isGenerating = false;
    error = null;
    loopAnalysis = null;
    circularizationOptions = [];
    directLoopUnavailableReason = null;
    // Clear persisted input word
    if (browser) {
      try {
        localStorage.removeItem(INPUT_WORD_STORAGE_KEY);
      } catch {
        // Ignore storage errors
      }
    }
  }

  function setGridMode(mode: GridMode) {
    selectedGridMode = mode;
    if (browser) {
      try {
        localStorage.setItem(GRID_MODE_STORAGE_KEY, mode);
      } catch {
        // Ignore storage errors
      }
    }
  }

  /**
   * Insert a letter at the current cursor position or at the end
   * Used by the letter palette for Greek letter insertion
   */
  function insertLetter(letter: string) {
    inputWord = inputWord + letter;
    // Persist to localStorage
    if (browser) {
      try {
        localStorage.setItem(INPUT_WORD_STORAGE_KEY, inputWord);
      } catch {
        // Ignore storage errors
      }
    }
  }


  return {
    // Readonly state access - Core
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

    // Readonly state access - Spell-specific
    get inputWord() {
      return inputWord;
    },
    get expandedWord() {
      return expandedWord;
    },
    get letterSources() {
      return letterSources;
    },
    get isGenerating() {
      return isGenerating;
    },
    get showLetterPalette() {
      return showLetterPalette;
    },
    get preferences() {
      return preferences;
    },
    get hasInput() {
      return hasInput;
    },
    get canGenerate() {
      return canGenerate;
    },
    get hasBridgeLetters() {
      return hasBridgeLetters;
    },

    // LOOP-related readonly state
    get loopAnalysis() {
      return loopAnalysis;
    },
    get hasAvailableLOOPs() {
      return hasAvailableLOOPs;
    },
    get availableLOOPOptions() {
      return availableLOOPOptions;
    },

    // Circularization-related readonly state
    get circularizationOptions() {
      return circularizationOptions;
    },
    get hasCircularizationOptions() {
      return hasCircularizationOptions;
    },
    get needsCircularization() {
      return needsCircularization;
    },
    get directLoopUnavailableReason() {
      return directLoopUnavailableReason;
    },

    // Progressive disclosure - track if user has generated before
    get hasGeneratedOnce() {
      return hasGeneratedOnce;
    },

    // Grid mode
    get selectedGridMode() {
      return selectedGridMode;
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

    // State mutations - Core
    setLoading,
    setTransitioning,
    setError,
    clearError,
    clearSequenceCompletely,

    // State mutations - Spell-specific
    setInputWord,
    setExpandedWord,
    setLetterSources,
    setGenerating,
    setShowLetterPalette,
    toggleLetterPalette,
    updatePreference,
    resetPreferences,
    setPreferences,
    clearSpellState,
    insertLetter,

    // LOOP-related mutations
    setLoopAnalysis,
    selectLOOPType,

    // Circularization-related mutations
    setCircularizationOptions,
    setDirectLoopUnavailableReason,

    // Progressive disclosure
    markHasGeneratedOnce,

    // Grid mode mutation
    setGridMode,

    // Initialization
    initializeSpellTab,
  };
}

/**
 * Type for SpellTabState - the return type of createSpellTabState
 */
export type SpellTabState = ReturnType<typeof createSpellTabState>;
