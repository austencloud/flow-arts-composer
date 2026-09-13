<!--
  StepEditorCoordinator.svelte

  Manages the shared drawer opened by workspace pictographs and mandalas.
  Handles single-beat editing and the selected mandala viewer.

  This coordinator is separate from SequenceActionsCoordinator because:
  - Beat Editor opens directly on pictograph click (bypasses Sequence Actions)
  - Beat Editor is non-modal (allows clicking other pictographs while open)
  - Sequence Actions is for sequence-wide transforms

  Domain: Create module - Beat Editing Coordination
-->
<script lang="ts">

import { getStepOperator } from "$lib/features/create/shared/get-step-operator";
  import { createStepData } from "$lib/shared/foundation/domain/factories/create-step-data";
  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
  import { createComponentLogger } from "$lib/shared/utils/debug-logger";
  import { navigationState } from "$lib/shared/navigation/state/navigation-state.svelte";
  import StepEditorPanel from "../sequence-actions/StepEditorPanel.svelte";
  import BatchStepEditor from "../sequence-actions/BatchStepEditor.svelte";
  import MandalaViewerPanel from "../sequence-actions/MandalaViewerPanel.svelte";
  import StepControlsZone from "../sequence-actions/StepControlsZone.svelte";
  import CreatePanelDrawer from "../CreatePanelDrawer.svelte";
  import Crossfade from "$lib/shared/components/Crossfade.svelte";
  import { DURATION } from "$lib/shared/transitions/transitions";
  import { selectedArrowState } from "$lib/shared/create/state/selected-arrow-state.svelte";
  import PropSelectionSheet from "$lib/shared/settings/components/tabs/prop-type/PropSelectionSheet.svelte";
  import { createGlobalChiralitySeam } from "$lib/shared/settings/components/tabs/prop-type/prop-chirality-seam";
  import { getCreateModuleContext } from "../../context/create-module-context";
  import type { HapticFeedback } from "$lib/shared/application/services/haptic-feedback";
  import type { StepOperator } from "$lib/features/create/shared/services/step-operator";
  import { canShowStepEditorDrawer } from "../../services/step-editor-availability";
  import { getSequenceOverlayState } from "$lib/shared/sequence-viewer/state/sequence-viewer-overlay-state.svelte";
  import {
    HandSide,
    MotionType,
    RotationDirection,
  } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
  import type { PathShapeValue } from "../../services/step-operations/path-shape-handler";
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import {
    getSettings,
    updateSettings,
  } from "$lib/shared/application/state/app-state.svelte";
  import { UndoOperationType } from "../../services/undo-manager";

  const logger = createComponentLogger("StepEditorCoordinator");

  // Tabs that support the Beat Editor Panel
  // Only tabs with beat sequences support individual beat editing
  const SUPPORTED_TABS = new Set(["construct", "assemble", "generate", "spell"]);

  const ctx = getCreateModuleContext();
  const { CreateModuleState, panelState, layout } = ctx;
  const isSideBySideLayout = $derived(layout.shouldUseSideBySideLayout);
  const sequenceOverlay = getSequenceOverlayState();

  // Services
  const hapticService: HapticFeedback = getHapticFeedback();
  const StepOperator: StepOperator = getStepOperator();

  // Only supported build tabs can host the editor.
  const currentTab = $derived(navigationState.activeTab);
  const isTabSupported = $derived(SUPPORTED_TABS.has(currentTab));

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
    const _startPos = state.selectedStartPosition;
    // Multi-select drives the batch editor branch below — track it too.
    const _multiMode = state.isMultiSelectMode;
    const _multiSet = state.selectedStepNumbers;

    return state;
  });

  // Now this will properly update because activeSequenceState re-evaluates on selection change
  const selectedStepNumber = $derived(activeSequenceState.selectedStepNumber);

  // CRITICAL: Track selectedStartPosition explicitly to ensure reactivity
  // when orientation changes update the start position. Without this explicit
  // dependency, Svelte may not detect that selectedStepData needs to re-compute.
  const selectedStartPosition = $derived.by(
    () => activeSequenceState.selectedStartPosition
  );

  // Get current sequence with explicit reactive tracking
  const sequence = $derived.by(() => activeSequenceState.currentSequence);
  const isOpen = $derived(
    panelState.isStepEditorPanelOpen &&
      isTabSupported &&
      canShowStepEditorDrawer({
        sequence,
        selectedStepNumber,
        selectedStepNumbers: activeSequenceState.selectedStepNumbers,
        hasMandalaSelection: panelState.mandalaViewerSelection !== null,
        isSequenceViewerOpen: sequenceOverlay.isOpen,
      })
  );

  // The viewer overlay survives Create HMR independently from this drawer.
  // If both states restore, the viewer owns the screen and clears the editor.
  $effect(() => {
    if (sequenceOverlay.isOpen && panelState.isStepEditorPanelOpen) {
      panelState.closeStepEditorPanel();
    }
  });

  // CRITICAL FIX: Compute selectedStepData directly instead of using the getter
  // The getter on activeSequenceState is NOT reactive because it's a plain object getter.
  // We must compute the value here with explicit dependencies on reactive state.
  const selectedStepData = $derived.by(() => {
    // Access reactive properties to establish dependencies
    const startPos = selectedStartPosition;
    const currentSeq = sequence;
    const stepNum = selectedStepNumber;

    // Step 0 = start position. The factory fills any missing hand with an
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

  // Discriminator for the shared-drawer crossfade: single-step editor vs batch
  // editor. Both bodies live in ONE persistent CreatePanelDrawer, so switching
  // modes crossfades the content in place instead of closing/reopening a drawer.
  const selectionMode = $derived<"single" | "multi">(
    isMultiSelect ? "multi" : "single"
  );
  const mandalaSelection = $derived(panelState.mandalaViewerSelection);
  const drawerMode = $derived<"editor" | "mandala">(
    mandalaSelection ? "mandala" : "editor"
  );

  // Re-open the editor panel when a multi-selection becomes active. Covers the
  // HMR/refresh restore path: the persisted multi set comes back but
  // selectedStepNumber is null in multi mode, so the single-step auto-open
  // effect doesn't fire. Only opens on the false→true transition (never
  // auto-closes) so it doesn't fight a manual close.
  let lastIsMulti = false;
  $effect(() => {
    const multi = isMultiSelect;
    if (multi && !lastIsMulti && isTabSupported && !sequenceOverlay.isOpen) {
      panelState.openStepEditorPanel();
    }
    lastIsMulti = multi;
  });

  // Prop selection sheet state
  let propSheetOpen = $state(false);
  let propSheetHand = $state<"left" | "right">("left");

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

  // The single shared drawer routes its close to the active panel's handler.
  function handleActiveClose() {
    // Playback temporarily hides the drawer. Its external-close notification
    // must not discard the selection that Stop will restore.
    if (panelState.workspacePlayback) return;
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
    hapticService?.trigger("selection");

    // Push undo snapshot BEFORE modifying
    CreateModuleState.pushUndoSnapshot(
      UndoOperationType.MODIFY_BEAT_PROPERTIES
    );

    const motion =
      color === HandSide.LEFT ? leftMotion : rightMotion;
    const currentTurns =
      color === HandSide.LEFT ? currentLeftTurns : currentRightTurns;
    const isShift =
      motion?.motionType === MotionType.PRO ||
      motion?.motionType === MotionType.ANTI;
    const minTurns = isShift ? -0.5 : 0;
    const newNumericTurns = Math.min(3, Math.max(minTurns, currentTurns + delta));
    const newTurns: number | "fl" =
      newNumericTurns === -0.5 ? "fl" : newNumericTurns;

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

    CreateModuleState.pushUndoSnapshot(UndoOperationType.MODIFY_BEAT_PROPERTIES);

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

  function handleRotationChange(
    color: HandSide,
    direction: RotationDirection
  ) {
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

    // Deleting the start position means clearing the whole sequence — steps
    // can't exist without one. Route to the module-owned confirmed clear flow,
    // which pushes its own CLEAR_SEQUENCE undo snapshot and returns the user
    // to the start-position picker.
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

  function handleOpenPropSheet(hand: "left" | "right") {
    propSheetHand = hand;
    propSheetOpen = true;
  }

  function handlePropSelect(propType: PropType) {
    if (propSheetHand === "left") {
      updateSettings({ leftPropType: propType });
    } else {
      updateSettings({ rightPropType: propType });
    }
  }

  function handlePushUndoSnapshot() {
    CreateModuleState.pushUndoSnapshot(
      UndoOperationType.MODIFY_BEAT_PROPERTIES
    );
  }

  function handleDurationChange(newDuration: number) {
    if (selectedStepNumber === null || selectedStepNumber === 0 || !StepOperator) return;
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
    CreateModuleState.pushUndoSnapshot(UndoOperationType.MODIFY_BEAT_PROPERTIES);
    StepOperator.setStepPathShape(selectedStepNumber, color, shape, CreateModuleState);
  }

  function handlePathShapeClear(color: HandSide) {
    if (selectedStepNumber === null || !StepOperator) return;
    hapticService?.trigger("selection");
    CreateModuleState.pushUndoSnapshot(UndoOperationType.MODIFY_BEAT_PROPERTIES);
    StepOperator.clearStepPathShape(selectedStepNumber, color, CreateModuleState);
  }

  function handleBetaSwapToggle() {
    if (selectedStepNumber === null || selectedStepNumber === 0 || !StepOperator) return;
    hapticService?.trigger("selection");
    CreateModuleState.pushUndoSnapshot(UndoOperationType.MODIFY_BEAT_PROPERTIES);
    StepOperator.toggleBetaSwap(selectedStepNumber, CreateModuleState);
  }

  function handleStepBeatDataUpdate(updatedStepData: typeof selectedStepData) {
    if (selectedStepNumber === null || !updatedStepData) return;

    const currentSequence = activeSequenceState.currentSequence;
    if (!currentSequence) return;

    // Handle start position (beat 0)
    if (selectedStepNumber === 0) {
      activeSequenceState.setStartPosition({
        ...updatedStepData,
        isStartPosition: true as const,
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

  // Debug effect to track panel visibility
  $effect(() => {
    logger.log(
      "StepEditorCoordinator panel state changed:",
      panelState.isStepEditorPanelOpen
    );
  });
</script>

<!--
  ONE persistent drawer shell hosts the mandala viewer and both editor modes.
  The outer crossfade morphs viewer ↔ editor; the editor's inner crossfade
  handles single ↔ multi. Blue/red turn controls stay mounted across editor
  modes, and the drawer close routes to whichever panel is active.
-->
<CreatePanelDrawer
  {isOpen}
  panelName="step-editor"
  fullHeightOnMobile={true}
  showHandle={true}
  closeOnBackdrop={false}
  focusTrap={false}
  autoFocus={false}
  ariaLabel={mandalaSelection ? "Mandala viewer panel" : "Step editor panel"}
  onClose={handleActiveClose}
>
  <div class="drawer-zone">
    <Crossfade key={drawerMode} fill duration={DURATION.fast}>
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
            <Crossfade key={selectionMode} fill duration={DURATION.fast}>
              {#if isMultiSelect}
                <BatchStepEditor
                  steps={batchSteps}
                  stepNumbers={batchStepNumbers}
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
            {selectionMode}
            stacked={!isSideBySideLayout}
            compact={!isSideBySideLayout}
            stepData={selectedStepNumber === 0 ? null : selectedStepData}
            onTurnsChange={handleTurnsChange}
            onRotationChange={handleRotationChange}
            onOpenPropSheet={handleOpenPropSheet}
            onPathShapeChange={handlePathShapeChange}
            onPathShapeClear={handlePathShapeClear}
            batchSteps={batchSteps}
            onBatchTurnsChange={handleBatchTurnsChange}
          />
        </div>
      {/if}
    </Crossfade>
  </div>
</CreatePanelDrawer>

<!-- Prop Selection Sheet - rendered as sibling to StepEditorPanel -->
<PropSelectionSheet
  bind:isOpen={propSheetOpen}
  selectedPropType={propSheetHand === "left" ? leftPropType : rightPropType}
  color={propSheetHand === "left" ? "blue" : "red"}
  title={propSheetHand === "left" ? "Select Left Prop" : "Select Right Prop"}
  onSelect={handlePropSelect}
  chirality={createGlobalChiralitySeam(propSheetHand)}
/>

<style>
  .drawer-zone {
    position: relative;
    width: 100%;
    height: 100%;
    min-height: 0;
  }

  /* Drawer body = crossfading top zone (grows) + persistent bottom controls. */
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
