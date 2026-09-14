<!--
  StepGridSection.svelte

  Step grid display section for SequenceActionsPanel.
  Includes the Choose Start banner while picking a start pose.
-->
<script lang="ts">
  import StepGrid from "../../workspace-panel/sequence-display/components/StepGrid.svelte";
  import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
  import type { StartPositionData } from "$lib/shared/foundation/domain/models/start-position-data";

  interface Props {
    steps: readonly StepData[];
    startPosition: StepData | StartPositionData | null;
    selectedStepNumber: number | null;
    isShiftMode: boolean;
    /** When true, grid takes all available space (flex: 1) instead of fixed 40% */
    mobileMode?: boolean;
    onStepClick: (stepNumber: number) => void;
    onStartClick: () => void;
    onStepLongPress?: (stepNumber: number) => void;
    onCancelShiftMode: () => void;
  }

  const {
    steps,
    startPosition,
    selectedStepNumber,
    isShiftMode,
    mobileMode = false,
    onStepClick,
    onStartClick,
    onStepLongPress,
    onCancelShiftMode,
  }: Props = $props();
</script>

<div
  class="step-grid-section"
  class:shift-mode={isShiftMode}
  class:mobile-mode={mobileMode}
>
  {#if isShiftMode}
    <div class="shift-mode-banner">
      <span>Tap the pose you want to start from</span>
      <button class="cancel-btn" onclick={onCancelShiftMode}>Cancel</button>
    </div>
  {/if}
  <StepGrid
    {steps}
    {startPosition}
    {selectedStepNumber}
    {onStepClick}
    {onStartClick}
    onStepLongPress={isShiftMode ? undefined : onStepLongPress}
    posePicker={isShiftMode}
  />
</div>

<style>
  .step-grid-section {
    flex: 0 0 40%;
    min-height: 0;
    border-top: 1px solid var(--theme-stroke);
    border-bottom: 1px solid var(--theme-stroke);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.02));
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .step-grid-section.mobile-mode {
    flex: 1;
  }

  .step-grid-section.shift-mode {
    border-color: rgba(6, 182, 212, 0.5);
    background: rgba(6, 182, 212, 0.05);
  }

  .shift-mode-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    background: rgba(6, 182, 212, 0.15);
    border-bottom: 1px solid rgba(6, 182, 212, 0.3);
    color: #06b6d4;
    font-size: 0.85rem;
    font-weight: 500;
    flex-shrink: 0;
  }

  .shift-mode-banner .cancel-btn {
    padding: 4px 12px;
    border-radius: 6px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.1));
    border: 1px solid var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
    color: white;
    font-size: 0.8rem;
    cursor: pointer;
    transition: all var(--duration-fast) ease;
  }

  .shift-mode-banner .cancel-btn:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.2));
  }

  @media (prefers-reduced-motion: reduce) {
    .shift-mode-banner .cancel-btn {
      transition: none;
    }
  }
</style>
