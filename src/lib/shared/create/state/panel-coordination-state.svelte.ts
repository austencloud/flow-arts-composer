/**
 * Create Module Panel Coordination State Factory
 *
 * Manages panel state for CreateModule's construction interface using Svelte 5 runes pattern.
 * Coordinates Edit Panel, Animation Panel, and Tool Panel interactions.
 *
 * **PANEL MUTUAL EXCLUSIVITY RULES:**
 * - Only ONE modal/slide panel can be open at a time
 * - Opening any panel automatically closes all other panels
 * - Panels: Edit, Animation, Share, Filter, LOOP, CreationMethod
 *
 * **PERSISTED PANEL STATES:**
 * - Sequence Actions Panel: open/closed state and mode (turns/transforms)
 * - Video Record Panel: open/closed state
 * - Export Panel Panel: open/closed state
 * - Step Editor Panel: open/closed state
 * - Save to Library Panel: open/closed state
 * Other panels reset on page refresh for predictable UX.
 *
 * Domain: Create module - Panel State Management for Sequence Construction
 * Extracted from CreateModule.svelte monolith to follow runes state management pattern.
 */

import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import type { HandRelationship } from "$lib/shared/create/domain/hand-relationship";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { LOOPType } from "$lib/shared/foundation/domain/models/generation/circular-models";
import type { LOOPComponent } from "$lib/shared/foundation/domain/models/generation/generate-models";
import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
import type { Letter } from "$lib/shared/foundation/domain/models/letter";
import type { Orientation } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import type {
  MandalaPathShape,
  MandalaRenderOptions,
} from "$lib/shared/mandala/domain/mandala-types";
import type {
  GridMode,
  GridPosition,
} from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { createPersistenceHelper } from "$lib/shared/state/utils/persistent-state";
import {
  forgetCustomizeOverlay,
  recallCustomizeScreen,
  rememberCustomizeOverlayOpen,
} from "$lib/shared/create/state/customize-overlay-hmr";
import type { CreateModuleState } from "$lib/shared/create/state/create-module-state-types";
import type { ConstructOptionAudition } from "$lib/shared/create/domain/construct-option-audition";
import { logSequenceActionsOpened } from "$lib/shared/create/analytics/sequence-action-events";
import type { SequenceActionsOpenSource } from "$lib/shared/create/domain/sequence-action-types";

// Lazy import to break circular dependency
// panel-coordination-state ↔ create-module-state-ref ↔ construct-tab-state (cycle)
let _cachedGetCreateModuleStateRef:
  | (() => CreateModuleState | null)
  | undefined;
function getCreateModuleStateRefLazy() {
  if (!_cachedGetCreateModuleStateRef) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("$lib/shared/create/state/create-module-state-ref.svelte");
    _cachedGetCreateModuleStateRef = mod.getCreateModuleStateRef;
  }
  return _cachedGetCreateModuleStateRef!();
}

// Re-export TargetHand from standalone types file for backwards compatibility
// The type is defined in domain/types/panel-types.ts to break circular dependency
// with SequenceTransformer which also needs this type
export type { TargetHand } from "$lib/shared/create/domain/panel-types";

// Import for local use
import type { TargetHand } from "$lib/shared/create/domain/panel-types";

export interface MandalaViewerSelection {
  variant: MandalaRenderOptions["show"];
  pathShape: MandalaPathShape;
}

const sequenceActionsPanelPersistence = createPersistenceHelper({
  key: "tka_sequence_actions_panel_open",
  defaultValue: false,
});

const videoRecordPanelPersistence = createPersistenceHelper({
  key: "tka_video_record_panel_open",
  defaultValue: false,
});

const exportPanelPersistence = createPersistenceHelper({
  key: "tka_export_panel_open",
  defaultValue: false,
});

const stepEditorPanelPersistence = createPersistenceHelper({
  key: "tka_step_editor_panel_open",
  defaultValue: false,
});

const saveToLibraryPanelPersistence = createPersistenceHelper({
  key: "tka_save_to_library_panel_open",
  defaultValue: false,
});

/**
 * Start/End position options - passed to the start/end options sheet
 *
 * Uses a blocklist approach for start positions:
 * - Empty blockedStartPositions = any position allowed
 * - Positions in the array are excluded from random selection
 */
