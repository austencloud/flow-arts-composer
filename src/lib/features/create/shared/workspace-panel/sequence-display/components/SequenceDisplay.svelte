<script lang="ts">
  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
  import type { BuildModeId } from "$lib/shared/foundation/ui/ui-types";
  import type { SequenceState } from "../../../state/sequence-state-orchestrator.svelte";
  import { getCreateModuleContext } from "../../../context/create-module-context";
  import { navigationState } from "$lib/shared/navigation/state/navigation-state.svelte";
  import type { LetterSource } from "$lib/shared/create/domain/spell-models";
  import type {
    MandalaPathShape,
    MandalaRenderOptions,
  } from "$lib/shared/mandala/domain/mandala-types";
  import StepGrid from "./StepGrid.svelte";
  import { loopDetector as circularLoopDetector } from "$lib/features/create/generate/circular/services/loop-detector";
  import { createComponentLogger } from "$lib/shared/utils/debug-logger";
  import { getIsTimelineMode } from "../state/timeline-mode.svelte";
  import { updateStepDuration } from "../../../services/step-operations/duration-handler";
  import { UndoOperationType } from "../../../services/undo-manager";
  import {
    logConstructContextPreviewCompleted,
    logConstructContextPreviewReady,
  } from "$lib/features/create/construct/services/construct-analytics";

  let {
    sequenceState,
    onStepSelected,
    onStartPlacementSelected,
    onStepDelete,
    onStepLongPress,
    selectedStepNumber = null,
    practiceStepNumber = null,
    isSideBySideLayout = false,
    shouldOrbitAroundCenter = false,
    activeMode = null,
    currentDisplayWord = "",
    letterSources = null,
  } = $props<{
    sequenceState: SequenceState;
    onStepSelected?: (
      stepNumber: number,
      modifiers?: { range: boolean; toggle: boolean }
    ) => void;
    onStartPlacementSelected?: () => void;
    onStepDelete?: (stepNumber: number) => void;
    onStepLongPress?: () => void;
    selectedStepNumber?: number | null; // 0=start, 1=first beat, 2=second beat, etc.
    practiceStepNumber?: number | null; // 0=start, 1=first beat, 2=second beat, etc.
    isSideBySideLayout?: boolean;
    shouldOrbitAroundCenter?: boolean;
    activeMode?: BuildModeId | null;
    currentDisplayWord?: string;
    /** Optional: When provided for spell tab, enables original vs bridge letter styling */
    letterSources?: LetterSource[] | null;
  }>();

  const logger = createComponentLogger("SequenceDisplay");

  // Services
  const hapticService = getHapticFeedback();

  // Get context for UndoButton and LOOP completion
  const ctx = getCreateModuleContext();
  const { CreateModuleState, panelState } = ctx;

  // LOOP detection - uses the circular LOOPDetector singleton directly
  // (detectLOOPType + SequenceData) rather than the loop-labeler version
  // (detectLOOP + SequenceEntry)

  // Use $derived.by() to ensure Svelte tracks the getters properly
  // when sequenceState is passed as a prop (not a reactive state)
  const currentSequence = $derived.by(() => sequenceState.currentSequence);
  const selectedStartPlacement = $derived.by(
    () => sequenceState.selectedStartPlacement
  );
  const removingStepIndex = $derived.by(() =>
    sequenceState.getRemovingStepIndex()
  );
  const removingStepIndices = $derived.by(() =>
    sequenceState.getRemovingStepIndices()
  );
  const isClearing = $derived.by(() => sequenceState.getIsClearing());
  const historyTransition = $derived.by(
    () => sequenceState.animationState.historyTransition
  );
  const historyTransitionEpoch = $derived.by(
    () => sequenceState.animationState.historyTransitionEpoch
  );
  const isShiftStartMode = $derived(panelState.isShiftStartMode);
  const isTimelineMode = $derived(getIsTimelineMode());
  const optionAudition = $derived(panelState.optionAudition);

  // Duration pattern preview renders on this same editable timeline: while a
  // preview session is active, the grid shows the previewed durations without
  // touching the active sequence. Apply/cancel semantics stay with the panel.
  const isDurationPreviewMode = $derived(panelState.isDurationPreviewMode);
  const displaySequence = $derived.by(() =>
    isDurationPreviewMode && panelState.previewSequence
      ? panelState.previewSequence
      : currentSequence
  );

  // Multi-select highlight: paint every batch-selected beat with the accent
  // ring via the existing StepCell `.highlighted` mechanism. Gold `.selected`
  // stays reserved for single-select (selectedStepNumber is null in multi mode).
  const MULTI_HIGHLIGHT = {
    bg: "rgba(139, 92, 246, 0.24)",
    border: "rgba(139, 92, 246, 0.9)",
  };
  const highlightedSteps = $derived.by(() => {
    if (!sequenceState.isMultiSelectMode) return null;
    const map = new Map<number, { bg: string; border: string }>();
    for (const n of sequenceState.selectedStepNumbers) {
      map.set(n, MULTI_HIGHLIGHT);
    }
    return map;
  });

  // Reactive LOOP detection drives both the metadata rail and grid alignment.
  const loopDetectionResult = $derived.by(() => {
    if (!currentSequence) return null;
    if ((currentSequence.steps?.length ?? 0) < 2) return null;
    return circularLoopDetector.detectLOOPType(currentSequence);
  });

  // LOOP-aligned column count: align the grid to match the LOOP's slice structure
  // so that each row visually represents one slice of the circular pattern.
  const loopAlignedColumnCount = $derived.by(() => {
    // Gate on circularity, not loopType - a 6-step loop is circular
    // but may not have a recognized loopType (compound detection needs 8+ steps)
    if (!loopDetectionResult?.isCircular) return null;

    const stepCount = currentSequence?.steps?.length ?? 0;
    if (stepCount < 4) return null;

    // Try halving first. If that gives too many columns (>5), quarter instead.
    const halved = stepCount / 2;
    const columns = halved <= 5 ? halved : Math.ceil(stepCount / 4);

    if (!Number.isInteger(halved) && halved <= 5) return null;
    if (columns < 2) return null;

    return columns;
  });

  // Convert selectedStartPlacement (PictographData) to StepData format for StepGrid
  const startPlacementStep = $derived(() => {
    if (!selectedStartPlacement) return null;

    // Create StepData that extends the PictographData
    return {
      ...selectedStartPlacement,
      stepNumber: 0,
      duration: 1,
      leftReversal: false,
      rightReversal: false,
      isBlank: false,
    };
  });

  function handleStepClick(
    stepNumber: number,
    modifiers?: { range: boolean; toggle: boolean }
  ) {
    hapticService?.trigger("selection");

    // If in shift start mode, use the shift handler instead of normal selection.
    // (Spell's "move start" takes priority over range-select — shift means
    // reorder-start there, not extend-selection.)
    if (panelState.isShiftStartMode && panelState.shiftStartHandler) {
      panelState.shiftStartHandler(stepNumber);
      return;
    }

    onStepSelected?.(stepNumber, modifiers);
  }

  function handleStartPlacementClick() {
    hapticService?.trigger("selection");

    // Choose Start treats the start tile as a pose too (index 0).
    if (panelState.isShiftStartMode && panelState.shiftStartHandler) {
      panelState.shiftStartHandler(0);
      return;
    }

    onStartPlacementSelected?.();
  }

  function handleMandalaClick(
    variant: MandalaRenderOptions["show"],
    pathShape: MandalaPathShape
  ) {
    hapticService?.trigger("selection");
    sequenceState.clearSelection();
    panelState.openMandalaViewer({ variant, pathShape });
  }

  function handleDurationChange(stepNumber: number, newDuration: number) {
    hapticService?.trigger("selection");
    CreateModuleState.pushUndoSnapshot(
      UndoOperationType.MODIFY_BEAT_PROPERTIES
    );
    updateStepDuration(stepNumber, newDuration, CreateModuleState);
  }

  function handleAuditionReady(requestId: number, autoplay: boolean) {
    const audition = panelState.optionAudition;
    if (!audition || audition.requestId !== requestId) return;

    logConstructContextPreviewReady({
      stepNumber: audition.stepNumber,
      latencyMs: performance.now() - audition.activatedAt,
      autoplay,
    });
  }

  function handleAuditionCompleted(requestId: number) {
    const audition = panelState.optionAudition;
    if (!audition || audition.requestId !== requestId) return;

    logConstructContextPreviewCompleted({
      stepNumber: audition.stepNumber,
    });
  }

  function handleAuditionDismiss(requestId: number) {
    if (panelState.optionAudition?.requestId !== requestId) return;
    panelState.exitOptionAudition();
  }
