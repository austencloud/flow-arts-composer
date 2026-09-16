<!--
  StepEditorPanel.svelte

  Panel for editing individual steps (turns, rotation, orientation).
  Opens directly when clicking a pictograph, or via "Edit Turns" in Sequence Actions.
  Non-modal - allows clicking through to other pictographs while open.

  Mobile: Full-height panel with step grid at top, stacked controls at bottom
  Desktop: Side panel with pictograph preview, horizontal controls
-->
<script lang="ts">
  import PictographContainer from "$lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import PropPlacementGrid from "$lib/shared/pictograph/grid/components/PropPlacementGrid.svelte";
  import type { PlacementMotionMove } from "$lib/shared/pictograph/grid/state/prop-placement-motion.svelte";
  import type { PropPlacementChange } from "$lib/shared/pictograph/grid/domain/prop-placement";
  import StartPlacementEditMode from "./StartPlacementEditMode.svelte";
  import DurationControl from "./DurationControl.svelte";
  import PictographInspectModal from "./PictographInspectModal.svelte";
  import ArrowAdjustmentPanel from "./ArrowAdjustmentPanel.svelte";
  import ArrowAdjustmentHistory from "./ArrowAdjustmentHistory.svelte";
  import StepEditorTour from "$lib/shared/onboarding/components/step-editor-tour/StepEditorTour.svelte";
  import { stepEditorTourState } from "$lib/shared/onboarding/state/step-editor-tour-state.svelte";
  import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import { isVisibleMotion } from "$lib/shared/pictograph/shared/domain/models/motion-data";
  import {
    HandSide,
    Orientation,
  } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
  import {
    GridLocation,
    GridMode,
  } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
  import { deriveGridMode } from "$lib/shared/pictograph/grid/services/grid-mode-deriver";
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import { isAdmin } from "$lib/shared/auth/state/auth-state.svelte";
  import { getSettings } from "$lib/shared/application/state/app-state.svelte";
  import { getCreateModuleContext } from "../../context/create-module-context";
  import { selectedArrowState } from "$lib/shared/create/state/selected-arrow-state.svelte";
  import { UndoOperationType } from "$lib/features/create/shared/services/undo-manager";
  import {
    getShortestRotationStepsBetweenLocations,
    rotateLocation,
  } from "$lib/shared/create/services/rotation-helpers";
  import { setGridRotationDirection } from "$lib/shared/pictograph/grid/state/grid-rotation-state.svelte";
  import { createPersistenceHelper } from "$lib/shared/state/utils/persistent-state";
  import { onMount } from "svelte";

  // Persist whether the inspect modal is open so a dev HMR / page refresh
  // restores it instead of closing it. load() re-reads localStorage on every
  // remount, which is exactly what survives the HMR teardown of this component.
  const inspectModalPersistence = createPersistenceHelper<boolean>({
    key: "tka_inspect_modal_open",
    defaultValue: false,
  });

  interface Props {
    isOpen: boolean;
    selectedStepNumber: number | null;
    selectedStepData: StepData | null;
    sequence?: SequenceData | null;
    removingStepIndices?: Set<number>;
    onClose: () => void;
    onOrientationChange: (color: HandSide, orientation: string) => void;
    onStepSelect?: (stepNumber: number) => void;
    onDelete?: () => void;
    onStepDataUpdate?: (updatedStepData: StepData) => void;
    onPushUndoSnapshot?: () => void;
    onDurationChange?: (newDuration: number) => void;
    onBetaSwapToggle?: () => void;
  }

  let {
    isOpen,
    selectedStepNumber,
    selectedStepData,
    sequence = null,
    removingStepIndices = new Set<number>(),
    onClose,
    onOrientationChange,
    onStepSelect,
    onDelete,
    onStepDataUpdate,
    onPushUndoSnapshot,
    onDurationChange,
    onBetaSwapToggle,
  }: Props = $props();

  // Track if an arrow is selected for showing adjustment panel
  const hasArrowSelected = $derived(selectedArrowState.selectedArrow !== null);

  // Get layout context for responsive behavior
  const ctx = getCreateModuleContext();
  const { CreateModuleState, layout, panelState } = ctx;
  const activeSequenceState = $derived.by(() =>
    CreateModuleState.getActiveTabSequenceState()
  );
  const isSideBySideLayout = $derived(layout.shouldUseSideBySideLayout);
  let editorWidth = $state(0);
  let editorHeight = $state(0);
  // A landscape phone leaves the right-side editor almost square. Focused
  // controls keep one prop usable at a time without shrinking the placement
  // board into a decorative strip.
  const isShortWideEditor = $derived(
    editorWidth > 0 && editorHeight > 0 && editorHeight <= 520
  );
  const startPlacementHitTargetRadius = $derived(
    isShortWideEditor ? 160 : isSideBySideLayout ? 75 : 85
  );

  // Hold onto previous step data during transitions
  // This prevents layout flicker when deleting steps - the controls stay visible
  // with the old data until the new step is selected, then CSS transitions
  // smoothly animate the pictograph elements to their new positions
  let displayedStepData = $state<StepData | null>(null);
  let displayedStepNumber = $state<number | null>(null);

  $effect(() => {
    // Only update displayed data when we have actual new data
    // When selectedStepData becomes null (during deletion), keep showing previous
    if (selectedStepData !== null) {
      displayedStepData = selectedStepData;
    }
    if (selectedStepNumber !== null) {
      displayedStepNumber = selectedStepNumber;
    }
  });

  // Reset displayed data when panel closes to avoid stale data on next open.
  // The inspect modal is subordinate to the editor: if the editor isn't open,
  // force the modal closed so a persisted-open flag can't pop it on the next
  // step click. On a refresh that restored the editor, isOpen is already true
  // here, so a restored inspect modal survives.
  $effect(() => {
    if (!isOpen) {
      displayedStepData = null;
      displayedStepNumber = null;
      showInspectModal = false;
    }
  });

  // Derived state - use displayed values for rendering to prevent flicker
  // Data, not just a step number. The preview section is gated on both, so a
  // number without data used to render the controls alone — floating at the top
  // of the panel over an empty board area. "Select a step to edit" is the honest
  // state there, and it is one the panel already draws.
  const hasSelection = $derived(
    displayedStepNumber !== null && displayedStepData !== null
  );
  const isStartPlacementSelected = $derived(displayedStepNumber === 0);
  const startLeftMotion = $derived(displayedStepData?.motions?.[HandSide.LEFT]);
  const startRightMotion = $derived(
    displayedStepData?.motions?.[HandSide.RIGHT]
  );
  const startLeftLocation = $derived(
    isVisibleMotion(startLeftMotion) ? startLeftMotion.startLocation : null
  );
  const startRightLocation = $derived(
    isVisibleMotion(startRightMotion) ? startRightMotion.startLocation : null
  );
  const startGridMode = $derived.by(() => {
    if (isVisibleMotion(startLeftMotion) && isVisibleMotion(startRightMotion)) {
      return deriveGridMode(startLeftMotion, startRightMotion);
    }

    return (
      displayedStepData?.gridMode ??
      startLeftMotion?.gridMode ??
      startRightMotion?.gridMode ??
      GridMode.DIAMOND
    );
  });
  const startLeftPropType = $derived.by(
    () =>
      getSettings().leftPropType ?? startLeftMotion?.propType ?? PropType.STAFF
  );
  const startRightPropType = $derived.by(
    () =>
      getSettings().rightPropType ??
      startRightMotion?.propType ??
      PropType.STAFF
  );
  const canAimStartPlacement = $derived(
    isStartPlacementSelected &&
      startLeftLocation !== null &&
      startRightLocation !== null
  );
  const startPlacementUsesCenter = $derived(
    startLeftLocation === GridLocation.CENTER ||
      startRightLocation === GridLocation.CENTER
  );
  let placementGrid = $state<ReturnType<typeof PropPlacementGrid> | null>(null);
  let activeMoveHand = $state<HandSide | null>(null);
  let isRepositioning = $state(false);
  let placementResetEpoch = $state(0);
  let placementMotionMove = $state<PlacementMotionMove | null>(null);

  const stepLabel = $derived.by(() => {
    if (displayedStepNumber === null) return "";
    return displayedStepNumber === 0
      ? "Start Placement"
      : `Step ${displayedStepNumber}`;
  });

  // Calculate how many subsequent steps would be affected by orientation changes
  // This helps users understand cascade impact when editing turns on mobile
  const cascadeCount = $derived.by(() => {
    if (displayedStepNumber === null || !sequence?.steps) return 0;
    // Start placement affects all steps, regular steps affect subsequent ones
    if (displayedStepNumber === 0) {
      return sequence.steps.length;
    }
    // Steps after the selected one (stepNumber 1 = index 0, so steps after index (n-1))
    return Math.max(0, sequence.steps.length - displayedStepNumber);
  });

  // Track sequence changes to trigger pulse animation when cascade occurs
  // We watch the sequence's steps array - when it changes and we have cascade steps,
  // that means orientation propagated through subsequent steps
  let lastSequenceVersion = $state(0);
  let showCascadePulse = $state(false);

  // Create a simple version number that changes when sequence steps change
  const sequenceVersion = $derived.by(() => {
    if (!sequence?.steps) return 0;
    // Use a combination that changes when any step's orientation changes
    return sequence.steps.reduce((acc, step, idx) => {
      const left = step?.motions?.[HandSide.LEFT];
      const right = step?.motions?.[HandSide.RIGHT];
      const leftTurnsNum =
        left?.turns === "fl" ? -0.5 : Number(left?.turns ?? 0);
      const rightTurnsNum =
        right?.turns === "fl" ? -0.5 : Number(right?.turns ?? 0);
      return acc + idx * 1000 + leftTurnsNum * 100 + rightTurnsNum * 10;
    }, sequence.steps.length);
  });

  $effect(() => {
    // Only pulse when:
    // 1. We have cascade steps (cascadeCount > 0)
    // 2. The sequence version changed (turns/orientations updated)
    // 3. This isn't the initial load (lastSequenceVersion !== 0)
    // 4. Panel is open and we're not on start placement
    if (
      cascadeCount > 0 &&
      sequenceVersion !== lastSequenceVersion &&
      lastSequenceVersion !== 0 &&
      isOpen &&
      !isStartPlacementSelected
    ) {
      showCascadePulse = true;
      const timeout = setTimeout(() => {
        showCascadePulse = false;
      }, 300);
      lastSequenceVersion = sequenceVersion;
      return () => clearTimeout(timeout);
    }
    lastSequenceVersion = sequenceVersion;
    return undefined;
  });

  // Trigger step editor tour on first open with a selection
  $effect(() => {
    if (isOpen && hasSelection) {
      stepEditorTourState.triggerIfFirstTime();
    }
  });

  // Which section to highlight during tour
  const tourHighlight = $derived(
    stepEditorTourState.isActive
      ? (
          {
            welcome: "all",
            preview: "preview",
            turns: "turns",
            duration: "duration",
          } as const
        )[stepEditorTourState.currentStop]
      : "none"
  );

  // Beta swap state — both hands end at same location. Invisible placeholder =
  // hand not really there (both-required Step shape): not a beta placement.
  const isBetaPlacement = $derived.by(() => {
    if (!displayedStepData || isStartPlacementSelected) return false;
    const left = displayedStepData.motions?.[HandSide.LEFT];
    const right = displayedStepData.motions?.[HandSide.RIGHT];
    return !!(
      isVisibleMotion(left) &&
      isVisibleMotion(right) &&
      left.endLocation === right.endLocation
    );
  });
  const isBetaSwapped = $derived(!!displayedStepData?.betaSwapped);

  // Keyboard handler for B key beta swap toggle
  function handleBetaSwapKeydown(event: KeyboardEvent) {
    if (event.key.toLowerCase() !== "b") return;
    if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey)
      return;
    if (!isOpen || !hasSelection || isStartPlacementSelected) return;
    if (!isBetaPlacement) return;
    if (hasArrowSelected) return;
    const target = event.target as HTMLElement;
    if (
      target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.isContentEditable
    )
      return;
    event.preventDefault();
    onBetaSwapToggle?.();
  }

  onMount(() => {
    window.addEventListener("keydown", handleBetaSwapKeydown);
    return () => window.removeEventListener("keydown", handleBetaSwapKeydown);
  });

  // Inspect modal state (admin-only) — persisted across HMR / refresh.
  let showInspectModal = $state(inspectModalPersistence.load());

  $effect(() => {
    void showInspectModal;
    inspectModalPersistence.setupAutoSave(showInspectModal);
  });

  function handleClose() {
    selectedArrowState.clearSelection();
    onClose();
  }

  function handleStepClick(stepNumber: number) {
    onStepSelect?.(stepNumber);
  }

  function handleOpenInspect() {
    showInspectModal = true;
  }

  function handleCloseInspect() {
    showInspectModal = false;
  }

  function handleStepDataUpdate(updatedStepData: StepData) {
    // Forward to parent for persistence
    onStepDataUpdate?.(updatedStepData);
    // Also update the displayed step data locally for immediate visual feedback
    displayedStepData = updatedStepData;
  }

  function handlePlacementChange(change: PropPlacementChange) {
    activeMoveHand = change.activeHand;
  }

  function handleMoveProp(color: HandSide) {
    if (isRepositioning || startPlacementUsesCenter) return;
    placementGrid?.moveProp(color);
  }

  async function rotateStartPlacementLocation(
    color: HandSide,
    direction: "clockwise" | "counterclockwise",
    rotationSteps: number,
    targetLocation: GridLocation,
    animateFromLocation: GridLocation | null = null
  ) {
    if (
      !isStartPlacementSelected ||
      isRepositioning ||
      startPlacementUsesCenter ||
      rotationSteps < 1
    ) {
      return;
    }

    const targetHand = color === HandSide.LEFT ? "left" : "right";
    const directionStep = direction === "clockwise" ? 1 : -1;
    isRepositioning = true;
    activeMoveHand = null;
    CreateModuleState.pushUndoSnapshot(UndoOperationType.ROTATE_SEQUENCE);
    setGridRotationDirection(directionStep);

    try {
      await activeSequenceState.rotateSequence(
        direction,
        targetHand,
        rotationSteps
      );

      const updatedLocation =
        activeSequenceState.selectedStartPlacement?.motions?.[color]
          ?.startLocation;
      if (updatedLocation !== targetLocation) {
        placementResetEpoch += 1;
      } else if (animateFromLocation !== null) {
        // Rotate-arrow moves play in place: the moving prop arcs a
        // pro-with-zero-turns path around the center while the partner
        // resolves its beta offset. Drag moves skip this — the finger
        // already carried the prop.
        placementMotionMove = {
          epoch: (placementMotionMove?.epoch ?? 0) + 1,
          color,
          from: animateFromLocation,
          to: targetLocation,
          direction,
        };
      }
    } finally {
      isRepositioning = false;
    }
  }

  async function handleLocationRotate(
    color: HandSide,
    direction: "clockwise" | "counterclockwise"
  ) {
    const currentLocation =
      color === HandSide.LEFT ? startLeftLocation : startRightLocation;
    if (currentLocation === null || currentLocation === GridLocation.CENTER) {
      return;
    }

    // Rotate by 90° (two 45° steps), never 45°: a single step moves the prop
    // between the cardinal and intercardinal families, silently skewing the
    // grid mode. Locations stay gated to the current mode, same as the
    // placement grid's point set.
    const directionStep = direction === "clockwise" ? 2 : -2;
    const targetLocation = rotateLocation(
      currentLocation,
      directionStep
    ) as GridLocation;
    await rotateStartPlacementLocation(
      color,
      direction,
      2,
      targetLocation,
      currentLocation
    );
  }

  async function handlePlacementComplete(leftLocation, rightLocation) {
    if (
      !isStartPlacementSelected ||
      isRepositioning ||
      startLeftLocation === null ||
      startRightLocation === null
    ) {
      return;
    }

    const leftChanged = leftLocation !== startLeftLocation;
    const rightChanged = rightLocation !== startRightLocation;

    // Move mode changes one prop at a time. Pressing an occupied prop before an
    // aim drag also publishes the current pair, which is intentionally a no-op.
    if (!leftChanged && !rightChanged) return;
    if (leftChanged === rightChanged) {
      placementResetEpoch += 1;
      return;
    }

    const targetColor = leftChanged ? HandSide.LEFT : HandSide.RIGHT;
    const previousLocation = leftChanged
      ? startLeftLocation
      : startRightLocation;
    const targetLocation = leftChanged ? leftLocation : rightLocation;
    const rotationSteps = getShortestRotationStepsBetweenLocations(
      previousLocation,
      targetLocation
    );

    if (rotationSteps === null || rotationSteps === 0) {
      placementResetEpoch += 1;
      return;
    }

    const direction = rotationSteps > 0 ? "clockwise" : "counterclockwise";
    await rotateStartPlacementLocation(
      targetColor,
      direction,
      Math.abs(rotationSteps),
      targetLocation
    );
  }