export interface StartEndOptions {
  /**
   * Blocked start positions - these positions will NOT be used.
   * Empty array means all positions are allowed ("Any").
   */
  blockedStartPositions: GridPosition[];
  /**
   * @deprecated Use blockedStartPositions instead.
   * Single start position constraint (legacy - for exact position match).
   */
  startPosition: PictographData | null;
  /**
   * @deprecated Use endPositions. Kept so older persisted sessions and the
   * legacy single-select callers still resolve to a goal.
   */
  endPosition: PictographData | null;
  /**
   * Allowed end positions — the sequence must end at one of them. Empty means
   * unconstrained ("Any"), the same way an empty blockedStartPositions means
   * every start is allowed.
   *
   * Multi-select because the engine's goal has always been a `Set<string>`
   * (see SequenceBuilder.requiredEndPositions); a single target was an
   * artifact of the option surface, and a wider set is strictly more feasible
   * than one hard target.
   */
  endPositions: GridPosition[];
  mustContainLetters: Letter[];
  mustNotContainLetters: Letter[];
  /**
   * Starting orientation for the left prop. Defaults to IN ("in/in").
   * Feeds the engine's leftStartOrientation override (seeds beat 0 +
   * propagates forward). Undefined = engine default (IN).
   */
  leftStartOrientation?: Orientation;
  /**
   * Starting orientation for the right prop. Defaults to IN ("in/in").
   * Feeds the engine's rightStartOrientation override.
   */
  rightStartOrientation?: Orientation;
}

/** @deprecated Use StartEndOptions instead */
export type CustomizeOptions = StartEndOptions;

/**
 * Props for the Customize expanded overlay (Style + Start/End).
 * Rhythm was removed pending a finished rhythm-preset design; the generator
 * still honors config.durationTemplateId, there's just no customize UI for it.
 */
export interface CustomizeOverlayProps {
  constraintPreset: "smooth" | "mixed" | "choppy";
  handPathMode: "smooth" | "mixed" | "choppy";
  motionTypeFilter: "no-dash" | "prefer-dash" | null;
  startEndOptions: StartEndOptions | null;
  /** Generate vocabulary level active when the overlay opens. */
  level: number;
  gridMode: GridMode;
  isFreeformMode: boolean;
  /**
   * What "untouched" means on the host surface. Structurally identical to the
   * Customize card's CustomizeStyleBaseline; declared inline so shared state
   * doesn't have to import a feature type. Absent falls back to the production
   * defaults.
   */
  styleBaseline?: {
    constraintPreset: "smooth" | "mixed" | "choppy";
    handPathMode: "smooth" | "mixed" | "choppy";
    motionTypeFilter: "no-dash" | "prefer-dash" | null;
  };
  onConstraintPresetChange: (v: "smooth" | "mixed" | "choppy") => void;
  onHandPathModeChange: (v: "smooth" | "mixed" | "choppy") => void;
  onMotionTypeFilterChange: (v: "no-dash" | "mixed" | "prefer-dash") => void;
  /** Absent on surfaces that do not offer the row (public Composer demo). */
  handRelationship?: HandRelationship;
  handRelationshipInverted?: boolean;
  onHandRelationshipChange?: ((v: HandRelationship) => void) | null;
  onHandRelationshipInvertedChange?: ((v: boolean) => void) | null;
  matchHandTurns?: boolean;
  onMatchHandTurnsChange?: ((v: boolean) => void) | null;
  onStartEndChange: ((options: StartEndOptions) => void) | null;
  /** "Reset all" — every persisted generation setting back to first-run. */
  onResetAll: (() => void) | null;
}

export interface PanelCoordinationState {
  // Choose Start picker state. The handler receives the tapped tile index:
  // 0 for the start tile, 1..n for step tiles (the pose after that step).
  get isShiftStartMode(): boolean;
  get shiftStartHandler(): ((tileIndex: number) => void) | null;

  enterShiftStartMode(handler: (tileIndex: number) => void): void;
  exitShiftStartMode(): void;

  // Edit Panel State
  get isEditPanelOpen(): boolean;
  get editPanelStepIndex(): number | null;
  get editPanelStepData(): StepData | null;
  get editPanelStepsData(): StepData[];

  openEditPanel(stepIndex: number, stepData: StepData): void;
  openBatchEditPanel(stepsData: StepData[]): void;
  closeEditPanel(): void;

