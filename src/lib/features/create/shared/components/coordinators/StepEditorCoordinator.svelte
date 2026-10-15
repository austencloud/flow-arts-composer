<!--
  StepEditorCoordinator.svelte

  The step editor view. While a step or mandala is selected the tool panel
  shows this in place of the tab's tools, the way the save view takes the
  same place (see CreationToolPanelSlot). The step grid beside it stays live.
  Handles single-beat editing, batch editing and the selected mandala viewer.

  This coordinator is separate from SequenceActionsCoordinator because:
  - Beat Editor opens directly on pictograph click (bypasses Sequence Actions)
  - Beat Editor is non-modal (allows clicking other pictographs while open)
  - Sequence Actions is for sequence-wide transforms

  Domain: Create module - Beat Editing Coordination
-->
<script lang="ts">
  import { getStepOperator } from "#lib/features/create/shared/get-step-operator.js";
  import { createStepData } from "#lib/shared/foundation/domain/factories/create-step-data.js";
  import { getHapticFeedback } from "#lib/shared/application/get-haptic-feedback.js";
  import { createComponentLogger } from "#lib/shared/utils/debug-logger.js";
  import { navigationState } from "#lib/shared/navigation/state/navigation-state.svelte.js";
  import StepEditorPanel from "../sequence-actions/StepEditorPanel.svelte";
  import { sequenceGridJoin } from "#lib/shared/grid-join/sequence-grid-join.js";
  import BatchStepEditor from "../sequence-actions/BatchStepEditor.svelte";
  import MandalaViewerPanel from "../sequence-actions/MandalaViewerPanel.svelte";
  import StepControlsZone from "../sequence-actions/StepControlsZone.svelte";
  import { Crossfade } from "#lib/shared/transitions/motion.js";
  import { DURATION } from "#lib/shared/transitions/transitions.js";
  import { selectedArrowState } from "#lib/shared/create/state/selected-arrow-state.svelte.js";
  import { getCreateModuleContext } from "../../context/create-module-context";
  import type { HapticFeedback } from "#lib/shared/application/services/haptic-feedback.js";
  import type { StepOperator } from "#lib/features/create/shared/services/step-operator.js";
  import { isStepEditorViewShown } from "../../services/step-editor-availability";
  import { getEscapeLayerManager } from "#lib/shared/keyboard/get-escape-layer-manager.js";
  import { getSequenceOverlayState } from "#lib/shared/sequence-viewer/state/sequence-viewer-overlay-state.svelte.js";
  import {
    HandSide,
    MotionType,
    RotationDirection,
  } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
  import type { PathShapeValue } from "../../services/step-operations/path-shape-handler";
  import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import { getSettings } from "#lib/shared/application/state/app-state.svelte.js";
  import { UndoOperationType } from "../../services/undo-manager";
  import {
    FLOAT_TURNS,
    stepTurns,
  } from "../../services/step-operations/turns-stepping";

  const logger = createComponentLogger("StepEditorCoordinator");

  const ctx = getCreateModuleContext();
  const { CreateModuleState, panelState, layout } = ctx;
  const isSideBySideLayout = $derived(layout.shouldUseSideBySideLayout);
  const sequenceOverlay = getSequenceOverlayState();

  // Services
  const hapticService: HapticFeedback = getHapticFeedback();
  const StepOperator: StepOperator = getStepOperator();

  // CRITICAL: Track the active tab's sequence state reactively
  // We need to access reactive properties directly to establish dependencies.
  // Without accessing the actual properties, Svelte won't know to re-evaluate.
  const activeSequenceState = $derived.by(() => {
    // Track the active tab so we re-evaluate when it changes
    const _activeTab = navigationState.activeTab;

    // Get the sequence state for the active tab
    const state = CreateModuleState.getActiveTabSequenceState();

    // Access reactive properties to establish dependencies
    // This ensures we re-evaluate when selection changes
    const _selectedStep = state.selectedStepNumber;
    const _sequence = state.currentSequence;
    const _startPos = state.selectedStartPlacement;
    // Multi-select drives the batch editor branch below — track it too.
    const _multiMode = state.isMultiSelectMode;
    const _multiSet = state.selectedStepNumbers;

    return state;
  });

  // Now this will properly update because activeSequenceState re-evaluates on selection change
  const selectedStepNumber = $derived(activeSequenceState.selectedStepNumber);

  // CRITICAL: Track selectedStartPlacement explicitly to ensure reactivity
  // when orientation changes update the start placement. Without this explicit
  // dependency, Svelte may not detect that selectedStepData needs to re-compute.
  const selectedStartPlacement = $derived.by(
    () => activeSequenceState.selectedStartPlacement
  );

  // Get current sequence with explicit reactive tracking
  const sequence = $derived.by(() => activeSequenceState.currentSequence);
  // False once a close starts: the view stays mounted while it fades out.
  const isOpen = $derived(
    isStepEditorViewShown({
      isPanelOpen: panelState.isStepEditorPanelOpen,
      activeTab: navigationState.activeTab,
      sequence,
      selectedStepNumber,
      selectedStepNumbers: activeSequenceState.selectedStepNumbers,
      hasMandalaSelection: panelState.mandalaViewerSelection !== null,
      isSequenceViewerOpen: sequenceOverlay.isOpen,
    })
  );

  // Escape leaves the editor, as it leaves the save view. Dialogs opened from
  // inside the editor sit above it and take their own Escape first.
  $effect(() => {
    if (!isOpen) return;
    return getEscapeLayerManager().register({
      id: "create:step-editor",
      canDismiss: () => true,
      dismiss: handleActiveClose,
    });
  });

  // CRITICAL FIX: Compute selectedStepData directly instead of using the getter
  // The getter on activeSequenceState is NOT reactive because it's a plain object getter.
  // We must compute the value here with explicit dependencies on reactive state.
  const selectedStepData = $derived.by(() => {
    // Access reactive properties to establish dependencies
    const startPos = selectedStartPlacement;
    const currentSeq = sequence;
    const stepNum = selectedStepNumber;

    // Step 0 = start placement. The factory fills any missing hand with an
    // invisible placeholder (both-required canonical Step shape).
    if (stepNum === 0 && startPos) {
      return createStepData({
        ...startPos,
        stepNumber: 0,
        duration: 1,
        isBlank: false,
      });
    }

    // Regular steps: stepNumber 1 = index 0, stepNumber 2 = index 1, etc.
    if (stepNum === null || stepNum < 1 || !currentSeq?.steps) {
      return null;
    }

    const stepIndex = stepNum - 1;
    return currentSeq.steps[stepIndex] ?? null;
  });

  // Animation state for deletion visualization
  const removingStepIndices = $derived.by(() =>
    activeSequenceState.getRemovingStepIndices()
  );

  const isMultiSelect = $derived(
    activeSequenceState.isMultiSelectMode &&
      activeSequenceState.selectedStepNumbers.size > 1
  );
  const batchStepNumbers = $derived.by(() =>
    Array.from(activeSequenceState.selectedStepNumbers)
      .filter((n) => n > 0)
      .sort((a, b) => a - b)
  );
  const batchSteps = $derived.by(() => {
    const seq = sequence;
    return batchStepNumbers
      .map((n) => seq?.steps?.[n - 1])
      .filter((s): s is NonNullable<typeof s> => s != null);
  });
  const totalBeats = $derived(sequence?.steps?.length ?? 0);

  // Discriminator for the view's crossfade: single-step editor vs batch
  // editor. Both bodies live in this one view, so switching modes crossfades
  // the content in place.
  const selectionMode = $derived<"single" | "multi">(
    isMultiSelect ? "multi" : "single"
  );
  // Closing clears the mandala selection at once, but the view is still
  // fading out. It keeps showing what it showed until it is gone.
  let shownMandala = $state(panelState.mandalaViewerSelection);
  $effect.pre(() => {
    const selection = panelState.mandalaViewerSelection;
    if (isOpen) shownMandala = selection;
  });
  const mandalaSelection = $derived(shownMandala);
  // The same holds for the turn controls and the single/batch choice.
  let shownControlsStep = $state(
    selectedStepNumber === 0 ? null : selectedStepData
  );
  let shownSelectionMode = $state<"single" | "multi">(selectionMode);
  $effect.pre(() => {
    const step = selectedStepNumber === 0 ? null : selectedStepData;
    const mode = selectionMode;
    if (!isOpen) return;
    shownControlsStep = step;
    shownSelectionMode = mode;
  });
  const viewMode = $derived<"editor" | "mandala">(
    mandalaSelection ? "mandala" : "editor"
  );

  // Get current prop types from settings
  const settings = $derived(getSettings());
  const leftPropType = $derived(settings.leftPropType ?? PropType.STAFF);
  const rightPropType = $derived(settings.rightPropType ?? PropType.STAFF);

  // Derived state for turns calculations
  const leftMotion = $derived(selectedStepData?.motions?.[HandSide.LEFT]);
  const rightMotion = $derived(selectedStepData?.motions?.[HandSide.RIGHT]);

  const normalizeTurns = (turns: number | string | undefined): number =>
    turns === "fl" ? -0.5 : Number(turns) || 0;

  const currentLeftTurns = $derived(normalizeTurns(leftMotion?.turns));
  const currentRightTurns = $derived(normalizeTurns(rightMotion?.turns));

  // Event handlers
  function handleClose() {
    logger.log("StepEditorCoordinator closing step editor panel");
    // Clear any selected arrow (parity with the old in-panel drawer close, which
    // ran StepEditorPanel.handleClose → selectedArrowState.clearSelection()).
    selectedArrowState.clearSelection();
    panelState.closeStepEditorPanel();
    // Clear step selection when closing the Step Editor
    activeSequenceState.clearSelection();
  }

  // Escape routes its close to the active panel's handler.
  function handleActiveClose() {
    if (mandalaSelection) {
      panelState.closeMandalaViewer();
    } else if (isMultiSelect) {
      handleBatchClose();
    } else {
      handleClose();
    }
  }

  function handleTurnsChange(color: HandSide, delta: number) {
    if (selectedStepNumber === null || !StepOperator) return;

    const motion = color === HandSide.LEFT ? leftMotion : rightMotion;
    const currentTurns =
      color === HandSide.LEFT ? currentLeftTurns : currentRightTurns;
    // Shifts may float; a motion already floating keeps that floor.
    const canFloat =
      motion?.motionType === MotionType.PRO ||
      motion?.motionType === MotionType.ANTI ||
      motion?.motionType === MotionType.FLOAT;
    const minTurns = canFloat ? FLOAT_TURNS : 0;
    const newNumericTurns = stepTurns(currentTurns, delta, minTurns);
    // A step that changes nothing leaves no undo entry and no haptic tick.
    if (newNumericTurns === currentTurns) return;
    const newTurns: number | "fl" =
      newNumericTurns === FLOAT_TURNS ? "fl" : newNumericTurns;

    hapticService?.trigger("selection");

    // Push undo snapshot BEFORE modifying
    CreateModuleState.pushUndoSnapshot(
      UndoOperationType.MODIFY_BEAT_PROPERTIES
    );

    StepOperator.updateStepTurns(
      selectedStepNumber,
      color,
      newTurns,
      CreateModuleState,
      panelState
    );
  }

  // Batch turns across every selected step. "set" writes one absolute value to
  // all; "adjust" nudges each by a delta, preserving offsets. One undo snapshot
  // wraps the whole batch; steps are applied ascending so the final orientation
  // propagation is correct. Reuses the single-step turns write path per step.
  function handleBatchTurnsChange(
    color: HandSide,
    mode: "set" | "adjust",
    amount: number | "fl"
  ) {
    if (batchStepNumbers.length === 0 || !StepOperator) return;
    hapticService?.trigger("selection");

    CreateModuleState.pushUndoSnapshot(
      UndoOperationType.MODIFY_BEAT_PROPERTIES
    );

    const seq = sequence;
    const delta = amount === "fl" ? -0.5 : amount;

    for (const stepNumber of batchStepNumbers) {
      const motion = seq?.steps?.[stepNumber - 1]?.motions?.[color];
      if (!motion) continue;

      const isShift =
        motion.motionType === MotionType.PRO ||
        motion.motionType === MotionType.ANTI;
      const minTurns = isShift ? -0.5 : 0;
      const current = motion.turns === "fl" ? -0.5 : Number(motion.turns) || 0;

      const targetRaw = mode === "set" ? delta : current + delta;
      const clamped = Math.min(3, Math.max(minTurns, targetRaw));
      const newTurns: number | "fl" = clamped === -0.5 ? "fl" : clamped;

      StepOperator.updateStepTurns(
        stepNumber,
        color,
        newTurns,
        CreateModuleState,
        panelState
      );
    }
  }

  function handleBatchClose() {
    panelState.closeStepEditorPanel();
    activeSequenceState.exitMultiSelectMode();
  }

  function handleBatchSelectAll() {
    const total = sequence?.steps?.length ?? 0;
    if (total === 0) return;
    const all: number[] = [];
    for (let n = 1; n <= total; n++) all.push(n);
    activeSequenceState.selectAllSteps(all);
  }

  function handleRotationChange(color: HandSide, direction: RotationDirection) {
    if (selectedStepNumber === null || !StepOperator) return;
    hapticService?.trigger("selection");

    // Push undo snapshot BEFORE modifying
    CreateModuleState.pushUndoSnapshot(
      UndoOperationType.MODIFY_BEAT_PROPERTIES
    );

    const directionString =
      direction === RotationDirection.CLOCKWISE ? "cw" : "ccw";
    StepOperator.updateRotationDirection(
      selectedStepNumber,
      color,
      directionString,
      CreateModuleState,
      panelState
    );
  }

  function handleOrientationChange(color: HandSide, orientation: string) {
    if (selectedStepNumber === null || !StepOperator) return;
    hapticService?.trigger("selection");

    // Push undo snapshot BEFORE modifying
    CreateModuleState.pushUndoSnapshot(
      UndoOperationType.MODIFY_BEAT_PROPERTIES
    );

    StepOperator.updateStepOrientation(
      selectedStepNumber,
      color,
      orientation,
      CreateModuleState,
      panelState
    );
  }

  function handleStepDelete() {
    if (selectedStepNumber === null || !StepOperator) {
      return;
    }
    hapticService?.trigger("warning");

    // Deleting the start placement means clearing the whole sequence — steps
    // can't exist without one. Route to the module-owned confirmed clear flow,
    // which pushes its own CLEAR_SEQUENCE undo snapshot and returns the user
    // to the start-placement picker.
    if (selectedStepNumber === 0) {
      ctx.handlers.requestClearSequence();
      return;
    }

    // No snapshot here: StepOperator.removeStep pushes its own REMOVE_BEATS
    // entry (with the step index and removed count in its metadata). Pushing
    // one here too recorded the same pre-delete state twice, so undoing a
    // single delete took two presses — the second one restored an identical
    // state while the toast still claimed it had undone something.
    //
    // For regular steps, remove the beat with animation
    // NOTE: Don't clear selection here - the animation callback in StepRemovalHandler
    // will select the appropriate next beat after the animation completes.
    // This prevents the mobile Beat Editor controls from disappearing during deletion.
    const stepIndex = selectedStepNumber - 1;
    StepOperator.removeStep(stepIndex, CreateModuleState);
  }

  function handleStepSelect(stepNumber: number) {
    hapticService?.trigger("selection");
    activeSequenceState.selectStep(stepNumber);
  }

  function handlePushUndoSnapshot() {
    CreateModuleState.pushUndoSnapshot(
      UndoOperationType.MODIFY_BEAT_PROPERTIES
    );
  }

  function handleDurationChange(newDuration: number) {
    if (
      selectedStepNumber === null ||
      selectedStepNumber === 0 ||
      !StepOperator
    )
      return;
    hapticService?.trigger("selection");

    // Push undo snapshot BEFORE modifying
    CreateModuleState.pushUndoSnapshot(
      UndoOperationType.MODIFY_BEAT_PROPERTIES
    );

    StepOperator.updateStepDuration(
      selectedStepNumber,
      newDuration,
      CreateModuleState
    );
  }

  function handlePathShapeChange(color: HandSide, shape: PathShapeValue) {
    if (selectedStepNumber === null || !StepOperator) return;
    hapticService?.trigger("selection");
    CreateModuleState.pushUndoSnapshot(
      UndoOperationType.MODIFY_BEAT_PROPERTIES
    );
    StepOperator.setStepPathShape(
      selectedStepNumber,
      color,
      shape,
      CreateModuleState
    );
  }

  function handlePathShapeClear(color: HandSide) {
    if (selectedStepNumber === null || !StepOperator) return;
    hapticService?.trigger("selection");
    CreateModuleState.pushUndoSnapshot(
      UndoOperationType.MODIFY_BEAT_PROPERTIES
    );
    StepOperator.clearStepPathShape(
      selectedStepNumber,
      color,
      CreateModuleState
    );
  }

  function handleBetaSwapToggle() {
    if (
      selectedStepNumber === null ||
      selectedStepNumber === 0 ||
      !StepOperator
    )
      return;
    hapticService?.trigger("selection");
    CreateModuleState.pushUndoSnapshot(
      UndoOperationType.MODIFY_BEAT_PROPERTIES
    );
    StepOperator.toggleBetaSwap(selectedStepNumber, CreateModuleState);
  }

  function handleStepBeatDataUpdate(updatedStepData: typeof selectedStepData) {
    if (selectedStepNumber === null || !updatedStepData) return;

    const currentSequence = activeSequenceState.currentSequence;
    if (!currentSequence) return;

    // Handle start placement (beat 0)
    if (selectedStepNumber === 0) {
      activeSequenceState.setStartPlacement({
        ...updatedStepData,
        isStartPlacement: true as const,
      });
      return;
    }

    // Handle regular steps
    const stepIndex = selectedStepNumber - 1;
    const updatedSteps = [...(currentSequence.steps ?? [])];
    updatedSteps[stepIndex] = updatedStepData;

    activeSequenceState.setCurrentSequence({
      ...currentSequence,
      steps: updatedSteps,
    });

    logger.log(`Updated beat ${selectedStepNumber} arrow adjustments`);
  }
