/**
 * Create Module State Factory
 *
 * Main state orchestrator for the Create module that combines all sub-controllers
 * and provides the unified API expected by the rest of the application.
 */

import { createSequenceState } from "./sequence-state-orchestrator.svelte";
import type { SequenceState } from "./sequence-state-orchestrator.svelte";
import { createCreateModulePersistenceController } from "./create-module/persistence-controller.svelte";
import { createNavigationController } from "./create-module/navigation-controller.svelte";
import { createOptionHistoryManager } from "./create-module/option-history-manager.svelte";
import type { SequenceRepository } from "$lib/shared/create/services/sequence-repository";
import type { SequencePersister } from "$lib/features/create/shared/services/sequence-persister";
import type { SequenceStatsCalculator } from "$lib/features/create/shared/services/sequence-stats-calculator";
import type { SequenceTransformer } from "$lib/features/create/shared/services/sequence-transforms/sequence-transformer";
import type { SequenceValidator } from "$lib/features/create/shared/services/sequence-validator";
import {
  reversalDetector,
  type ReversalDetector,
} from "$lib/shared/create/services/reversal-detector";
import { navigationState } from "$lib/shared/navigation/state/navigation-state.svelte";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import type { BuildModeId } from "$lib/shared/foundation/ui/ui-types";
// ARCHIVED: AssemblerTabState import removed (Feb 2026) - files kept for reference
import type { GeneratorTabState } from "./generator-tab-state.svelte";
import type { ConstructTabState } from "./construct-tab-state.svelte";
import type { AssembleTabState } from "./assemble-tab-state.svelte";
import type { UndoController } from "./create-module/undo-controller.svelte";
import type { UndoMetadata } from "../services/undo-manager";
import type { UndoOperationType } from "../services/undo-manager";

/**
 * Creates the main Create Module state orchestrator
 *
 * @param sequenceService - Service for sequence operations
 * @param SequencePersister - Service for persistence
 * @param sequenceStatisticsService - Optional statistics service for sequence analysis
 * @param SequenceTransformer - Optional transformation service for sequence operations
 * @param sequenceValidationService - Optional validation service for sequence validation
 * @returns Unified state object with all Create module state and methods
 */