</script>

<div
  class="editor-panel"
  class:desktop={isSideBySideLayout}
  class:tour-active={stepEditorTourState.isActive}
  bind:clientWidth={editorWidth}
  bind:clientHeight={editorHeight}
>
  <!-- Step Editor Tour overlay -->
  <StepEditorTour />

  <!-- Header -->
  <header class="panel-header" class:tour-dim={tourHighlight !== "none"}>
    <div class="header-info">
      <h2>Step Editor</h2>
      <span class="subtitle">
        {stepLabel}
        {#if cascadeCount > 0 && !isStartPlacementSelected}
          <span class="cascade-indicator" class:pulse={showCascadePulse}>
            → +{cascadeCount} step{cascadeCount === 1 ? "" : "s"}
          </span>
        {/if}
        {#if isBetaPlacement && isBetaSwapped}
          <button
            class="beta-swap-badge active"
            onclick={() => onBetaSwapToggle?.()}
            data-ghost={onBetaSwapToggle ? "safe" : undefined}
            data-ghost-kind={onBetaSwapToggle ? "step-edit" : undefined}
            data-ghost-label="Beta swap"
            title="Beta offset swapped (B to toggle)"
            aria-label="Beta offset swapped, press B to toggle"
            aria-pressed="true">β⇄</button
          >
        {:else if isBetaPlacement}
          <button
            class="beta-swap-badge"
            onclick={() => onBetaSwapToggle?.()}
            data-ghost={onBetaSwapToggle ? "safe" : undefined}
            data-ghost-kind={onBetaSwapToggle ? "step-edit" : undefined}
            data-ghost-label="Beta swap"
            title="Swap beta offset (B)"
            aria-label="Swap beta offset, press B to toggle"
            aria-pressed="false">β⇄</button
          >
        {/if}
      </span>
    </div>

    <!-- Arrow adjustment panel in header when arrow is selected -->
    {#if isAdmin() && hasArrowSelected && displayedStepData}
      <ArrowAdjustmentPanel
        stepData={displayedStepData}
        onStepDataUpdate={handleStepDataUpdate}
        {onPushUndoSnapshot}
        keyboardActive={!showInspectModal}
      />
      <ArrowAdjustmentHistory />
    {/if}

    <div class="header-actions">
      {#if isAdmin() && hasSelection && displayedStepData}
        <button
          class="icon-btn inspect"
          onclick={handleOpenInspect}
          aria-label="Inspect pictograph data"
          title="Inspect pictograph data (dev)"
        >
          <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
        </button>
      {/if}
      <!-- No delete button on the start placement: with only a start placement
           the user can already edit it in place, and "deleting" it means
           clearing the whole sequence — that lives on the Clear button. -->
      {#if onDelete && hasSelection && !isStartPlacementSelected}
        <button
          class="icon-btn delete"
          onclick={() => onDelete()}
          aria-label="Delete step"
          title="Delete this step"
        >
          <i class="fa-solid fa-trash" aria-hidden="true"></i>
        </button>
      {/if}
      <button
        class="icon-btn close"
        onclick={handleClose}
        aria-label="Close step editor"
      >
        <i class="fas fa-times" aria-hidden="true"></i>
      </button>
    </div>
  </header>

  <div class="editor-content">
    <!-- Pictograph Preview - shown on both mobile and desktop when beat selected -->
    <!-- Duration is now rendered INSIDE the pictograph via DurationGlyph -->
    {#if hasSelection && displayedStepData}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="preview-section"
        class:mobile={!isSideBySideLayout}
        class:tour-highlight={tourHighlight === "preview"}
        class:tour-dim={tourHighlight !== "none" && tourHighlight !== "preview"}
        onclick={(e) => {
          if (
            hasArrowSelected &&
            !(e.target as HTMLElement).closest('[role="button"]')
          ) {
            selectedArrowState.clearSelection();
          }
        }}
      >
        <div class="pictograph-container" class:aiming={canAimStartPlacement}>
          {#if canAimStartPlacement && startLeftLocation && startRightLocation}
            <div class="start-placement-aim" data-swipe-block>
              <PropPlacementGrid
                bind:this={placementGrid}
                gridMode={startGridMode}
                leftPropType={startLeftPropType}
                rightPropType={startRightPropType}
                leftOrientation={startLeftMotion?.startOrientation ??
                  Orientation.IN}
                rightOrientation={startRightMotion?.startOrientation ??
                  Orientation.IN}
                initialLeftLocation={startLeftLocation}
                initialRightLocation={startRightLocation}
                betaSwapped={displayedStepData.betaSwapped}
                previewPictographData={displayedStepData}
                resetEpoch={placementResetEpoch}
                motionMove={placementMotionMove}
                showCenter={startPlacementUsesCenter}
                editAfterCompletion
                disabled={isRepositioning}
                showUndo={false}
                renderTray={false}
                hitTargetRadius={startPlacementHitTargetRadius}
                onChange={handlePlacementChange}
                onPlacementComplete={handlePlacementComplete}
                {onOrientationChange}
              />
            </div>
          {:else}
            <PictographContainer
              pictographData={displayedStepData}
              arrowsClickable={isAdmin()}
              disableTransitions={true}
            />
          {/if}
        </div>
      </div>
    {/if}

    <!-- Controls - different layout for mobile vs desktop -->
    <div
      class="controls-section"
      class:mobile={!isSideBySideLayout}
      class:duration-only={hasSelection && !isStartPlacementSelected}
    >
      {#if !hasSelection}
        <div class="no-selection">
          <i class="fas fa-hand-pointer" aria-hidden="true"></i>
          <p>Select a step to edit</p>
        </div>
      {:else if isStartPlacementSelected}
        <StartPlacementEditMode
          startPlacementData={displayedStepData}
          stacked={!isSideBySideLayout}
          compact={!isSideBySideLayout || isShortWideEditor}
          focused={isShortWideEditor}
          {activeMoveHand}
          repositionDisabled={startPlacementUsesCenter}
          {isRepositioning}
          {onOrientationChange}
          onLocationRotate={handleLocationRotate}
          onMoveProp={handleMoveProp}
        />
      {:else}
        {#if onDurationChange}
          <div
            class="tour-section"
            class:tour-highlight={tourHighlight === "duration"}
            class:tour-dim={tourHighlight !== "none" &&
              tourHighlight !== "duration"}
          >
            <DurationControl
              duration={displayedStepData?.duration ?? 1}
              compact={!isSideBySideLayout}
              {onDurationChange}
            />
          </div>
        {/if}
        <!-- Blue/red turns controls now live in the shared, persistent
             StepControlsZone (rendered by the coordinator below this panel), so
             they morph across single ↔ multi instead of being rebuilt here. -->
      {/if}
    </div>
  </div>
</div>

<!-- Inspect view (admin-only). Guard on a valid step + admin so a persisted
     open flag can't restore an empty view or surface it to non-admins.

     Deliberately a SIBLING of .editor-panel, not a child. The inspector fills
     the drawer, and .editor-panel declares `container-type: size` — which makes
     it a containing block for fixed descendants as well as absolute ones, and
     it is only the editor's 716px top zone. Mounting inside it would shrink the
     inspector to less than the dialog it used to cover. -->
<PictographInspectModal
  show={showInspectModal && isAdmin() && !!displayedStepData}
  stepData={displayedStepData}
  onClose={handleCloseInspect}
/>

<style>
  .editor-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
    position: relative;
    container-type: size;
    container-name: step-editor;
    /* Whole panel is swipe-draggable — show the grab affordance everywhere */
    cursor: grab;
  }

  .editor-content {
    display: flex;
    flex: 1 1 0;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
  }

  /* Restore natural cursors on elements that need their own (cursor inherits) */
  .editor-panel :global(input),
  .editor-panel :global(textarea),
  .editor-panel :global(select),
  .editor-panel :global([role="slider"]),
  .editor-panel :global([contenteditable]) {
    cursor: auto;
  }

  /* While actively dragging, force the closed-fist cursor across the panel */
  :global(.drawer-content.dragging) .editor-panel,
  :global(.drawer-content.dragging) .editor-panel :global(*) {
    cursor: grabbing;
  }

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 6px 12px;
    background: rgba(15, 20, 30, 0.95);
    border-bottom: 1px solid var(--theme-stroke);
    min-height: 44px;
    flex-shrink: 0;
  }

  .header-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .panel-header h2 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: var(--theme-text);
  }

  .subtitle {
    font-size: 0.8rem;
    color: var(--theme-text-muted, var(--theme-text-dim));
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .cascade-indicator {
    color: var(--theme-accent, #60a5fa);
    font-size: 0.75rem;
    opacity: 0.9;
    transition: opacity var(--duration-fast) ease;
  }

  .cascade-indicator.pulse {
    animation: cascade-pulse 300ms ease-out;
  }

  .beta-swap-badge {
    font-size: 0.7rem;
    font-weight: 600;
    padding: 1px 5px;
    border-radius: 4px;
    border: 1px solid rgba(168, 85, 247, 0.3);
    background: rgba(168, 85, 247, 0.1);
    color: rgba(168, 85, 247, 0.6);
    cursor: pointer;
    transition: all var(--duration-fast) ease;
    line-height: 1.2;
  }

  .beta-swap-badge:hover {
    background: rgba(168, 85, 247, 0.2);
    color: rgba(168, 85, 247, 0.9);
  }

  .beta-swap-badge.active {
    background: rgba(168, 85, 247, 0.3);
    border-color: rgba(168, 85, 247, 0.5);
    color: #d8b4fe;
  }

  .beta-swap-badge.active:hover {
    background: rgba(168, 85, 247, 0.4);
    color: #ede9fe;
  }

  @keyframes cascade-pulse {
    0% {
      opacity: 1;
      transform: scale(1.15);
    }
    100% {
      opacity: 0.9;
      transform: scale(1);
    }
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }

  /* At iPhone SE width the subtitle gets its own line instead of competing
     with four full-size header actions. */
  @container step-editor (max-width: 360px) {
    .panel-header {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      column-gap: 8px;
      row-gap: 2px;
    }

    .header-info {
      display: contents;
    }

    .panel-header h2 {
      grid-column: 1;
      grid-row: 1;
      white-space: nowrap;
    }

    .header-actions {
      grid-column: 2;
      grid-row: 1;
    }

    .subtitle {
      grid-column: 1 / -1;
      grid-row: 2;
      min-width: 0;
      flex-wrap: wrap;
    }
  }

  .icon-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--min-touch-target);
    height: var(--min-touch-target);
    border-radius: 50%;
    cursor: pointer;
    font-size: var(--font-size-base);
    transition: all var(--duration-fast) ease;
    border: 1px solid var(--theme-stroke-strong);
  }

  .icon-btn.inspect {
    background: linear-gradient(135deg, #06b6d4, #0891b2);
    border-color: rgba(6, 182, 212, 0.3);
    color: white;
  }

  .icon-btn.inspect:hover {
    background: linear-gradient(135deg, #22d3ee, #06b6d4);
    transform: scale(1.05);
  }

  .icon-btn.delete {
    background: linear-gradient(
      135deg,
      var(--semantic-warning) 0%,
      color-mix(in srgb, var(--semantic-warning) 80%, #ff0000) 100%
    );
    border-color: color-mix(in srgb, var(--semantic-warning) 30%, transparent);
    color: white;
  }

  .icon-btn.delete:hover {
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--semantic-warning) 80%, #ff0000) 0%,
      color-mix(in srgb, var(--semantic-warning) 60%, #ff0000) 100%
    );
    transform: scale(1.05);
  }

  .icon-btn.close {
    background: linear-gradient(
      135deg,
      rgba(100, 100, 120, 0.85),
      rgba(70, 70, 90, 0.85)
    );
    color: white;
  }

  .icon-btn.close:hover {
    background: linear-gradient(
      135deg,
      rgba(120, 120, 140, 0.95),
      rgba(90, 90, 110, 0.95)
    );
  }

  /* ============================================================================
     PREVIEW SECTION - Pictograph preview (both mobile and desktop)
     ============================================================================ */

  .preview-section {
    padding: 20px;
    display: flex;
    justify-content: center;
    align-items: center;
    background: rgba(0, 0, 0, 0.1);
    flex: 1 1 0;
    min-height: 0;
    overflow: hidden;
    /* Enable container queries for responsive pictograph sizing */
    container-type: size;
  }

  /* Mobile: tighter padding, fill available space */
  .preview-section.mobile {
    padding: 12px;
    flex: 1 1 auto;
  }

  .pictograph-container {
    /* Size based on smaller dimension - fills the space as a square */
    width: min(90cqw, 90cqh);
    height: min(90cqw, 90cqh);
    aspect-ratio: 1;
    /* Subtle container styling */
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.02));
    border-radius: 12px;
  }

  /* The placement grid frames its own board and carries a prompt line above it.
     Locking that pair inside a square card left a band of empty card under the
     board and read as a card sitting inside the panel's card. Aiming gets the
     whole preview area instead; the board still keeps itself square. */
  .pictograph-container.aiming {
    width: 100%;
    height: 100%;
    aspect-ratio: auto;
    background: none;
    border-radius: 0;
  }

  .start-placement-aim {
    width: 100%;
    height: 100%;
    min-height: 0;
  }

  /* ============================================================================
     CONTROLS SECTION - Bottom controls area
     Must always fit both Blue and Red controls on mobile
     ============================================================================ */

  .controls-section {
    padding: 12px;
    padding-bottom: max(12px, env(safe-area-inset-bottom, 12px));
    flex-shrink: 0;
    border-top: 1px solid var(--theme-stroke, var(--theme-stroke));
    background: var(--theme-panel-bg);
  }

  /* Mobile: controls take only what they need - step grid fills the rest */
  .controls-section.mobile {
    flex: 0 0 auto; /* Don't grow - take natural size only */
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    overflow-y: auto; /* Allow scrolling if absolutely necessary */
  }

  /* Duration already owns its spacing. Removing the second padded frame gives
     the pictograph that space without changing the start-placement editor. */
  .controls-section.mobile.duration-only {
    padding: 0;
    overflow: visible;
  }

  .no-selection {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 48px 24px;
    text-align: center;
    color: var(--theme-text-muted, var(--theme-text-dim));
  }

  .no-selection i {
    font-size: 2rem;
    opacity: 0.6;
  }

  .no-selection p {
    margin: 0;
    font-size: 0.9rem;
  }

  /* Small container height (< 600px) - tighter padding */
  @container step-editor (max-height: 600px) {
    .controls-section.mobile {
      padding: 6px;
    }

    .preview-section.mobile {
      padding: 8px;
    }
  }

  /* Fallback for browsers without container query support */
  @supports not (container-type: size) {
    @media (max-height: 700px) {
      .controls-section.mobile {
        padding: 8px;
      }
    }
  }

  .tour-section {
    border-radius: 8px;
  }

  .tour-dim {
    opacity: 0.25;
    pointer-events: none;
    transition: opacity 0.3s ease;
  }

  .tour-highlight {
    position: relative;
    z-index: 50;
    opacity: 1;
    box-shadow:
      0 0 0 2px
        color-mix(in srgb, var(--feature-edit, #8b5cf6) 70%, transparent),
      0 0 24px 4px
        color-mix(in srgb, var(--feature-edit, #8b5cf6) 35%, transparent);
    border-radius: 8px;
    transition:
      opacity 0.3s ease,
      box-shadow 0.3s ease;
  }

  @media (prefers-reduced-motion: reduce) {
    .icon-btn {
      transition: none;
    }

    .cascade-indicator {
      transition: none;
    }

    .cascade-indicator.pulse {
      animation: none;
    }

    .tour-dim,
    .tour-highlight {
      transition: none;
    }
  }
</style>