</script>

<!--
  ONE view hosts the mandala viewer and both editor modes. The outer
  crossfade morphs viewer ↔ editor; the editor's inner crossfade handles
  single ↔ multi. Blue/red turn controls stay mounted across editor modes.

  It is a region of the page, not a dialog, so Backspace and Delete keep
  deleting the selected step from anywhere in it.
-->
<section
  class="step-editor-view"
  aria-label={mandalaSelection ? "Mandala viewer panel" : "Step editor panel"}
>
  <div class="drawer-zone">
    <Crossfade key={viewMode} fill duration={DURATION.fast}>
      {#if mandalaSelection && sequence}
        <MandalaViewerPanel
          {sequence}
          variant={mandalaSelection.variant}
          pathShape={mandalaSelection.pathShape}
          {leftPropType}
          {rightPropType}
          isMobile={!isSideBySideLayout}
          onClose={handleActiveClose}
        />
      {:else}
        <div class="editor-body">
          <div class="top-zone">
            <Crossfade key={shownSelectionMode} fill duration={DURATION.fast}>
              {#if shownSelectionMode === "multi"}
                <BatchStepEditor
                  steps={batchSteps}
                  stepNumbers={batchStepNumbers}
                  gridJoin={sequenceGridJoin(sequence)}
                  {totalBeats}
                  leftPropTypeOverride={leftPropType}
                  rightPropTypeOverride={rightPropType}
                  onClose={handleBatchClose}
                  onSelectAll={handleBatchSelectAll}
                />
              {:else}
                <StepEditorPanel
                  {isOpen}
                  {selectedStepNumber}
                  {selectedStepData}
                  {sequence}
                  {removingStepIndices}
                  onClose={handleClose}
                  onOrientationChange={handleOrientationChange}
                  onStepSelect={handleStepSelect}
                  onDelete={handleStepDelete}
                  onStepDataUpdate={handleStepBeatDataUpdate}
                  onPushUndoSnapshot={handlePushUndoSnapshot}
                  onDurationChange={handleDurationChange}
                  onBetaSwapToggle={handleBetaSwapToggle}
                />
              {/if}
            </Crossfade>
          </div>

          <!-- Persistent, morphing blue/red turn controls (single ↔ multi). -->
          <StepControlsZone
            selectionMode={shownSelectionMode}
            stacked={!isSideBySideLayout}
            compact={!isSideBySideLayout}
            stepData={shownControlsStep}
            onTurnsChange={handleTurnsChange}
            onRotationChange={handleRotationChange}
            onPathShapeChange={handlePathShapeChange}
            onPathShapeClear={handlePathShapeClear}
            {batchSteps}
            onBatchTurnsChange={handleBatchTurnsChange}
          />
        </div>
      {/if}
    </Crossfade>
  </div>
</section>

<style>
  /* Layout containment makes this view the containing block for fixed
     descendants, so the admin inspect view fills the editor's place, as it
     filled the drawer, not the whole screen. */
  .step-editor-view {
    width: 100%;
    height: 100%;
    min-height: 0;
    contain: layout;
  }

  .drawer-zone {
    position: relative;
    width: 100%;
    height: 100%;
    min-height: 0;
  }

  /* Body = crossfading top zone (grows) + persistent bottom controls. */
  .editor-body {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }

  /* Sized parent for the Crossfade (fill mode); both editor tops are height:100%
     and stack absolutely during the transition. */
  .top-zone {
    flex: 1 1 auto;
    min-height: 0;
    position: relative;
  }
</style>