  // Animation Panel State
  get isAnimationPanelOpen(): boolean;
  set isAnimationPanelOpen(value: boolean);
  get isAnimating(): boolean;

  openAnimationPanel(): void;
  closeAnimationPanel(): void;
  setAnimating(animating: boolean): void;

  // Sequence Transform Animation State
  get shouldOrbitAroundCenter(): boolean;

  triggerOrbitAnimation(): void;

  // Export Panel State (Multi-format sharing)
  get isExportPanelOpen(): boolean;
  get requestedExportFormat(): "animation" | "static" | null;
  /** View ID that increments on each open - use with {#key} to force component remount */
  get exportPanelViewId(): number;
  /** Guard flag to prevent transient close effects when reopening */
  get isExportPanelReopening(): boolean;

  openExportPanel(format?: "animation" | "static"): void;
  closeExportPanel(): void;
  clearRequestedExportFormat(): void;

  // Save to Library Panel State
  get isSaveToLibraryPanelOpen(): boolean;

  openSaveToLibraryPanel(): void;
  closeSaveToLibraryPanel(): void;

  // Video Record Panel State
  get isVideoRecordPanelOpen(): boolean;
  set isVideoRecordPanelOpen(value: boolean);

  openVideoRecordPanel(): void;
  closeVideoRecordPanel(): void;

  // Filter Panel State
  get isFilterPanelOpen(): boolean;

  openFilterPanel(): void;
  closeFilterPanel(): void;

  // Sequence Actions Panel State
  get isSequenceActionsPanelOpen(): boolean;

  openSequenceActionsPanel(source?: SequenceActionsOpenSource): void;
  closeSequenceActionsPanel(): void;

  // Target Hand Selection (for single-hand transforms)
  get targetHand(): TargetHand;
  setTargetHand(hand: TargetHand): void;

  // Beat Editor Panel State (non-modal - allows click-through to pictographs)
  get isStepEditorPanelOpen(): boolean;
  get mandalaViewerSelection(): MandalaViewerSelection | null;

  openStepEditorPanel(): void;
  closeStepEditorPanel(): void;
  openMandalaViewer(selection: MandalaViewerSelection): void;
  closeMandalaViewer(): void;

  // Tool Panel Dimensions (for sizing other panels)
  get toolPanelHeight(): number;
  setToolPanelHeight(height: number): void;

  get toolPanelWidth(): number;
  setToolPanelWidth(width: number): void;

  // Button Panel Height (for accurate slide panel positioning)
  get buttonPanelHeight(): number;
  setButtonPanelHeight(height: number): void;

  // Navigation bar height (responsive to bottom nav safe areas)
  get navigationBarHeight(): number;
  setNavigationBarHeight(height: number): void;

  // Combined height for slide panels (tool + button)
  get combinedPanelHeight(): number;

  // Practice Mode
  get practiceStepIndex(): number | null;
  setPracticeStepIndex(index: number | null): void;

  // LOOP Panel State
  get isLOOPPanelOpen(): boolean;
  get loopSelectedComponents(): Set<LOOPComponent> | null;
  get loopCurrentType(): LOOPType | null;
  get loopOnChange(): ((loopType: LOOPType) => void) | null;

  openLOOPPanel(
    currentType: LOOPType,
    selectedComponents: Set<LOOPComponent>,
    onChange: (loopType: LOOPType) => void
  ): void;
  setLoopSelectedComponents(components: Set<LOOPComponent>): void;
  closeLOOPPanel(): void;

  // Sequence Viewer State (triggers SequenceViewerDrawerHost on mobile, /sequence/[id] on desktop)
  get isSequenceViewerOpen(): boolean;

  openSequenceViewer(): void;
  closeSequenceViewer(): void;

  // Close all panels at once (for clear sequence, etc.)
  closeAllPanels(): void;

  // Derived: Any Panel Open (for UI hiding coordination)
  get isAnyPanelOpen(): boolean;

  // Preset Drawer State
  get isPresetDrawerOpen(): boolean;
  openPresetDrawer(): void;
  closePresetDrawer(): void;

  // Customize Overlay State (Style + Rhythm + Start/End in one overlay)
  get isCustomizeOverlayOpen(): boolean;
  get customizeOverlayProps(): CustomizeOverlayProps | null;

  openCustomizeOverlay(props: CustomizeOverlayProps): void;
  closeCustomizeOverlay(): void;

