<!--
  SkewLabEditorPanel.svelte

  Drawer panel for editing skewed pictographs - arrow positions and turns.
  Reuses ArrowAdjustmentPanel and TurnsEditMode from the Create module.
  Uses the shared Drawer component for consistent animation and UX.

  Features:
  - Large pictograph preview with clickable arrows
  - WASD arrow adjustment (via ArrowAdjustmentPanel)
  - Turn/rotation editing
  - Prev/Next navigation within category
  - Smooth slide-in animation via Drawer
-->
<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import Drawer from "$lib/shared/foundation/ui/Drawer.svelte";
  import PictographContainer from "$lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import ArrowAdjustmentPanel from "$lib/features/create/shared/components/sequence-actions/ArrowAdjustmentPanel.svelte";
  import TurnsEditMode from "$lib/features/create/shared/components/sequence-actions/TurnsEditMode.svelte";
  import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
  import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
  import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
  import {
    HandSide,
    MotionType,
    RotationDirection,
  } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import { isAdmin } from "$lib/shared/auth/state/auth-state.svelte";
  import { selectedArrowState } from "$lib/shared/create/state/selected-arrow-state.svelte";
  import { getSettings } from "$lib/shared/application/state/app-state.svelte";

  interface Props {
    isOpen: boolean;
    pictographData: PictographData | null;
    /** Index of current pictograph in the filtered list */
    currentIndex: number;
    /** Total count of pictographs in filtered list */
    totalCount: number;
    onClose: () => void;
    onNavigate: (direction: "prev" | "next") => void;
  }

  let {
    isOpen = $bindable(),
    pictographData,
    currentIndex,
    totalCount,
    onClose,
    onNavigate,
  }: Props = $props();

  // selectedArrowState.selectedArrow is $state, so $derived tracks it directly —
  // no subscribe bridge needed.
  const hasArrowSelected = $derived(selectedArrowState.selectedArrow !== null);

  onDestroy(() => {
    selectedArrowState.clearSelection();
  });

  // Get prop types from settings
  const leftPropType = $derived.by(() => {
    const settings = getSettings();
    return (settings.leftPropType ?? settings.propType ?? PropType.STAFF) as PropType;
  });

  const rightPropType = $derived.by(() => {
    const settings = getSettings();
    return (settings.rightPropType ?? settings.propType ?? PropType.STAFF) as PropType;
  });

  // Convert PictographData to StepData format for ArrowAdjustmentPanel
  // (ArrowAdjustmentPanel expects StepData, but only uses the motions)
  const stepDataForPanel = $derived.by((): StepData | null => {
    if (!pictographData) return null;
    return {
      stepNumber: 1,
      duration: 1,
      motions: pictographData.motions,
    } as StepData;
  });

  // Motion data
  const leftMotion = $derived(pictographData?.motions?.[HandSide.LEFT]);
  const rightMotion = $derived(pictographData?.motions?.[HandSide.RIGHT]);

  // Turns handling
  const normalizeTurns = (turns: number | string | undefined): number =>
    turns === "fl" ? -0.5 : Number(turns) || 0;

  const currentLeftTurns = $derived(normalizeTurns(leftMotion?.turns));
  const currentRightTurns = $derived(normalizeTurns(rightMotion?.turns));

  const displayLeftTurns = $derived(
    leftMotion?.turns === "fl" ? "fl" : currentLeftTurns
  );
  const displayRightTurns = $derived(
    rightMotion?.turns === "fl" ? "fl" : currentRightTurns
  );

  // Rotation visibility
  const showLeftRotation = $derived.by(() => {
    if (currentLeftTurns < 0) return false;
    if (
      (leftMotion?.motionType === MotionType.STATIC ||
        leftMotion?.motionType === MotionType.DASH) &&
      currentLeftTurns === 0
    ) {
      return false;
    }
    return true;
  });

  const showRightRotation = $derived.by(() => {
    if (currentRightTurns < 0) return false;
    if (
      (rightMotion?.motionType === MotionType.STATIC ||
        rightMotion?.motionType === MotionType.DASH) &&
      currentRightTurns === 0
    ) {
      return false;
    }
    return true;
  });

  const leftRotation = $derived(
    leftMotion?.rotationDirection ?? RotationDirection.NO_ROTATION
  );
  const rightRotation = $derived(
    rightMotion?.rotationDirection ?? RotationDirection.NO_ROTATION
  );

  // Position label
  const placementLabel = $derived.by(() => {
    if (!pictographData) return "";
    const start = pictographData.startPlacement || "?";
    const end = pictographData.endPlacement || "?";
    return `${start} → ${end}`;
  });

  function handleClose() {
    selectedArrowState.clearSelection();
    onClose();
  }

  function handlePrev() {
    if (currentIndex > 0) {
      selectedArrowState.clearSelection();
      onNavigate("prev");
    }
  }

  function handleNext() {
    if (currentIndex < totalCount - 1) {
      selectedArrowState.clearSelection();
      onNavigate("next");
    }
  }

  // Keyboard navigation (only when drawer is open and no arrow selected)
  function handleKeydown(event: KeyboardEvent) {
    if (!isOpen) return;

    // Arrow keys for navigation (when no arrow selected)
    if (!hasArrowSelected) {
      if (event.key === "ArrowLeft" || event.key === "[") {
        event.preventDefault();
        handlePrev();
      } else if (event.key === "ArrowRight" || event.key === "]") {
        event.preventDefault();
        handleNext();
      }
    }
  }

  onMount(() => {
    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  });

  // Turns change handler (placeholder - skewed pictographs don't persist turns changes yet)
  function handleTurnsChange(_color: HandSide, _delta: number) {
    // TODO: Implement turns modification for skewed pictographs
  }

  function handleRotationChange(_color: HandSide, _direction: RotationDirection) {
    // TODO: Implement rotation modification for skewed pictographs
  }

  // Dummy handler for step data update (ArrowAdjustmentPanel uses this for immediate feedback)
  function handleStepDataUpdate(updatedStepData: StepData) {
    // The ArrowAdjustmentPanel handles this internally via global repo
    // We don't need to do anything here
  }
