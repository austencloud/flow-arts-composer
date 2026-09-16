<!--
  ChoreoCardVisibility.svelte - Visibility controls for choreo card thumbnails

  Local visibility settings that affect how pictographs are rendered
  in choreo cards. Uses the shared ChipToggle component for consistency.
-->
<script lang="ts">
  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
  import type { HapticFeedback } from "$lib/shared/application/services/haptic-feedback";
  import { onMount } from "svelte";
  import { ChipToggle } from '@austencloud/chip-toggle';

  interface Props {
    handPointsVisible: boolean;
    showGrid: boolean;
    showTKA: boolean;
    showWord: boolean;
    includeStartPlacement: boolean;
    onHandPointsChange: (visible: boolean) => void;
    onShowGridChange: (visible: boolean) => void;
    onShowTKAChange: (visible: boolean) => void;
    onShowWordChange: (visible: boolean) => void;
    onIncludeStartPlacementChange: (visible: boolean) => void;
  }

  let {
    handPointsVisible,
    showGrid,
    showTKA,
    showWord,
    includeStartPlacement,
    onHandPointsChange,
    onShowGridChange,
    onShowTKAChange,
    onShowWordChange,
    onIncludeStartPlacementChange,
  }: Props = $props();

  let hapticService: HapticFeedback;

  onMount(() => {
    hapticService = getHapticFeedback();
  });

  function handleHandPointsClick() {
    hapticService?.trigger("selection");
    onHandPointsChange(!handPointsVisible);
  }

  function handleShowGridClick() {
    hapticService?.trigger("selection");
    onShowGridChange(!showGrid);
  }

  function handleShowTKAClick() {
    hapticService?.trigger("selection");
    onShowTKAChange(!showTKA);
  }

  function handleShowWordClick() {
    hapticService?.trigger("selection");
    onShowWordChange(!showWord);
  }

  function handleIncludeStartPlacementClick() {
    hapticService?.trigger("selection");
    onIncludeStartPlacementChange(!includeStartPlacement);
  }
</script>

<div class="visibility-section">
  <h3 class="section-title">
    <span>Display</span>
  </h3>

  <div class="chip-grid">
    <ChipToggle
      label="Hand Pts"
      active={handPointsVisible}
      onclick={handleHandPointsClick}
    />

    <ChipToggle
      label="Grid"
      active={showGrid}
      onclick={handleShowGridClick}
    />

    <ChipToggle
      label="TKA"
      active={showTKA}
      onclick={handleShowTKAClick}
    />

    <ChipToggle
      label="Word"
      active={showWord}
      onclick={handleShowWordClick}
    />

    <ChipToggle
      label="Start Pos"
      active={includeStartPlacement}
      onclick={handleIncludeStartPlacementClick}
    />
  </div>
</div>

<style>
  .visibility-section {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
  }

  .section-title {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
    margin: 0;
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .chip-grid {
    display: flex;
    flex-wrap: wrap;
    gap: var(--spacing-xs);
  }

  /* Responsive */
  @media (max-width: 768px) {
    .visibility-section {
      flex-shrink: 0;
    }

    .chip-grid {
      flex-wrap: nowrap;
    }
  }
</style>