  // Duration Preview Mode State (for live preview in duration pattern drawer)
  get isDurationPreviewMode(): boolean;
  get previewSequence(): SequenceData | null;
  get originalSequence(): SequenceData | null;

  enterDurationPreviewMode(sequence: SequenceData): void;
  exitDurationPreviewMode(apply: boolean): { sequence: SequenceData | null };
  setPreviewSequence(sequence: SequenceData): void;

  // Temporary contextual audition while a Construct option is held
  get optionAudition(): ConstructOptionAudition | null;
  enterOptionAudition(
    audition: Omit<ConstructOptionAudition, "requestId">
  ): void;
  exitOptionAudition(): void;

  get workspacePlayback(): {
    sequence: SequenceData;
    sourceSequenceRevision: number;
    sourceTab: string;
  } | null;
  startWorkspacePlayback(
    sequence: SequenceData,
    sourceSequenceRevision: number,
    sourceTab?: string
  ): void;
  stopWorkspacePlayback(): void;
  syncWorkspacePlaybackSource(
    sourceTab: string,
    sourceSequenceRevision: number
  ): void;

  // LOOP Completion Flow (triggers confirmation dialog in CreateModule)
  requestLoopCompletion(loopType: LOOPType): void;
  setLoopCompletionCallback(cb: (loopType: LOOPType) => void): void;
}

