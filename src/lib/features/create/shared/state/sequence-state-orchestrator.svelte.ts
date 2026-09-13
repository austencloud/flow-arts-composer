/**
 * Sequence State Orchestrator
 *
 * Composes all sub-states and operations into a unified sequence state:
 * - Core state (sequences, loading, errors)
 * - Selection state (step selection, start position)
 * - Arrow state (arrow positioning)
 * - Animation state (removal animations)
 * - Persistence coordination
 * - Step operations
 * - Transform operations
 * - Service integration
 *
 * RESPONSIBILITY: Composition and delegation, minimal business logic
 *
 * REPLACES: The 890-line god object sequence-state.svelte.ts
 */

import type { BuildModeId } from "$lib/shared/foundation/ui/ui-types";
import type { ArrowPosition } from "$lib/shared/pictograph/arrow/orchestration/domain/arrow-models";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import { createStepData } from "$lib/shared/foundation/domain/factories/create-step-data";
import type { StartPositionData } from "$lib/shared/foundation/domain/models/start-position-data";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { ValidationResult } from "$lib/shared/validation/validation-result";
import type { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { deepLinker } from "$lib/shared/navigation/services/deep-linker";
import type { TargetHand } from "./panel-coordination-state.svelte";
import { logSequenceAction } from "$lib/shared/analytics/services/posthog-activity-logger";
import { startPositionDeriver } from "$lib/shared/pictograph/shared/services/start-position-deriver";
import type { SequencePersister } from "$lib/features/create/shared/services/sequence-persister";
import type { SequenceRepository } from "$lib/shared/create/services/sequence-repository";
import type { ReversalDetector } from "$lib/shared/create/services/reversal-detector";
import type { SequenceStatsCalculator } from "$lib/features/create/shared/services/sequence-stats-calculator";
import type { SequenceTransformer } from "$lib/features/create/shared/services/sequence-transforms/sequence-transformer";
import type { SequenceValidator } from "$lib/features/create/shared/services/sequence-validator";
import { createSequenceAnimationState } from "./animation/sequence-animation-state.svelte";
import { createSequenceArrowState } from "./arrow/sequence-arrow-state.svelte";
import { createSequenceCoreState } from "./core/sequence-core-state.svelte";
import { createSequenceStepOperations } from "./operations/sequence-step-operations";
import { createSequenceTransformOperations } from "./operations/sequence-transform-operations";
import { createSequencePersistenceCoordinator } from "./persistence/sequence-persistence-coordinator.svelte";
import {
  createSequenceSelectionState,
  type SequenceSelectionSnapshot,
} from "./selection/sequence-selection-state.svelte";
import { isStep } from "$lib/features/create/shared/domain/type-guards/pictograph-type-guards";
import { createSequence as createSequenceData } from "$lib/shared/create/services/sequence-domain-manager";

/**
 * Clean service configuration - no more type gymnastics!
 */
export interface SequenceStateServices {
  sequenceService?: SequenceRepository;
  SequencePersister?: SequencePersister;
  sequenceStatisticsService?: SequenceStatsCalculator;
  SequenceTransformer?: SequenceTransformer;
  sequenceValidationService?: SequenceValidator;
  ReversalDetector?: ReversalDetector;
  /**
   * IMPORTANT: Tab ID for persistence isolation.
   * Each tab (construct, assembler, generator) should have its own persisted data.
   * If not provided, persistence will use navigationState.currentSection which can cause
   * cross-tab data pollution.
   */
  tabId?: BuildModeId;
  onCurrentSequenceChange?: (sequence: SequenceData | null) => void;
}

export function createSequenceState(services: SequenceStateServices) {
  const {
    sequenceService,
    SequencePersister,
    sequenceStatisticsService,
    SequenceTransformer,
    sequenceValidationService,
    tabId, // Tab ID for persistence isolation
    ReversalDetector,
    onCurrentSequenceChange,
  } = services;

  // Create sub-states
  const coreState = createSequenceCoreState(onCurrentSequenceChange);
  const selectionState = createSequenceSelectionState();
  const arrowState = createSequenceArrowState();
  const animationState = createSequenceAnimationState();

  // Create persistence coordinator with tab ID for isolated persistence
  const persistenceCoordinator = createSequencePersistenceCoordinator(
    SequencePersister ?? null,
    ReversalDetector
      ? (seq: SequenceData) => ReversalDetector.processReversals(seq)
      : undefined,
    tabId // Pass tab ID for persistence isolation
  );

  // 🚀 PERFORMANCE: Debounced auto-save to prevent excessive persistence operations
  let saveTimeout: ReturnType<typeof setTimeout> | null = null;
  const SAVE_DEBOUNCE_MS = 500; // Wait 500ms after last change before saving
  let tutorialWorkspaceSnapshot: {
    sequence: SequenceData;
    selection: SequenceSelectionSnapshot;
  } | null = null;

  // Create operation facades
  const stepOperations = createSequenceStepOperations({
    coreState,
    selectionState,
    animationState,
    ReversalDetector,
    onSave: saveSequenceDataOnly,
  });

  const transformOperations = createSequenceTransformOperations({
    coreState,
    selectionState,
    sequenceStatisticsService: sequenceStatisticsService ?? null,
    SequenceTransformer: SequenceTransformer ?? null,
    sequenceValidationService: sequenceValidationService ?? null,
    onSave: saveSequenceDataOnly,
  });

  async function initializeWithPersistence(): Promise<void> {
    // Check if there's a pending deep link OR pending edit - if so, skip persistence restoration
    // This prevents overwriting deep link/pending edit sequences with old saved state
    let hasDeepLink = false;
    let hasPendingEdit = false;
    try {
      hasDeepLink = deepLinker.hasDataForModule("create") ?? false;

      // Also check for pending edit from Browse gallery (stored in localStorage)
      hasPendingEdit =
        localStorage.getItem("tka-pending-edit-sequence") !== null;
    } catch {
      // Service not available - assume no deep link
      void 0; // Suppress unused catch binding warning
    }

    if (hasDeepLink || hasPendingEdit) {
      // Still initialize the coordinator but don't load saved state
      await persistenceCoordinator.initialize();
      return;
    }

    const savedState = await persistenceCoordinator.initialize();

    if (savedState) {
      coreState.setCurrentSequence(savedState.currentSequence);
      selectionState.setStartPosition(savedState.selectedStartPosition);
    }
  }

  async function saveCurrentState(
    activeBuildSection: BuildModeId
  ): Promise<void> {
    await persistenceCoordinator.saveState({
      currentSequence: coreState.currentSequence,
      selectedStartPosition: selectionState.selectedStartPosition,
      hasStartPosition: selectionState.hasStartPosition,
      activeBuildSection,
    });
  }

  async function saveSequenceDataOnly(): Promise<void> {
    await persistenceCoordinator.saveSequenceOnly(
      coreState.currentSequence,
      selectionState.selectedStartPosition,
      selectionState.hasStartPosition
    );
  }

  /**
   * Temporarily replaces an in-progress draft with an empty Construct workspace.
   * Tutorial edits stay in memory and cannot overwrite or clear the saved draft.
   * Empty first-run workspaces are left alone so a learner keeps what they build.
   */
  function beginTutorialWorkspace(): boolean {
    if (tutorialWorkspaceSnapshot) {
      return false;
    }

    if (saveTimeout) {
      clearTimeout(saveTimeout);
      saveTimeout = null;
    }

    if (!coreState.currentSequence) {
      // A sequence-less workspace can still carry stale picker selection from
      // a prior HMR/tab handoff. Tutorial Step 1 must always begin unselected.
      selectionState.reset();
      arrowState.reset();
      coreState.clearError();
      return false;
    }

    const sequence = $state.snapshot(coreState.currentSequence) as SequenceData;
    const selection = $state.snapshot(
      selectionState.captureSnapshot()
    ) as SequenceSelectionSnapshot;
    const sequenceStartPosition =
      sequence.startingPosition ?? sequence.startPosition ?? null;

    // The sequence is authoritative if a prior HMR/tab handoff left the
    // selection cache stale in either direction.
    selection.selectedStartPosition = sequenceStartPosition;
    if (sequenceStartPosition === null && selection.selectedStepNumber === 0) {
      selection.selectedStepNumber = null;
    }

    // Persist the latest real draft before tutorial persistence is suspended.
    // saveSequenceOnly passes its enabled guard synchronously before yielding.
    void persistenceCoordinator.saveSequenceOnly(
      sequence,
      sequenceStartPosition,
      sequenceStartPosition !== null
    );

    persistenceCoordinator.setAutoSaveEnabled(false);
    tutorialWorkspaceSnapshot = { sequence, selection };

    // Use the core state directly so opening the tutorial cannot schedule a
    // debounced null save over the draft we just preserved.
    coreState.setCurrentSequence(null);
    selectionState.reset();
    arrowState.reset();
    coreState.clearError();

    return true;
  }

  function restoreTutorialWorkspace(): boolean {
    const snapshot = tutorialWorkspaceSnapshot;
    if (!snapshot) {
      return false;
    }

    if (saveTimeout) {
      clearTimeout(saveTimeout);
      saveTimeout = null;
    }

    // Keep persistence suspended until the original sequence and selection
    // are both back in memory.
    coreState.setCurrentSequence(snapshot.sequence);
    selectionState.restoreSnapshot(snapshot.selection);
    arrowState.reset();
    coreState.clearError();

    tutorialWorkspaceSnapshot = null;
    persistenceCoordinator.setAutoSaveEnabled(true);

    return true;
  }

  async function loadSequences(): Promise<void> {
    if (!sequenceService) return;

    coreState.setLoading(true);
    coreState.clearError();

    try {
      const sequences = await sequenceService.getAllSequences();
      coreState.setSequences(sequences);
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Unknown error loading sequences";
      coreState.setError(errorMessage);
      console.error("Failed to load sequences:", error);
    } finally {
      coreState.setLoading(false);
    }
  }

  // Creation is async (the sequence service may hit storage/network), but the
  // construct UI flips to the option picker the moment a start position is
  // chosen. A fast tap lands in that window with currentSequence still null,
  // so callers can await this promise instead of seeing "no current sequence".
  let pendingSequenceCreation: Promise<SequenceData | null> | null = null;

  async function createSequence(request: {
    name: string;
    length: number;
  }): Promise<SequenceData | null> {
    const creation = createSequenceInternal(request);
    pendingSequenceCreation = creation;
    try {
      return await creation;
    } finally {
      if (pendingSequenceCreation === creation) {
        pendingSequenceCreation = null;
      }
    }
  }

  /**
   * Resolves once a sequence is available: immediately when one already exists,
   * after the in-flight creation settles when one is being created, or null when
   * there is nothing to wait for.
   */
  async function whenCurrentSequenceReady(): Promise<SequenceData | null> {
    if (coreState.currentSequence) return coreState.currentSequence;
    if (!pendingSequenceCreation) return null;
    await pendingSequenceCreation;
    return coreState.currentSequence;
  }

  async function createSequenceInternal(request: {
    name: string;
    length: number;
  }): Promise<SequenceData | null> {
    if (!sequenceService) return null;

    coreState.setLoading(true);
    coreState.clearError();

    try {
      if (tutorialWorkspaceSnapshot) {
        const sequence = createSequenceData({
          ...request,
          word: request.name,
        });
        coreState.setCurrentSequence(sequence);
        return sequence;
      }

      const sequence = await sequenceService.createSequence({
        ...request,
        word: request.name,
      });

      coreState.addSequence(sequence);
      coreState.setCurrentSequence(sequence);

      // Log sequence creation for analytics
      try {
        void logSequenceAction("create", sequence.id, {
          sequenceWord: sequence.word,
          sequenceLength: sequence.steps.length,
        });
      } catch {
        // Silently fail - activity logging is non-critical
      }

      return sequence;
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Unknown error creating sequence";
      coreState.setError(errorMessage);
      console.error("Failed to create sequence:", error);
      return null;
    } finally {
      coreState.setLoading(false);
    }
  }

  async function updateSequenceSteps(
    sequenceId: string,
    stepIndex: number,
    stepData: StepData
  ): Promise<void> {
    if (!sequenceService) return;

    try {
      await sequenceService.updateStep(sequenceId, stepIndex, stepData);
      // Update local state
      if (
        coreState.currentSequence &&
        stepIndex >= 0 &&
        stepIndex < coreState.currentSequence.steps.length
      ) {
        const newSteps = [...coreState.currentSequence.steps];
        newSteps[stepIndex] = stepData;
        coreState.setCurrentSequence({
          ...coreState.currentSequence,
          steps: newSteps,
        });
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error updating step";
      coreState.setError(errorMessage);
      console.error("Failed to update step:", error);
    }
  }

  function setCurrentSequence(sequence: SequenceData | null): void {
    // Normalize step numbers for imported sequences (e.g., from Browse gallery).
    // Steps loaded from Firestore may lack stepNumber, causing step selection to fail
    // because selectStep() validates stepNumber against the sequence length.
    if (sequence?.steps?.length) {
      const needsNormalization = sequence.steps.some(
        (step, index) => step.stepNumber !== index + 1
      );
      if (needsNormalization) {
        sequence = {
          ...sequence,
          steps: sequence.steps.map((step, index) => ({
            ...step,
            stepNumber: index + 1,
          })),
        };
      }
    }

    // Recompute reversal indicators so dashes (noRotation) don't break the chain.
    // The detector looks past noRotation steps to find the last real rotation direction
    // and compares it with the current step's direction.
    if (sequence?.steps?.length && ReversalDetector) {
      sequence = ReversalDetector.processReversals(sequence);
    }

    // Only clear selection when loading a NEW sequence, not when updating the current one
    // This preserves step selection during step edits (turns, orientation changes, etc.)
    const previousSequenceId = coreState.currentSequence?.id;
    const newSequenceId = sequence?.id;
    const isLoadingNewSequence = previousSequenceId !== newSequenceId;

    coreState.setCurrentSequence(sequence);

    if (isLoadingNewSequence) {
      selectionState.clearSelection();
    }

    // Update start position from sequence
    // Check both startingPosition (full step format) and startPosition (raw position data)
    // Sequences from Browse gallery may only have startPosition
    let startPosStep: StartPositionData | null =
      sequence?.startingPosition || sequence?.startPosition || null;

    // If no explicit start position but sequence has steps, derive from the first step
    // and stamp it back onto the sequence so all downstream code (transforms, saves)
    // sees a real startPosition instead of undefined.
    if (!startPosStep && sequence?.steps?.length) {
      try {
        const derived = startPositionDeriver.getOrDeriveStartPosition(sequence);
        // getOrDeriveStartPosition returns StartPositionData when deriving from steps
        // The StepData return type is for legacy compatibility only
        if (derived && "isStartPosition" in derived) {
          startPosStep = derived as StartPositionData;

          // Write it back onto the sequence so transforms (swap, mirror, etc.)
          // can operate on it directly instead of seeing undefined
          sequence = {
            ...sequence,
            startPosition: startPosStep,
            startingPosition: startPosStep,
          };
          coreState.setCurrentSequence(sequence);
        }
      } catch (error) {
        console.warn("Failed to derive start position from first step:", error);
      }
    }

    if (startPosStep) {
      selectionState.setStartPosition(startPosStep);
    } else {
      selectionState.setStartPosition(null);
    }

    // 🚀 PERFORMANCE: Debounced auto-save to prevent blocking on every step addition
    if (saveTimeout) {
      clearTimeout(saveTimeout);
    }
    saveTimeout = setTimeout(() => {
      saveSequenceDataOnly().catch((error) => {
        console.error("Failed to auto-save sequence state:", error);
      });
    }, SAVE_DEBOUNCE_MS);
  }

  function setSelectedStartPosition(
    startPosition: StartPositionData | null
  ): void {
    selectionState.setStartPosition(startPosition);

    // 🚀 PERFORMANCE: Debounced auto-save
    if (saveTimeout) {
      clearTimeout(saveTimeout);
    }
    saveTimeout = setTimeout(() => {
      saveSequenceDataOnly().catch((error) => {
        console.error("Failed to auto-save start position state:", error);
      });
    }, SAVE_DEBOUNCE_MS);
  }

  async function clearSequenceCompletely(): Promise<void> {
    try {
      // Undo and the start-position picker both fire this without awaiting it,
      // so a redo (or a fresh start-position pick) can land a new sequence
      // inside the 300ms animation window below. Landing the clear afterwards
      // wiped that newer sequence AND its saved copy, with no error and no
      // history entry to get it back. Remember what we agreed to clear.
      const clearingSequence = coreState.currentSequence;

      animationState.startClearing();

      // Reduced delay to match the step-grid CSS transition (300ms)
      // This allows the clearing animation and layout transition to happen simultaneously
      // The CSS transition on .step-grid.clearing is 300ms, so we wait for it to complete
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Someone else owns the workspace now. Their sequence is not ours to
      // clear, and their persisted copy is not ours to delete.
      const sequenceNow = coreState.currentSequence;
      if (sequenceNow !== null && sequenceNow !== clearingSequence) {
        animationState.endClearing();
        return;
      }

      // 🐛 FIX: Cancel any pending auto-save AND prevent new one from being set
      // This prevents a race condition where auto-save fires after clearState(),
      // re-populating the storage with stale data
      if (saveTimeout) {
        clearTimeout(saveTimeout);
        saveTimeout = null;
      }

      // Use coreState directly to avoid triggering auto-save in setCurrentSequence()
      coreState.setCurrentSequence(null);
      selectionState.reset();
      coreState.clearError();

      await persistenceCoordinator.clearState();

      animationState.endClearing();
    } catch (error) {
      console.error("❌ SequenceState: Failed to clear sequence:", error);
      coreState.setError(
        error instanceof Error ? error.message : "Failed to clear sequence"
      );
      animationState.endClearing();
    }
  }

  function getCurrentSequenceData(): StepData[] {
    const sequence = coreState.currentSequence;
    if (sequence) {
      const steps = sequence.steps || [];
      const startPosition = sequence.startingPosition || sequence.startPosition;

      if (steps.length > 0) {
        return steps.map((step: StepData) => step).filter(Boolean);
      } else if (startPosition) {
        // MIGRATION: Only include start position if it's actually StepData (legacy data)
        // Modern StartPositionData should not be included in steps array
        if (isStep(startPosition) && !startPosition.isBlank) {
          return [startPosition];
        }
        // If it's a StartPositionData, don't include it in the steps array
        // (Start positions are not steps)

        return [];
      }
    }

    // FIXED: Don't return selectedStartPosition here!
    // The selectedStartPosition is tracked separately in construct-tab-state.
    // Returning it here causes the option picker to think there's a sequence when there isn't.
    // This was causing the "no options available" bug.
    return [];
  }

  function getSelectedStepData(): StepData | null {
    // If start position is selected, return it as StepData
    if (
      selectionState.isStartPositionSelected &&
      selectionState.selectedStartPosition
    ) {
      // Factory fills any missing hand with an invisible placeholder
      // (both-required canonical Step shape).
      return createStepData({
        ...selectionState.selectedStartPosition,
        stepNumber: 0,
        duration: 1,
        isBlank: false,
      });
    }

    // Otherwise return selected step
    if (
      selectionState.selectedStepIndex === null ||
      !coreState.currentSequence
    ) {
      return null;
    }

    return (
      coreState.currentSequence.steps[selectionState.selectedStepIndex] ?? null
    );
  }

  function selectStep(stepNumber: number | null): void {
    if (stepNumber === null) {
      selectionState.clearSelection();
      return;
    }

    // Validate stepNumber is within valid range
    // stepNumber 0 = start position (always valid if we have a start position)
    // stepNumber 1 to N = steps in the sequence
    const currentSequence = coreState.currentSequence;

    if (stepNumber === 0) {
      // Start position - always allow selection
      selectionState.selectStep(stepNumber);
    } else if (
      currentSequence &&
      stepNumber >= 1 &&
      stepNumber <= currentSequence.steps.length
    ) {
      // Regular step - validate it exists
      selectionState.selectStep(stepNumber);
    } else {
      selectionState.clearSelection();
    }
  }

  function resetSequenceState(): void {
    coreState.reset();
    selectionState.reset();
    arrowState.reset();
    animationState.reset();
  }

  // PUBLIC API - Unified interface matching original

  return {
    // State getters - delegate to sub-states
    get currentSequence() {
      return coreState.currentSequence;
    },
    get currentSequenceRevision() {
      return coreState.currentSequenceRevision;
    },
    get sequences() {
      return coreState.sequences;
    },
    get isLoading() {
      return coreState.isLoading;
    },
    get error() {
      return coreState.error;
    },
    get selectedStepIndex() {
      return selectionState.selectedStepIndex;
    },
    get selectedStepNumber() {
      return selectionState.selectedStepNumber;
    },
    get selectedSequenceId() {
      return coreState.selectedSequenceId;
    },
    get showStepNumbers() {
      return true;
    },
    get gridMode() {
      return coreState.gridMode;
    },
    /** Direct read bypassing the spread-derived getter */
    get orientationCycleCount(): 1 | 2 | 4 | 8 {
      return coreState.orientationCycleCount;
    },
    get arrowPositions() {
      return arrowState.arrowPositions;
    },
    get arrowPositioningInProgress() {
      return arrowState.arrowPositioningInProgress;
    },
    get arrowPositioningError() {
      return arrowState.arrowPositioningError;
    },
    get selectedStartPosition() {
      return selectionState.selectedStartPosition;
    },
    get hasStartPosition() {
      return selectionState.hasStartPosition;
    },
    get isInitialized() {
      return persistenceCoordinator.isInitialized;
    },
    get isTutorialWorkspaceIsolated() {
      return tutorialWorkspaceSnapshot !== null;
    },
    get selectedStepData() {
      return getSelectedStepData();
    },

    // Computed getters
    getCurrentSequence: () => coreState.currentSequence,
    whenCurrentSequenceReady,
    getCurrentSequenceData,
    getSequences: () => coreState.sequences,
    getIsLoading: () => coreState.isLoading,
    getError: () => coreState.error,
    getSelectedStepIndex: () => selectionState.selectedStepIndex,
    getSelectedStepNumber: () => selectionState.selectedStepNumber,
    getSelectedSequenceId: () => coreState.selectedSequenceId,
    getRemovingStepIndex: () => animationState.removingStepIndex,
    getRemovingStepIndices: () => animationState.removingStepIndices,
    getIsClearing: () => animationState.isClearing,
    getShowStepNumbers: () => true,
    getGridMode: () => coreState.gridMode,
    getArrowPositions: () => arrowState.arrowPositions,
    getArrowPositioningInProgress: () => arrowState.arrowPositioningInProgress,
    getArrowPositioningError: () => arrowState.arrowPositioningError,
    getCurrentSteps: () =>
      coreState.currentSequence ? [...coreState.currentSequence.steps] : [],
    getSelectedStepData,
    getSelectedStep: () =>
      stepOperations.getStep(selectionState.selectedStepIndex ?? 0),
    getHasCurrentSequence: () => coreState.hasSequence,
    getSequenceCount: () => coreState.sequenceCount,
    getHasUnsavedChanges: () =>
      coreState.currentSequence !== null && coreState.sequences.length > 0,
    getHasArrowPositions: () => arrowState.hasArrowPositions,
    getArrowPositioningComplete: () => arrowState.arrowPositioningComplete,
    hasSequence: () => coreState.hasSequence,
    stepCount: () => stepOperations.getStepCount(),
    sequenceStatistics: () => transformOperations.getSequenceStatistics(),
    sequenceWord: () => transformOperations.generateSequenceWord(),
    sequenceDuration: () => transformOperations.calculateSequenceDuration(),

    // Core actions
    setCurrentSequence,
    addSequence: (sequence: SequenceData) => {
      coreState.addSequence(sequence);
      setCurrentSequence(sequence);
    },
    updateSequence: (sequence: SequenceData) =>
      coreState.updateSequence(sequence),
    removeSequence: (sequenceId: string) =>
      coreState.removeSequence(sequenceId),
    setSequences: (sequences: SequenceData[]) =>
      coreState.setSequences(sequences),
    setLoading: (loading: boolean) => coreState.setLoading(loading),
    setError: (error: string | null) => coreState.setError(error),
    clearError: () => coreState.clearError(),
    updateCurrentStep: (stepIndex: number, stepData: StepData) => {
      if (
        coreState.currentSequence &&
        stepIndex >= 0 &&
        stepIndex < coreState.currentSequence.steps.length
      ) {
        const newSteps = [...coreState.currentSequence.steps];
        newSteps[stepIndex] = stepData;
        coreState.setCurrentSequence({
          ...coreState.currentSequence,
          steps: newSteps,
        });
      }
    },

    // Selection actions
    selectStep,
    clearSelection: () => selectionState.clearSelection(),
    selectStartPositionForEditing: () => selectionState.selectStartPosition(),
    isStepSelected: (stepNumber: number) =>
      selectionState.isStepSelected(stepNumber),
    setSelectedStartPosition,

    // Grid mode
    setGridMode: (mode: GridMode) => coreState.setGridMode(mode),
    setShowStepNumbers: () => {}, // No-op, always shown

    // Arrow state
    setArrowPositions: (positions: Map<string, ArrowPosition>) =>
      arrowState.setArrowPositions(positions),
    setArrowPositioningInProgress: (inProgress: boolean) =>
      arrowState.setPositioningInProgress(inProgress),
    setArrowPositioningError: (error: string | null) =>
      arrowState.setPositioningError(error),
    getArrowPosition: (color: string) => arrowState.getArrowPosition(color),
    clearArrowPositions: () => arrowState.clearArrowPositions(),

    // Animation state - expose for undo operations
    animationState,

    resetSequenceState,
    beginTutorialWorkspace,
    restoreTutorialWorkspace,

    // Step operations - delegate to facade
    addStep: (stepData?: Partial<StepData>) => stepOperations.addStep(stepData),
    removeStep: (stepIndex: number) => stepOperations.removeStep(stepIndex),
    removeStepWithAnimation: (stepIndex: number, onComplete?: () => void) =>
      stepOperations.removeStepWithAnimation(stepIndex, onComplete),
    removeStepAndSubsequent: (stepIndex: number) =>
      stepOperations.removeStepAndSubsequent(stepIndex),
    removeStepAndSubsequentWithAnimation: (
      stepIndex: number,
      onComplete?: () => void
    ) =>
      stepOperations.removeStepAndSubsequentWithAnimation(
        stepIndex,
        onComplete
      ),
    updateStep: (stepIndex: number, stepData: Partial<StepData>) =>
      stepOperations.updateStep(stepIndex, stepData),
    insertStep: (stepIndex: number, stepData?: Partial<StepData>) =>
      stepOperations.insertStep(stepIndex, stepData),
    clearSequence: () => stepOperations.clearSequence(),
    clearSequenceCompletely,
    getStep: (index: number) => stepOperations.getStep(index),
    hasContent: () => stepOperations.hasContent(),

    // Transform operations - delegate to facade (with targetHand support)
    setStartPosition: (startPosition: StartPositionData | null) =>
      transformOperations.setStartPosition(startPosition),
    mirrorSequence: (targetHand: TargetHand = "both") =>
      transformOperations.mirrorSequence(targetHand),
    flipSequence: (targetHand: TargetHand = "both") =>
      transformOperations.flipSequence(targetHand),
    invertSequence: (targetHand: TargetHand = "both") =>
      transformOperations.invertSequence(targetHand),
    swapHands: () => transformOperations.swapHands(),
    rotateSequence: (
      direction: "clockwise" | "counterclockwise",
      targetHand: TargetHand = "both",
      rotationSteps = 1
    ) =>
      transformOperations.rotateSequence(direction, targetHand, rotationSteps),
    rewindSequence: (targetHand: TargetHand = "both") =>
      transformOperations.rewindSequence(targetHand),
    shiftStartPosition: (targetStepNumber: number) =>
      transformOperations.shiftStartPosition(targetStepNumber),
    duplicateSequence: (newName?: string) =>
      transformOperations.duplicateSequence(newName),
    validateCurrentSequence: (): ValidationResult | null =>
      transformOperations.validateSequence(),

    // Persistence
    initializeWithPersistence,
    saveCurrentState,
    saveSequenceDataOnly,
    clearPersistedState: async () => {
      // 🐛 FIX: Cancel any pending auto-save before clearing persistence
      // This prevents the auto-save from firing after clearState() and re-populating storage
      if (saveTimeout) {
        clearTimeout(saveTimeout);
        saveTimeout = null;
      }
      await persistenceCoordinator.clearState();
    },
    updateCachedActiveTab: (activeTab: BuildModeId) =>
      persistenceCoordinator.updateCachedActiveTab(activeTab),

    // Service integration
    loadSequences,
    createSequence,
    updateSequenceSteps,

    // Multi-select operations
    get selectedStepNumbers() {
      return selectionState.selectedStepNumbers;
    },
    get isMultiSelectMode() {
      return selectionState.isMultiSelectMode;
    },
    get selectionCount() {
      return selectionState.selectionCount;
    },
    enterMultiSelectMode: (stepNumber: number) =>
      selectionState.enterMultiSelectMode(stepNumber),
    exitMultiSelectMode: () => selectionState.exitMultiSelectMode(),
    toggleStepInMultiSelect: (stepNumber: number) =>
      selectionState.toggleStepInMultiSelect(stepNumber),
    selectAllSteps: (stepNumbers: number[]) =>
      selectionState.selectAllSteps(stepNumbers),
    applyClickSelection: (
      stepNumber: number,
      modifiers: { range: boolean; toggle: boolean }
    ) => selectionState.applyClickSelection(stepNumber, modifiers),
    get selectionAnchor() {
      return selectionState.selectionAnchor;
    },
  };
}

export type SequenceState = ReturnType<typeof createSequenceState>;