</script>

<div class="sequence-container">
  <div class="content-wrapper">
    <div class="label-and-beatframe-unit">
      <div class="step-grid-wrapper" class:shift-mode={isShiftStartMode}>
        <StepGrid
          steps={displaySequence?.steps ?? []}
          arrivalSequence={displaySequence}
          {optionAudition}
          startPlacement={startPlacementStep() ?? undefined}
          onStepClick={handleStepClick}
          onStartClick={handleStartPlacementClick}
          posePicker={isShiftStartMode}
          {onStepDelete}
          {onStepLongPress}
          {selectedStepNumber}
          {removingStepIndex}
          {removingStepIndices}
          {isClearing}
          {historyTransition}
          {historyTransitionEpoch}
          {shouldOrbitAroundCenter}
          {practiceStepNumber}
          {isSideBySideLayout}
          {activeMode}
          {isTimelineMode}
          {highlightedSteps}
          onDurationChange={isDurationPreviewMode
            ? undefined
            : handleDurationChange}
          onMandalaClick={handleMandalaClick}
          onAuditionReady={handleAuditionReady}
          onAuditionCompleted={handleAuditionCompleted}
          onAuditionDismiss={handleAuditionDismiss}
          manualColumnCount={loopAlignedColumnCount}
          sequenceWord={currentDisplayWord}
          observeScroll={!panelState.workspacePlayback}
        />
      </div>
    </div>
  </div>