export function createPanelCoordinationState(): PanelCoordinationState {
  // Shift start mode state
  let isShiftStartMode = $state(false);
  let shiftStartHandler = $state<((tileIndex: number) => void) | null>(null);

  // Edit panel state
  let isEditPanelOpen = $state(false);
  let editPanelStepIndex = $state<number | null>(null);
  let editPanelStepData = $state<StepData | null>(null);
  let editPanelStepsData = $state<StepData[]>([]);

  // Animation panel state
  let isAnimationPanelOpen = $state(false);
  let isAnimating = $state(false);

  // Sequence transform animation state
  let shouldOrbitAroundCenter = $state(false);
  let orbitAnimationTimeout: ReturnType<typeof setTimeout> | null = null;

  // Export panel state (Multi-format sharing - persisted)
  let isExportPanelOpen = $state(exportPanelPersistence.load());
  let requestedExportFormat = $state<"animation" | "static" | null>(null);
  // View ID increments on each open - forces component remount to reinitialize animation
  let exportPanelViewId = $state(0);
  // Guard flag to prevent effects from seeing transient close during openExportPanel()
  let isExportPanelReopening = $state(false);

  // Save to Library panel state (persisted — survives dev HMR / refresh so the
  // panel isn't closed out from under the user mid-edit, matching export/editor)
  let isSaveToLibraryPanelOpen = $state(saveToLibraryPanelPersistence.load());

  // Video record panel state (persisted)
  let isVideoRecordPanelOpen = $state(videoRecordPanelPersistence.load());

  let isFilterPanelOpen = $state(false);

  // Sequence Actions panel state (persisted)
  let isSequenceActionsPanelOpen = $state(
    sequenceActionsPanelPersistence.load()
  );

  // Target hand selection for single-hand transforms (default: both)
  let targetHand = $state<TargetHand>("both");

  // Beat Editor panel state (non-modal - doesn't participate in closeAllPanels)
  // Persisted so a dev HMR / page refresh restores the open editor instead of
  // closing it out from under the user.
  let isStepEditorPanelOpen = $state(stepEditorPanelPersistence.load());
  let mandalaViewerSelection = $state<MandalaViewerSelection | null>(null);

  // Auto-save panel open states
  $effect.root(() => {
    $effect(() => {
      void isVideoRecordPanelOpen;
      videoRecordPanelPersistence.setupAutoSave(isVideoRecordPanelOpen);
    });

    $effect(() => {
      void isSequenceActionsPanelOpen;
      sequenceActionsPanelPersistence.setupAutoSave(isSequenceActionsPanelOpen);
    });

    $effect(() => {
      void isExportPanelOpen;
      exportPanelPersistence.setupAutoSave(isExportPanelOpen);
    });

    $effect(() => {
      void isStepEditorPanelOpen;
      stepEditorPanelPersistence.setupAutoSave(isStepEditorPanelOpen);
    });

    $effect(() => {
      void isSaveToLibraryPanelOpen;
      saveToLibraryPanelPersistence.setupAutoSave(isSaveToLibraryPanelOpen);
    });
  });

  // Tool panel dimensions tracking
  let toolPanelHeight = $state(0);
  let toolPanelWidth = $state(0);

  // Button panel height tracking
  let buttonPanelHeight = $state(0);

  // Navigation bar height tracking (default to 64px)
  let navigationBarHeight = $state(64);

  // Practice mode
  let practiceStepIndex = $state<number | null>(null);

  // LOOP panel state
  let isLOOPPanelOpen = $state(false);
  let loopSelectedComponents = $state<Set<LOOPComponent> | null>(null);
  let loopCurrentType = $state<LOOPType | null>(null);
  let loopOnChange = $state<((loopType: LOOPType) => void) | null>(null);

  // Duration preview mode state (for live preview in duration pattern drawer)
  let isDurationPreviewMode = $state(false);
  let previewSequence = $state<SequenceData | null>(null);
  let originalSequence = $state<SequenceData | null>(null);
  let optionAudition = $state<ConstructOptionAudition | null>(null);
  let optionAuditionRequestId = 0;
  let workspacePlayback = $state.raw<{
    sequence: SequenceData;
    sourceSequenceRevision: number;
    sourceTab: string;
  } | null>(null);
  let restoreStepEditorAfterPlayback = false;

  // Preset drawer state
  let isPresetDrawerOpen = $state(false);

  // Customize overlay state (Style + Rhythm + Start/End in one overlay)
  let isCustomizeOverlayOpen = $state(false);
  let customizeOverlayProps = $state<CustomizeOverlayProps | null>(null);

  // Sequence Viewer state (triggers SequenceViewerDrawerHost on mobile, /sequence/[id] on desktop)
  let isSequenceViewerOpen = $state(false);

  // LOOP completion callback (set by CreateModule to handle the confirmation dialog flow)
  let loopCompletionCallback: ((loopType: LOOPType) => void) | null = null;

  /**
   * CRITICAL: Close all panels to enforce mutual exclusivity
   * This ensures only ONE panel is open at a time, preventing state conflicts
   */
  function closeAllPanels() {
    workspacePlayback = null;
    restoreStepEditorAfterPlayback = false;
    // Exit shift start mode
    isShiftStartMode = false;
    shiftStartHandler = null;

    // Close all modal/slide panels
    isEditPanelOpen = false;
    editPanelStepIndex = null;
    editPanelStepData = null;
    editPanelStepsData = [];

    isAnimationPanelOpen = false;
    isAnimating = false;

    isExportPanelOpen = false;
    requestedExportFormat = null;
    isSaveToLibraryPanelOpen = false;
    isVideoRecordPanelOpen = false;
    isFilterPanelOpen = false;
    isSequenceActionsPanelOpen = false;
    isStepEditorPanelOpen = false;
    mandalaViewerSelection = null;

    isLOOPPanelOpen = false;
    loopSelectedComponents = null;
    loopCurrentType = null;
    loopOnChange = null;

    isCustomizeOverlayOpen = false;
    customizeOverlayProps = null;
    // Every way the overlay can close runs through here or closeCustomizeOverlay,
    // so this is where the dev-only "put it back after a hot reload" note is torn
    // up. Without it, opening some other panel would leave the note in place and
    // the next reload would reopen Customize on top of whatever you switched to.
    forgetCustomizeOverlay();

    isPresetDrawerOpen = false;

    isSequenceViewerOpen = false;
    optionAudition = null;

    cancelDurationPreview();
  }

  // Duration preview is global state, but it is driven from the Sequence
  // Actions duration subview. Every close/replace path must end it, or
  // CreationWorkspaceArea keeps rendering the preview with no editor attached.
  function cancelDurationPreview() {
    isDurationPreviewMode = false;
    previewSequence = null;
    originalSequence = null;
  }

  function stopWorkspacePlayback() {
    if (!workspacePlayback) return;
    workspacePlayback = null;
    if (restoreStepEditorAfterPlayback) isStepEditorPanelOpen = true;
    restoreStepEditorAfterPlayback = false;
  }

  return {
    // Shift Start Mode Getters
    get isShiftStartMode() {
      return isShiftStartMode;
    },
    get shiftStartHandler() {
      return shiftStartHandler;
    },

    enterShiftStartMode(handler: (tileIndex: number) => void) {
      isShiftStartMode = true;
      shiftStartHandler = handler;
    },

    exitShiftStartMode() {
      isShiftStartMode = false;
      shiftStartHandler = null;
    },

    // Edit Panel Getters
    get isEditPanelOpen() {
      return isEditPanelOpen;
    },
    get editPanelStepIndex() {
      return editPanelStepIndex;
    },
    get editPanelStepData() {
      return editPanelStepData;
    },
    get editPanelStepsData() {
      return editPanelStepsData;
    },

    openEditPanel(stepIndex: number, stepData: StepData) {
      closeAllPanels();
      editPanelStepIndex = stepIndex;
      editPanelStepData = stepData;
      editPanelStepsData = [];
      isEditPanelOpen = true;
    },

    openBatchEditPanel(stepsData: StepData[]) {
      closeAllPanels();
      editPanelStepsData = stepsData;
      editPanelStepIndex = null;
      editPanelStepData = null;
      isEditPanelOpen = true;
    },

    closeEditPanel() {
      isEditPanelOpen = false;
      editPanelStepIndex = null;
      editPanelStepData = null;
      editPanelStepsData = [];
    },

    // Animation Panel Getters
    get isAnimationPanelOpen() {
      return isAnimationPanelOpen;
    },
    set isAnimationPanelOpen(value: boolean) {
      isAnimationPanelOpen = value;
    },
    get isAnimating() {
      return isAnimating;
    },

    openAnimationPanel() {
      closeAllPanels();
      // Clear beat editor selection when opening animation panel
      const moduleState = getCreateModuleStateRefLazy();
      if (moduleState?.sequenceState) {
        moduleState.sequenceState.clearSelection();
      }
      isAnimationPanelOpen = true;
    },

    closeAnimationPanel() {
      isAnimationPanelOpen = false;
    },

    setAnimating(animating: boolean) {
      isAnimating = animating;
    },

    // Sequence Transform Animation Getters
    get shouldOrbitAroundCenter() {
      return shouldOrbitAroundCenter;
    },

    triggerOrbitAnimation() {
      // Clear any existing timeout
      if (orbitAnimationTimeout) {
        clearTimeout(orbitAnimationTimeout);
      }

      // Set flag to true to enable arc-based prop animation
      shouldOrbitAroundCenter = true;

      // Auto-reset after animation completes (200ms to match grid rotation)
      orbitAnimationTimeout = setTimeout(() => {
        shouldOrbitAroundCenter = false;
      }, 200);
    },

    // Export Panel Panel Getters
    get isExportPanelOpen() {
      return isExportPanelOpen;
    },
    get requestedExportFormat() {
      return requestedExportFormat;
    },
    get exportPanelViewId() {
      return exportPanelViewId;
    },
    get isExportPanelReopening() {
      return isExportPanelReopening;
    },

    openExportPanel(format?: "animation" | "static") {
      const wasOpen = isExportPanelOpen;
      // Set guard flag BEFORE closeAllPanels to prevent effects from seeing transient close
      isExportPanelReopening = true;
      closeAllPanels();
      // Increment viewId when transitioning from closed to open
      // This forces remount after close, ensuring clean state
      if (!wasOpen) {
        exportPanelViewId++;
      }
      requestedExportFormat = format ?? null;
      isExportPanelOpen = true;
      // Clear guard flag after open completes
      isExportPanelReopening = false;
    },

    closeExportPanel() {
      isExportPanelOpen = false;
      requestedExportFormat = null;
    },

    clearRequestedExportFormat() {
      requestedExportFormat = null;
    },

    // Save to Library Panel Getters
    get isSaveToLibraryPanelOpen() {
      return isSaveToLibraryPanelOpen;
    },

    openSaveToLibraryPanel() {
      closeAllPanels();
      isSaveToLibraryPanelOpen = true;
    },

    closeSaveToLibraryPanel() {
      isSaveToLibraryPanelOpen = false;
    },

    // Video Record Panel Getters
    get isVideoRecordPanelOpen() {
      return isVideoRecordPanelOpen;
    },
    set isVideoRecordPanelOpen(value: boolean) {
      if (value) {
        // Opening should respect mutual exclusivity rules
        closeAllPanels();
      }

      isVideoRecordPanelOpen = value;
    },

    openVideoRecordPanel() {
      closeAllPanels();
      isVideoRecordPanelOpen = true;
    },

    closeVideoRecordPanel() {
      isVideoRecordPanelOpen = false;
    },

    // Filter Panel Getters
    get isFilterPanelOpen() {
      return isFilterPanelOpen;
    },

    openFilterPanel() {
      closeAllPanels();
      isFilterPanelOpen = true;
    },

    closeFilterPanel() {
      isFilterPanelOpen = false;
    },

    // Sequence Actions Panel Getters
    get isSequenceActionsPanelOpen() {
      return isSequenceActionsPanelOpen;
    },

    openSequenceActionsPanel(source: SequenceActionsOpenSource = "unknown") {
      // Only close other panels if this panel isn't already open
      // This prevents the panel from closing when beat operations update state
      if (!isSequenceActionsPanelOpen) {
        closeAllPanels();
        logSequenceActionsOpened(source);
      }
      isSequenceActionsPanelOpen = true;
    },

    closeSequenceActionsPanel() {
      isSequenceActionsPanelOpen = false;
      cancelDurationPreview();
    },

    // Target Hand Selection
    get targetHand() {
      return targetHand;
    },

    setTargetHand(hand: TargetHand) {
      targetHand = hand;
    },

    // Beat Editor Panel Getters (non-modal)
    get isStepEditorPanelOpen() {
      return isStepEditorPanelOpen;
    },

    get mandalaViewerSelection() {
      return mandalaViewerSelection;
    },

    openStepEditorPanel() {
      // Beat Editor is non-modal - it does NOT close other panels
      // This allows the user to click on pictographs while the panel is open
      mandalaViewerSelection = null;
      isStepEditorPanelOpen = true;
    },

    closeStepEditorPanel() {
      isStepEditorPanelOpen = false;
      mandalaViewerSelection = null;
    },

    openMandalaViewer(selection: MandalaViewerSelection) {
      // The mandala uses the same non-modal drawer as the beat editor. Keeping
      // the drawer mounted lets a later pictograph click swap the editor back
      // in without closing and reopening the panel.
      mandalaViewerSelection = selection;
      isStepEditorPanelOpen = true;
    },

    closeMandalaViewer() {
      mandalaViewerSelection = null;
      isStepEditorPanelOpen = false;
    },

    // Tool Panel Dimensions
    get toolPanelHeight() {
      return toolPanelHeight;
    },

    setToolPanelHeight(height: number) {
      toolPanelHeight = height;
    },

    get toolPanelWidth() {
      return toolPanelWidth;
    },

    setToolPanelWidth(width: number) {
      toolPanelWidth = width;
    },

    // Button Panel Height
    get buttonPanelHeight() {
      return buttonPanelHeight;
    },

    setButtonPanelHeight(height: number) {
      buttonPanelHeight = height;
    },

    // Navigation Bar Height
    get navigationBarHeight() {
      return navigationBarHeight;
    },

    setNavigationBarHeight(height: number) {
      navigationBarHeight = height > 0 ? height : 64;
    },

    // Combined Height (navigation bar + tool + button panels)
    // Navigation bar is 64px (min-height from MobileNavigation.svelte)
    get combinedPanelHeight() {
      return navigationBarHeight + toolPanelHeight + buttonPanelHeight;
    },

    // Practice Mode
    get practiceStepIndex() {
      return practiceStepIndex;
    },

    setPracticeStepIndex(index: number | null) {
      practiceStepIndex = index;
    },

    // LOOP Panel Getters
    get isLOOPPanelOpen() {
      return isLOOPPanelOpen;
    },
    get loopSelectedComponents() {
      return loopSelectedComponents;
    },
    get loopCurrentType() {
      return loopCurrentType;
    },
    get loopOnChange() {
      return loopOnChange;
    },

    openLOOPPanel(
      currentType: LOOPType,
      selectedComponents: Set<LOOPComponent>,
      onChange: (loopType: LOOPType) => void
    ) {
      closeAllPanels();
      loopCurrentType = currentType;
      loopSelectedComponents = selectedComponents;
      loopOnChange = onChange;
      isLOOPPanelOpen = true;
    },

    setLoopSelectedComponents(components: Set<LOOPComponent>) {
      loopSelectedComponents = components;
    },

    closeLOOPPanel() {
      isLOOPPanelOpen = false;
      loopCurrentType = null;
      loopSelectedComponents = null;
      loopOnChange = null;
    },

    // Customize Overlay Getters
    get isCustomizeOverlayOpen() {
      return isCustomizeOverlayOpen;
    },
    get customizeOverlayProps() {
      return customizeOverlayProps;
    },

    openCustomizeOverlay(props: CustomizeOverlayProps) {
      // Held across closeAllPanels, which tears the note up — otherwise a hot
      // reload reopens the overlay on the root list instead of the screen you
      // were reading when the file was saved.
      const screen = recallCustomizeScreen();
      closeAllPanels();
      customizeOverlayProps = props;
      isCustomizeOverlayOpen = true;
      rememberCustomizeOverlayOpen(screen);
    },

    closeCustomizeOverlay() {
      isCustomizeOverlayOpen = false;
      customizeOverlayProps = null;
      forgetCustomizeOverlay();
    },

    // Preset Drawer Getters
    get isPresetDrawerOpen() {
      return isPresetDrawerOpen;
    },

    openPresetDrawer() {
      closeAllPanels();
      isPresetDrawerOpen = true;
    },

    closePresetDrawer() {
      isPresetDrawerOpen = false;
    },

    // Sequence Viewer Getters
    get isSequenceViewerOpen() {
      return isSequenceViewerOpen;
    },

    openSequenceViewer() {
      closeAllPanels();
      isSequenceViewerOpen = true;
    },

    closeSequenceViewer() {
      isSequenceViewerOpen = false;
    },

    // Close all panels at once
    closeAllPanels,

    // Derived: Check if any modal/slide panel is open
    get isAnyPanelOpen() {
      return (
        isEditPanelOpen ||
        isAnimationPanelOpen ||
        isExportPanelOpen ||
        isSaveToLibraryPanelOpen ||
        isVideoRecordPanelOpen ||
        isFilterPanelOpen ||
        isSequenceActionsPanelOpen ||
        isLOOPPanelOpen ||
        isCustomizeOverlayOpen ||
        isPresetDrawerOpen ||
        isSequenceViewerOpen
      );
    },

    // Duration Preview Mode
    get isDurationPreviewMode() {
      return isDurationPreviewMode;
    },
    get previewSequence() {
      return previewSequence;
    },
    get originalSequence() {
      return originalSequence;
    },

    enterDurationPreviewMode(sequence: SequenceData) {
      optionAudition = null;
      isDurationPreviewMode = true;
      originalSequence = sequence;
      previewSequence = sequence;
    },

    exitDurationPreviewMode(apply: boolean) {
      const result = apply ? previewSequence : originalSequence;
      isDurationPreviewMode = false;
      previewSequence = null;
      originalSequence = null;
      return { sequence: result };
    },

    setPreviewSequence(sequence: SequenceData) {
      previewSequence = sequence;
    },

    get optionAudition() {
      return optionAudition;
    },

    get workspacePlayback() {
      return workspacePlayback;
    },

    startWorkspacePlayback(
      sequence,
      sourceSequenceRevision,
      sourceTab = "construct"
    ) {
      if (!sequence.steps.length || workspacePlayback) return;
      const restoreEditor = isStepEditorPanelOpen;
      closeAllPanels();
      restoreStepEditorAfterPlayback = restoreEditor;
      // Playback gets a fixed document. An edit cannot change the motion mid-beat.
      workspacePlayback = {
        sequence: structuredClone($state.snapshot(sequence)),
        sourceSequenceRevision,
        sourceTab,
      };
    },

    stopWorkspacePlayback,

    syncWorkspacePlaybackSource(sourceTab, sourceSequenceRevision) {
      // Separate creation tabs can have the same revision counter.
      if (
        workspacePlayback &&
        (workspacePlayback.sourceTab !== sourceTab ||
          workspacePlayback.sourceSequenceRevision !== sourceSequenceRevision)
      )
        stopWorkspacePlayback();
    },

    enterOptionAudition(audition) {
      if (workspacePlayback) return;
      isDurationPreviewMode = false;
      previewSequence = null;
      originalSequence = null;
      optionAuditionRequestId += 1;
      optionAudition = {
        ...audition,
        requestId: optionAuditionRequestId,
      };
    },

    exitOptionAudition() {
      optionAudition = null;
    },

    // LOOP Completion Flow
    requestLoopCompletion(loopType: LOOPType) {
      loopCompletionCallback?.(loopType);
    },

    setLoopCompletionCallback(cb: (loopType: LOOPType) => void) {
      loopCompletionCallback = cb;
    },
  };
}