</script>

<Drawer
  bind:isOpen
  placement="right"
  respectLayoutMode={true}
  closeOnBackdrop={true}
  closeOnEscape={!hasArrowSelected}
  class="skewlab-editor-drawer"
  ariaLabel="Pictograph editor"
  onclose={() => handleClose()}
>
  {#if pictographData}
    <div class="editor-content">
      <!-- Header -->
      <header class="panel-header">
        <div class="header-info">
          <h2>{pictographData.letter}</h2>
          <span class="subtitle">{placementLabel}</span>
        </div>

        <!-- Arrow adjustment panel when arrow selected -->
        {#if isAdmin() && hasArrowSelected && stepDataForPanel}
          <ArrowAdjustmentPanel
            stepData={stepDataForPanel}
            onStepDataUpdate={handleStepDataUpdate}
          />
        {/if}

        <div class="header-actions">
          <button
            class="icon-btn close"
            onclick={handleClose}
            aria-label="Close editor"
          >
            <i class="fas fa-times" aria-hidden="true"></i>
          </button>
        </div>
      </header>

      <!-- Navigation -->
      <nav class="navigation">
        <button
          class="nav-btn"
          onclick={handlePrev}
          disabled={currentIndex === 0}
          aria-label="Previous pictograph"
        >
          <i class="fas fa-chevron-left" aria-hidden="true"></i>
        </button>
        <span class="nav-info">
          {currentIndex + 1} of {totalCount}
        </span>
        <button
          class="nav-btn"
          onclick={handleNext}
          disabled={currentIndex >= totalCount - 1}
          aria-label="Next pictograph"
        >
          <i class="fas fa-chevron-right" aria-hidden="true"></i>
        </button>
      </nav>

      <!-- Pictograph Preview -->
      <div class="preview-section">
        <div class="pictograph-container">
          <PictographContainer
            {pictographData}
            gridMode={GridMode.SKEWED}
            leftPropTypeOverride={leftPropType}
            rightPropTypeOverride={rightPropType}
            arrowsClickable={isAdmin()}
            disableTransitions={true}
          />
        </div>
      </div>

      <!-- Instructions -->
      <div class="instructions">
        {#if hasArrowSelected}
          <p>
            <kbd>WASD</kbd> move arrow
            <kbd>Shift</kbd> 20px
            <kbd>Ctrl+Shift</kbd> 200px
            <kbd>Z</kbd> reset
          </p>
        {:else}
          <p>Click an <strong>arrow</strong> to adjust its position</p>
        {/if}
      </div>

      <!-- Turns Controls (read-only for now) -->
      <div class="controls-section">
        <TurnsEditMode
          hasSelection={true}
          leftTurns={displayLeftTurns}
          rightTurns={displayRightTurns}
          {leftRotation}
          {rightRotation}
          {showLeftRotation}
          {showRightRotation}
          stacked={false}
          compact={true}
          onTurnsChange={handleTurnsChange}
          onRotationChange={handleRotationChange}
        />
      </div>
    </div>
  {/if}
</Drawer>

<style>
  /* Override drawer size for this panel - 40% width, matching CategoryBrowser push-over */
  :global(.skewlab-editor-drawer) {
    --sheet-bg: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
    width: 40vw !important;
    min-width: 450px;
  }

  /* Mobile: bottom sheet */
  @media (max-width: 1023px) {
    :global(.skewlab-editor-drawer) {
      width: 100vw !important;
      min-width: unset;
      max-height: 90vh;
    }
  }

  .editor-content {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

  /* Header */
  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 16px;
    background: rgba(15, 20, 30, 0.95);
    border-bottom: 1px solid var(--theme-stroke);
    flex-shrink: 0;
  }

  .header-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .panel-header h2 {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--theme-text);
  }

  .subtitle {
    font-size: 0.85rem;
    color: var(--theme-text-secondary, #888);
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  .icon-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    cursor: pointer;
    font-size: 1rem;
    transition: all var(--duration-fast) ease;
    border: 1px solid var(--theme-stroke-strong);
  }

  .icon-btn.close {
    background: linear-gradient(135deg, rgba(100, 100, 120, 0.85), rgba(70, 70, 90, 0.85));
    color: white;
  }

  .icon-btn.close:hover {
    background: linear-gradient(135deg, rgba(120, 120, 140, 0.95), rgba(90, 90, 110, 0.95));
  }

  /* Navigation */
  .navigation {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 16px;
    padding: 8px 16px;
    background: rgba(0, 0, 0, 0.2);
    border-bottom: 1px solid var(--theme-stroke);
    flex-shrink: 0;
  }

  .nav-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    border: 1px solid var(--theme-stroke);
    border-radius: 8px;
    background: transparent;
    color: var(--theme-text);
    cursor: pointer;
    transition: all var(--duration-fast) ease;
  }

  .nav-btn:hover:not(:disabled) {
    background: var(--theme-card-bg);
    border-color: var(--theme-stroke-strong);
  }

  .nav-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .nav-info {
    font-size: var(--font-size-min, 14px);
    color: var(--theme-text-secondary);
    min-width: 80px;
    text-align: center;
  }

  /* Preview */
  .preview-section {
    flex: 1;
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 16px;
    min-height: 0;
    overflow: hidden;
  }

  .pictograph-container {
    width: min(100%, 380px);
    aspect-ratio: 1;
    background: rgba(255, 255, 255, 0.02);
    border-radius: 12px;
  }

  /* Instructions */
  .instructions {
    padding: 12px 16px;
    background: rgba(0, 0, 0, 0.2);
    border-top: 1px solid var(--theme-stroke);
    flex-shrink: 0;
  }

  .instructions p {
    margin: 0;
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-secondary);
    text-align: center;
  }

  .instructions kbd {
    display: inline-block;
    padding: 2px 6px;
    margin: 0 2px;
    font-family: "SF Mono", Monaco, monospace;
    font-size: var(--font-size-compact, 12px);
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 4px;
    color: var(--theme-text);
  }

  .instructions strong {
    color: var(--theme-text);
  }

  /* Controls */
  .controls-section {
    padding: 16px;
    border-top: 1px solid var(--theme-stroke);
    background: var(--theme-panel-bg);
    flex-shrink: 0;
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .icon-btn,
    .nav-btn {
      transition: none;
    }
  }
</style>