</div>

<style>
  .sequence-container {
    container-type: inline-size;
    container-name: sequence-workspace;
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    min-height: 0;
    overflow: visible;
    padding: 0; /* Removed padding - parent SequenceDisplay handles top spacing for word label */
    box-sizing: border-box;
    /* No transition: these are the flex ancestors of the step grid. Animating
       `all` made every workspace resize (each added step) tween layout
       properties for the whole emphasis duration. Step arrival is animated by
       StepCell's own compositor-friendly entrance. */
  }

  .content-wrapper {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    flex: 1;
    min-height: 0;
  }

  .label-and-beatframe-unit {
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 100%;
    height: 100%;
    gap: 0;
    flex: 1 1 auto;
    min-height: 0;
  }

  .step-grid-wrapper {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    flex: 1 1 auto;
    min-height: 0;
    border-radius: 12px;
    transition:
      box-shadow 0.2s ease,
      border-color 0.2s ease;
  }

  .step-grid-wrapper.shift-mode {
    box-shadow:
      0 0 0 2px rgba(6, 182, 212, 0.5),
      0 0 20px rgba(6, 182, 212, 0.2);
  }

  /* Accessibility: Respect user's motion preferences */
  @media (prefers-reduced-motion: reduce) {
    .sequence-container,
    .content-wrapper,
    .label-and-beatframe-unit,
    .step-grid-wrapper {
      transition: none;
    }
  }
</style>
