/**
 * Create Module Type Definitions
 *
 * Centralized type definitions for CreateModule components and state.
 * Extracted from inline types in ToolPanel.svelte for better maintainability.
 */

import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import type { StartPlacementData } from "$lib/shared/foundation/domain/models/start-placement-data";
import type { BuildModeId } from "$lib/shared/foundation/ui/ui-types";
import type { SimplifiedStartPlacementState } from "$lib/shared/create/state/start-placement-state.svelte";
import type { createCreateModuleState } from "../state/create-module-state.svelte";
import type { SequenceState } from "../state/sequence-state-orchestrator.svelte";

/**
 * Create Module State type (actual state object from factory)
 * We keep it flexible with an index signature for legacy accessors.
 */
export type ICreateModuleState = ReturnType<typeof createCreateModuleState> & {
  setShowStartPlacementPickerCallback?: (callback: () => void) => void;
  setSyncPickerStateCallback?: (callback: () => void) => void;
  [key: string]: unknown;
};

// Legacy type alias for backward compatibility
/** @deprecated Use ICreateModuleState instead */
export type IBuildTabState = ICreateModuleState;

/**
 * Construct Tab State Interface
 *
 * State specific to the Construct sub-tab functionality.
 */
export interface IConstructTabState {
  // Loading and error state
  readonly isLoading: boolean;
  readonly error: string | null;
  readonly isTransitioning: boolean;
  readonly hasError: boolean;

  // Picker state
  readonly canSelectOptions: boolean;
  readonly showStartPlacementPicker: boolean | null;
  readonly shouldShowStartPlacementPicker: () => boolean | null;
  readonly isPickerStateLoading: boolean;

  // Initialization state
  readonly isInitialized: boolean;
  readonly isPersistenceInitialized: boolean;

  // Sequence state - each tab has its own independent sequence state
  readonly sequenceState: SequenceState | null;

  // Selection state
  readonly selectedStartPlacement: StartPlacementData | null;

  readonly isContinuousOnly: boolean;

  // Services
  readonly startPlacementStateService: SimplifiedStartPlacementState;

  // State mutations
  setLoading: (loading: boolean) => void;
  setTransitioning: (transitioning: boolean) => void;
  setError: (errorMessage: string | null) => void;
  clearError: () => void;
  setShowStartPlacementPicker: (show: boolean | null) => void;
  setSelectedStartPlacement: (placement: StartPlacementData | null) => void;
  setContinuousOnly: (continuous: boolean) => void;
  clearSequenceCompletely: () => Promise<void>;
  restorePickerStateAfterUndo: () => void;
  syncPickerStateWithSequence: () => void;

  // Event handlers
  handleStartPlacementSelected: (
    pictographData: PictographData | null,
    source?: "user" | "sync"
  ) => void;

  // Initialization
  initializeConstructTab: () => Promise<void>;
}

/**
 * Animation Panel State Interface
 *
 * State for animation panel collapse/expand and visibility.
 */
export interface IAnimationPanelState {
  readonly isAnimationVisible: boolean;
  readonly isAnimationCollapsed: boolean;
  toggleAnimationCollapse: () => void;
  setAnimationVisible: (visible: boolean) => void;
}

/**
 * Animation State Reference Interface
 *
 * Shared reference between AnimationPanel and AnimateControls.
 */
export interface IAnimationStateRef {
  isPlaying: boolean;
  currentStep: number;
  totalSteps: number;
  speed: number;
  shouldLoop: boolean;
  play: () => void;
  stop: () => void;
  jumpToStep: (beat: number) => void;
  setSpeed: (speed: number) => void;
  setShouldLoop: (loop: boolean) => void;
  nextStep: () => void;
  previousStep: () => void;
}

/**
 * Tool Panel Props Interface
 *
 * Props passed to ToolPanel component from parent CreateModule.
 */
export interface IToolPanelProps {
  createModuleState: ICreateModuleState;
  constructTabState: IConstructTabState;
  onOptionSelected: (option: PictographData) => Promise<void>;
  onPracticeStepIndexChange?: (index: number | null) => void;
  isSideBySideLayout?: () => boolean;
  activeTab?: BuildModeId | null;
  onTabChange?: (tab: BuildModeId) => void;
  onOpenFilters?: () => void;
  onCloseFilters?: () => void;
  isFilterPanelOpen?: boolean;
}

/**
 * Tool Panel Methods Interface
 *
 * Public methods exposed by ToolPanel component via ref binding.
 */
export interface IToolPanelMethods {
  getAnimationStateRef: () => IAnimationStateRef;
}

/**
 * Batch Edit Changes Interface
 *
 * Partial step data changes that can be applied to multiple steps at once.
 */
export type BatchEditChanges = Partial<StepData>;
