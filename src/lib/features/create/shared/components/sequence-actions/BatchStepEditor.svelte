<!--
  BatchStepEditor.svelte

  Multi-select batch editor TOP zone: header (count + select-all + close) and the
  pictograph grid. Rendered inside the coordinator's shared drawer, in the top-
  zone crossfade opposite the single-step preview. The blue/red turn controls
  live in the shared, persistent StepControlsZone below (so they morph across
  single ↔ multi instead of being rebuilt here).

  Grid add/remove/reflow animates (flip + scale) instead of an instant layout
  shift. Each pictograph renders its own beat number + per-hand turns.
-->
<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import PictographContainer from "$lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
  import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import { calculateGridLayout } from "$lib/shared/create/utils/grid-calculations";
  import { getDeviceDetector } from "$lib/shared/device/get-device-detector";
  import { flip } from "svelte/animate";
  import { scale } from "svelte/transition";
  import { DURATION } from "$lib/shared/transitions/transitions";

  interface Props {
    steps: StepData[];
    stepNumbers: number[];
    totalBeats: number;
    onClose: () => void;
    onSelectAll: () => void;
    leftPropTypeOverride?: PropType;
    rightPropTypeOverride?: PropType;
  }

  let {
    steps,
    stepNumbers,
    totalBeats,
    onClose,
    onSelectAll,
    leftPropTypeOverride,
    rightPropTypeOverride,
  }: Props = $props();

  const count = $derived(steps.length);

  // Size the pictograph cells to fill the available panel space — the same
  // responsive sizing the workspace grid uses, so batch pictographs are big
  // and clearly readable instead of a tight auto-fill of tiny thumbnails.
  const deviceDetector = getDeviceDetector();
  let gridEl = $state<HTMLElement>();
  let gridW = $state(0);
  let gridH = $state(0);

  $effect(() => {
    if (!gridEl) return;
    const rect = gridEl.getBoundingClientRect();
    gridW = rect.width;
    gridH = rect.height;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        gridW = entry.contentRect.width;
        gridH = entry.contentRect.height;
      }
    });
    ro.observe(gridEl);
    return () => ro.disconnect();
  });

  const layout = $derived(
    calculateGridLayout(count, gridW, gridH, deviceDetector, {
      maxCellSize: 320,
    })
  );

  // Animate add/remove/reflow of grid cells instead of instant layout shift.
  // flip repositions the survivors; scale in/out grows/shrinks the entering /
  // leaving pictograph. Collapse durations to 0 under reduced motion.
  let reducedMotion = $state(
    typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
  $effect(() => {
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handler = (e: MediaQueryListEvent) => (reducedMotion = e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  });
  const flipDuration = $derived(reducedMotion ? 0 : DURATION.normal);
  const outDuration = $derived(reducedMotion ? 0 : DURATION.fast);
</script>

<div class="batch-editor">
  <!-- Header -->
  <header class="batch-header">
    <button
      class="header-btn close"
      type="button"
      onclick={onClose}
      aria-label={t("create_ui_close_batch_editor")}
    >
      <i class="fas fa-times" aria-hidden="true"></i>
    </button>
    <span class="batch-title">Editing {count} steps</span>
    {#if count < totalBeats}
      <button class="header-btn select-all" type="button" onclick={onSelectAll}>
        Select all
      </button>
    {:else}
      <span class="header-spacer"></span>
    {/if}
  </header>

  <!-- Pictograph grid: every selected step, animated on add/remove/reflow -->
  <div class="grid-scroll" bind:this={gridEl}>
    <div
      class="pictograph-grid"
      style:grid-template-columns={`repeat(${layout.columns}, ${layout.cellSize}px)`}
    >
      {#each steps as step, i (stepNumbers[i] ?? i)}
        <!-- The pictograph already renders its beat number + per-hand turns,
             so no extra caption is needed here. -->
        <div
          class="pictograph-box"
          style:width={`${layout.cellSize}px`}
          in:scale={{ duration: flipDuration, start: 0.7, opacity: 0 }}
          out:scale={{ duration: outDuration, start: 0.7, opacity: 0 }}
          animate:flip={{ duration: flipDuration }}
        >
          <PictographContainer
            pictographData={step}
            disableTransitions={true}
            cellIndex={i}
            {leftPropTypeOverride}
            {rightPropTypeOverride}
          />
        </div>
      {/each}
    </div>
  </div>
</div>

<style>
  .batch-editor {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    padding: 12px 16px 0;
    box-sizing: border-box;
    gap: 12px;
  }

  .batch-header {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-shrink: 0;
  }

  .batch-title {
    flex: 1;
    text-align: center;
    font-size: var(--font-size-md, 1rem);
    font-weight: 700;
    color: var(--theme-text, rgba(255, 255, 255, 0.95));
  }

  .header-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: var(--min-touch-target, 44px);
    padding: 0 14px;
    border-radius: 10px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.05));
    color: var(--theme-text, rgba(255, 255, 255, 0.9));
    font-size: var(--font-size-sm, 0.875rem);
    font-weight: 600;
    cursor: pointer;
    transition: background var(--duration-fast) ease;
  }

  .header-btn:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.1));
  }

  .header-btn.close {
    min-width: var(--min-touch-target, 44px);
    padding: 0;
  }

  .header-spacer {
    min-width: var(--min-touch-target, 44px);
  }

  .grid-scroll {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: var(--scrollbar-thumb) transparent;
  }

  /* Columns + cell size are computed (calculateGridLayout) and set inline so the
     pictographs fill the panel. `safe center` centers them when they fit and
     falls back to scroll-from-top when the selection overflows. */
  .pictograph-grid {
    display: grid;
    gap: 12px;
    padding: 6px;
    box-sizing: border-box;
    min-height: 100%;
    justify-content: safe center;
    align-content: safe center;
  }

  .pictograph-box {
    position: relative;
    aspect-ratio: 1;
    background: var(--dm-pictograph-bg, #0a0a0f);
    border-radius: 10px;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .pictograph-box :global(.pictograph-container) {
    width: 100%;
    height: 100%;
  }
</style>