export function createCreateModuleState(
  sequenceService: SequenceRepository,
  SequencePersister?: SequencePersister,
  sequenceStatisticsService?: SequenceStatsCalculator,
  SequenceTransformer?: SequenceTransformer,
  sequenceValidationService?: SequenceValidator
) {
  function formatUndoOperation(type: UndoOperationType): string {
    return type
      .toLowerCase()
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  }

  // Create sequence state (shared/legacy - kept for backwards compatibility)
  const ReversalDetector: ReversalDetector | undefined = reversalDetector;
  const sequenceState = createSequenceState({
    sequenceService,
    ...(SequencePersister && { SequencePersister }),
    ...(sequenceStatisticsService && { sequenceStatisticsService }),
    ...(SequenceTransformer && { SequenceTransformer }),
    ...(sequenceValidationService && { sequenceValidationService }),
    ...(ReversalDetector && { ReversalDetector }),
  });

  // Create per-tab fallback sequence states
  // IMPORTANT: Each tab gets its own isolated fallback state to prevent cross-tab data pollution.
  // Previously, all tabs fell back to the shared `sequenceState`, causing data from one tab
  // (e.g., Generator) to appear in another tab (e.g., Assembler) when that tab's state was null.
  const createTabFallbackState = () =>
    createSequenceState({
      sequenceService,
      ...(SequencePersister && { SequencePersister }),
      ...(sequenceStatisticsService && { sequenceStatisticsService }),
      ...(SequenceTransformer && { SequenceTransformer }),
      ...(sequenceValidationService && { sequenceValidationService }),
      ...(ReversalDetector && { ReversalDetector }),
    });

  const constructorFallbackState = createTabFallbackState();
  const generatorFallbackState = createTabFallbackState();
  const assembleFallbackState = createTabFallbackState();

  const optionHistoryManager = createOptionHistoryManager({
    getSequence: () => sequenceState.currentSequence,
  });

  // Store tab states in closure - moved up so getSequenceStateForTab can access them
  let _constructorTabState: ConstructTabState | null = null;
  // ARCHIVED: _assemblerTabState removed (Feb 2026)
  let _generatorTabState: GeneratorTabState | null = null;
  let _assembleTabState: AssembleTabState | null = null;
  let tutorialWorkspaceActive = $state(false);
  let tutorialWorkspaceSequenceState: SequenceState | null = null;
  let tutorialWorkspaceUndoController: UndoController | null = null;

  /**
   * Get the sequence state for a specific tab
   * Used by persistence controller to save/restore the correct tab's state
   *
   * IMPORTANT: Each tab falls back to its own isolated state, NOT the shared state.
   * This prevents cross-tab data pollution where one tab's sequence appears in another tab.
   */
  function getSequenceStateForTab(tab: BuildModeId): SequenceState {
    switch (tab) {
      case "construct": {
        const ctor = _constructorTabState as {
          sequenceState?: SequenceState;
        } | null;
        return ctor?.sequenceState || constructorFallbackState;
      }
      // ARCHIVED: "assemble" case removed (Feb 2026)
      case "generate":
      case "spell": {
        // Spell mode now unified into Generate tab - route to generator state
        return _generatorTabState?.sequenceState || generatorFallbackState;
      }
      case "assemble": {
        return _assembleTabState?.sequenceState || assembleFallbackState;
      }
      default:
        return sequenceState;
    }
  }

  // Create persistence controller with tab-specific state lookup
  const persistenceController = createCreateModulePersistenceController({
    sequenceState,
    ...(SequencePersister && { SequencePersister }),
    optionHistoryManager,
    getSequenceStateForTab,
  });

  // Create navigation controller (needs persistence controller)
  const navigationController = createNavigationController({
    sequenceState,
    persistenceController,
    getConstructTabState: () => null, // Will be set later if needed
  });

  // Bootstrap activeSection from URL-driven navigation tab so it matches
  // what the user requested. Without this, activeSection defaults to
  // "construct" and the CreateModule→Navigation sync effect overwrites the
  // URL tab (e.g. "fuse") the moment persistence finishes initializing.
  const VALID_CREATE_TABS: BuildModeId[] = [
    "construct",
    "assemble",
    "generate",
    "fuse",
    "tunnel",
  ];
  const urlTab = navigationState.activeTab as BuildModeId;
  if (urlTab && VALID_CREATE_TABS.includes(urlTab)) {
    navigationController.bootstrap(urlTab);
  }

  /**
   * Initialize with persisted state
   */
  async function initializeWithPersistence() {
    await persistenceController.initialize();
  }

  function addOptionToHistory(stepIndex: number, stepData: StepData) {
    optionHistoryManager.add(stepIndex, stepData);
  }

  /**
   * Guided mode header text (for displaying in current word)
   */
  let guidedModeHeaderText = $state<string | null>(null);

  /**
   * Check if workspace is empty (no steps and no start placement)
   */
  function isWorkspaceEmpty(): boolean {
    const activeSequenceState = getActiveTabSequenceState();
    const sequence = activeSequenceState.currentSequence;
    if (!sequence) {
      return true;
    }
    const hasStep = sequence.steps && sequence.steps.length > 0;
    const hasStartPlacement =
      sequence.startingPlacement || sequence.startPlacement;
    return !hasStep && !hasStartPlacement;
  }

  function getCurrentBeatCount(): number {
    const activeSequenceState = getActiveTabSequenceState();
    return activeSequenceState.stepCount();
  }

  /**
   * Check if sequence has content (steps)
   */
  function hasSequence(): boolean {
    const activeSequenceState = getActiveTabSequenceState();
    return activeSequenceState.hasSequence();
  }

  /**
   * Check if can clear sequence
   */
  function canClearSequence(): boolean {
    const activeSequenceState = getActiveTabSequenceState();
    return activeSequenceState.hasSequence();
  }

  /**
   * Check if action buttons can be shown
   */
  function canShowActionButtons(): boolean {
    const activeSequenceState = getActiveTabSequenceState();
    const stepCount = activeSequenceState.stepCount();
    return stepCount > 0;
  }

  /**
   * Check if sequence actions button can be shown
   * Shows when there's a start placement OR steps (not just steps)
   */
  function canShowSequenceActionsButton(): boolean {
    const activeSequenceState = getActiveTabSequenceState();
    const sequence = activeSequenceState.currentSequence;
    if (!sequence) return false;

    const hasStep = sequence.steps && sequence.steps.length > 0;
    const hasStartPlacement = !!(
      sequence.startingPlacement || sequence.startPlacement
    );
    return hasStep || hasStartPlacement;
  }

  /**
   * Get the sequence state for the currently active tab
   * This allows tab-specific sequence operations (e.g., sequence actions)
   *
   * @returns The sequence state for the active tab (construct, assembler, or generator)
   */
  function getActiveTabSequenceState(): SequenceState {
    const activeTab = navigationState.activeTab as BuildModeId;
    return getSequenceStateForTab(activeTab);
  }

  /**
   * Get the undo controller for the currently active tab
   * Each tab has its own independent undo history
   *
   * @returns The undo controller for the active tab (construct, assembler, or generator)
   */
  function getActiveTabUndoController(): UndoController | null {
    const activeTab = navigationState.activeTab as BuildModeId;
    switch (activeTab) {
      case "construct": {
        return _constructorTabState?.undoController ?? null;
      }
      case "generate":
      case "spell": {
        // Spell mode now unified into Generate tab
        return _generatorTabState?.undoController || null;
      }
      case "assemble": {
        // Assemble keeps a command stack inside its builder state because its
        // edits reflow two coordinated paths rather than raw sequence records.
        return null;
      }
      default:
        return null;
    }
  }

  function beginTutorialWorkspace(): void {
    if (tutorialWorkspaceActive) {
      return;
    }

    tutorialWorkspaceActive = true;
    tutorialWorkspaceSequenceState = getSequenceStateForTab("construct");
    tutorialWorkspaceUndoController =
      _constructorTabState?.undoController ?? null;

    tutorialWorkspaceUndoController?.suspendHistory();
    tutorialWorkspaceSequenceState.beginTutorialWorkspace();
  }

  function finishTutorialWorkspace(): void {
    if (!tutorialWorkspaceActive) {
      return;
    }

    tutorialWorkspaceSequenceState?.restoreTutorialWorkspace();
    tutorialWorkspaceUndoController?.resumeHistory();

    tutorialWorkspaceSequenceState = null;
    tutorialWorkspaceUndoController = null;
    tutorialWorkspaceActive = false;
  }

  const stateObject = {
    // Sequence state - now returns active tab's sequence state
    get sequenceState() {
      return getActiveTabSequenceState();
    },

    // Navigation
    navigationController,
    get activeSection() {
      return navigationController.activeSection;
    },
    get isNavigatingBack() {
      return navigationController.isNavigatingBack;
    },
    get isUpdatingFromToggle() {
      return navigationController.isUpdatingFromToggle;
    },
    setActiveToolPanel: (panel: BuildModeId) =>
      navigationController.setActiveToolPanel(panel),

    // Persistence
    persistenceController,
    initializeWithPersistence,
    get isPersistenceInitialized() {
      return persistenceController.isInitialized;
    },
    get isTutorialWorkspaceActive() {
      return tutorialWorkspaceActive;
    },
    get isTutorialWorkspaceIsolated() {
      return (
        tutorialWorkspaceSequenceState?.isTutorialWorkspaceIsolated ?? false
      );
    },
    beginTutorialWorkspace,
    finishTutorialWorkspace,

    // Option history
    optionHistoryManager,
    addOptionToHistory,

    // Undo (tab-scoped - delegates to active tab's undo controller)
    get undoController() {
      return getActiveTabUndoController();
    },
    pushUndoSnapshot: (type: UndoOperationType, metadata?: UndoMetadata) => {
      if (tutorialWorkspaceActive) {
        return;
      }

      const activeTab = navigationState.activeTab as BuildModeId;
      if (activeTab === "assemble") {
        _assembleTabState?.assembleBuilderState.beginExternalEdit(
          metadata?.description ?? formatUndoOperation(type)
        );
        return;
      }
      const controller = getActiveTabUndoController();
      controller?.pushUndoSnapshot(type, metadata);
    },
    undo: () => {
      if (tutorialWorkspaceActive) {
        return false;
      }

      const activeTab = navigationState.activeTab as BuildModeId;
      if (activeTab === "assemble") {
        const builder = _assembleTabState?.assembleBuilderState;
        return builder?.undoStep() ?? false;
      }
      const controller = getActiveTabUndoController();
      return controller?.undo() || false;
    },
    redo: () => {
      if (tutorialWorkspaceActive) {
        return false;
      }

      const activeTab = navigationState.activeTab as BuildModeId;
      if (activeTab === "assemble") {
        return _assembleTabState?.assembleBuilderState.redoStep() ?? false;
      }
      const controller = getActiveTabUndoController();
      return controller?.redo() || false;
    },
    clearUndoHistory: () => {
      if (tutorialWorkspaceActive) {
        return;
      }

      const activeTab = navigationState.activeTab as BuildModeId;
      if (activeTab === "assemble") {
        _assembleTabState?.assembleBuilderState.clearHistory();
        return;
      }
      const controller = getActiveTabUndoController();
      controller?.clearUndoHistory();
    },
    setShowStartPlacementPickerCallback: (callback: () => void) => {
      const controller = getActiveTabUndoController();
      controller?.setShowStartPlacementPickerCallback(callback);
    },
    setSyncPickerStateCallback: (callback: () => void) => {
      const controller = getActiveTabUndoController();
      controller?.setSyncPickerStateCallback(callback);
    },
    get canUndo() {
      if (tutorialWorkspaceActive) {
        return false;
      }

      const activeTab = navigationState.activeTab as BuildModeId;
      if (activeTab === "assemble") {
        return _assembleTabState?.assembleBuilderState.canUndo || false;
      }
      const controller = getActiveTabUndoController();
      return controller?.canUndo || false;
    },
    get canRedo() {
      if (tutorialWorkspaceActive) {
        return false;
      }

      const activeTab = navigationState.activeTab as BuildModeId;
      if (activeTab === "assemble") {
        return _assembleTabState?.assembleBuilderState.canRedo || false;
      }
      const controller = getActiveTabUndoController();
      return controller?.canRedo || false;
    },
    get undoHistory() {
      if (tutorialWorkspaceActive) {
        return [];
      }

      const controller = getActiveTabUndoController();
      return controller?.undoHistory || [];
    },
    get redoHistory() {
      if (tutorialWorkspaceActive) {
        return [];
      }

      const controller = getActiveTabUndoController();
      return controller?.redoHistory || [];
    },
    jumpToState: (entryId: string) => {
      if (tutorialWorkspaceActive) {
        return false;
      }

      const controller = getActiveTabUndoController();
      return controller?.jumpToState(entryId) || false;
    },
    getTimeline: () => {
      if (tutorialWorkspaceActive) {
        return [];
      }

      const controller = getActiveTabUndoController();
      return controller?.getTimeline() || [];
    },
    getOperationDescription: (type: UndoOperationType) => {
      if ((navigationState.activeTab as BuildModeId) === "assemble") {
        return formatUndoOperation(type);
      }
      const controller = getActiveTabUndoController();
      return controller?.getOperationDescription(type) || "Unknown";
    },

    // Workspace state queries
    isWorkspaceEmpty,
    getCurrentBeatCount,
    hasSequence,
    canClearSequence,
    canShowActionButtons,
    canShowSequenceActionsButton,
    get canAccessEditTab() {
      const activeSequenceState = getActiveTabSequenceState();
      return activeSequenceState.stepCount() > 0;
    },

    // Guided mode
    get guidedModeHeaderText() {
      return guidedModeHeaderText;
    },
    setGuidedModeHeaderText: (text: string | null) => {
      guidedModeHeaderText = text;
    },

    // Tab-aware sequence access
    getActiveTabSequenceState,

    // Tab states (will be attached by initialization service)
    get constructorTabState() {
      return _constructorTabState;
    },
    set constructorTabState(value: ConstructTabState | null) {
      _constructorTabState = value;
    },
    constructTabState: null as ConstructTabState | null, // Legacy accessor - will be set by initializer
    // ARCHIVED: assemblerTabState, assemblyUndoRef, assemblyBackRef removed (Feb 2026)
    get generatorTabState() {
      return _generatorTabState;
    },
    set generatorTabState(value: GeneratorTabState | null) {
      _generatorTabState = value;
    },
    // REMOVED: spellTabState - Spell mode now unified into Generate tab (Feb 2026)
    // Spell functionality accessible via Generate tab's Freeform/Spell mode toggle
    // Kept as null getter for backwards compat with any remaining references
    get spellTabState(): null {
      return null;
    },
    get assembleTabState() {
      return _assembleTabState;
    },
    set assembleTabState(value: AssembleTabState | null) {
      _assembleTabState = value;
    },
  };

  return stateObject;
}

export type CreateModuleState = ReturnType<typeof createCreateModuleState>;
