<script lang="ts">
  import { onMount } from "svelte";
  import { getSettings } from "$lib/shared/application/state/app-state.svelte";
  import BaseModal from "$lib/shared/foundation/ui/modal/BaseModal.svelte";
  import ShapeMatrixGrid from "$lib/shared/shape-matrix/components/ShapeMatrixGrid.svelte";
  import ShapeMatrixDrill from "$lib/shared/shape-matrix/components/ShapeMatrixDrill.svelte";
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";
  import { applyFilter } from "$lib/shared/shape-matrix/domain/filter-flower-axis";
  import {
    matrixFiltersForSize,
    type MatrixSize,
  } from "$lib/shared/shape-matrix/domain/matrix-size-preset";
  import type { Flower } from "$lib/shared/shape-matrix/domain/flower-signature";
  import type { ModeRealization } from "$lib/shared/shape-matrix/services/build-mode-realizations";
  import {
    loadShapeMatrix,
    type ShapeMatrixData,
  } from "$lib/shared/shape-matrix/services/shape-matrix-flowers";

  let {
    targetLabel,
    onSelect,
    onClose,
  }: {
    targetLabel: string;
    onSelect: (realization: ModeRealization) => void;
    onClose: () => void;
  } = $props();

  let open = $state(true);
  let size = $state<MatrixSize>("small");
  let data = $state<ShapeMatrixData | null>(null);
  let selectedPair = $state<{ left: Flower; right: Flower } | null>(null);
  let loadError = $state(false);

  const sizeOptions: { value: MatrixSize; label: string }[] = [
    { value: "small", label: "16" },
    { value: "medium", label: "64" },
    { value: "large", label: "144" },
  ];
  const filters = $derived(matrixFiltersForSize(size));
  const rowAxis = $derived(
    data ? applyFilter(data.axis, filters.left, false) : []
  );
  const colAxis = $derived(
    data ? applyFilter(data.axis, filters.right, false) : []
  );

  onMount(async () => {
    try {
      const settings = getSettings();
      data = await loadShapeMatrix({
        left: settings.leftPropType,
        right: settings.rightPropType,
      });
    } catch (error) {
      console.error("[ShapeMatrixTunnelSourcePicker] load failed", error);
      loadError = true;
    }
  });

  function close(): void {
    open = false;
    onClose();
  }

  function select(realization: ModeRealization): void {
    onSelect(realization);
    close();
  }
</script>

<BaseModal
  bind:open
  size="xl"
  class="shape-matrix-tunnel-picker"
  onclose={close}
  labelledBy="shape-matrix-tunnel-picker-title"
  describedBy="shape-matrix-tunnel-picker-description"
>
  {#snippet header()}
    <div class="picker-header">
      <div>
        <h2 id="shape-matrix-tunnel-picker-title">
          Shape Matrix for {targetLabel}
        </h2>
        <p id="shape-matrix-tunnel-picker-description">
          Pick a cell, choose its timing and direction, then use that exact
          realization.
        </p>
      </div>
      <button
        type="button"
        class="close-button"
        onclick={close}
        aria-label="Close Shape Matrix"
      >
        <i class="fas fa-times" aria-hidden="true"></i>
      </button>
    </div>
  {/snippet}

  <div class="picker-body">
    <section class="matrix-pane" aria-label="Shape Matrix cells">
      <header>
        <div class="matrix-heading">
          <strong>Shape cells</strong>
          <span>Left rows · right columns</span>
        </div>
        <div class="size-control">
          <SegmentedControl
            options={sizeOptions}
            value={size}
            onchange={(next) => (size = next)}
            size="sm"
            color="accent"
            semantics="radiogroup"
            ariaLabel="Shape Matrix size"
          />
        </div>
      </header>
      <div class="matrix-stage">
        {#if loadError}
          <p class="status error" role="alert">
            Couldn't load the Shape Matrix. Close this picker and try again.
          </p>
        {:else if data}
          <ShapeMatrixGrid
            {data}
            {rowAxis}
            {colAxis}
            maxCellPx={112}
            onselect={(pair) => (selectedPair = pair)}
          />
        {:else}
          <p class="status">Building flowers…</p>
        {/if}
      </div>
    </section>

    <section class="realization-pane" aria-label="Shape Matrix realizations">
      <header>
        <strong>Realization</strong>
        <span>Six timing-and-direction choices per cell</span>
      </header>
      <div class="drill-stage">
        {#if data}
          <ShapeMatrixDrill
            pair={selectedPair}
            {data}
            onselectRealization={select}
            selectLabel={`Use for ${targetLabel}`}
          />
        {:else}
          <p class="status">Building realizations…</p>
        {/if}
      </div>
    </section>
  </div>
</BaseModal>

<style>
  :global(dialog.base-modal.shape-matrix-tunnel-picker[data-size="xl"]) {
    width: min(calc(100dvw - 2rem), 92rem);
    height: min(calc(100dvh - 2rem), 60rem);
  }

  .picker-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--settings-spacing-md, 14px);
    padding: var(--settings-spacing-md, 14px) var(--settings-spacing-lg, 20px);
    border-bottom: 1px solid var(--theme-stroke);
  }

  .picker-header > div {
    min-width: 0;
  }

  h2,
  p {
    margin: 0;
  }

  h2 {
    color: var(--theme-text);
    font-size: var(--font-size-lg, 18px);
  }

  .picker-header p,
  section > header span {
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 12px);
    line-height: 1.45;
  }

  .picker-header p {
    margin-top: 3px;
  }

  .close-button {
    display: grid;
    flex: 0 0 auto;
    width: var(--min-touch-target, 44px);
    height: var(--min-touch-target, 44px);
    place-items: center;
    border: 1px solid var(--theme-stroke);
    border-radius: 50%;
    background: var(--theme-card-bg);
    color: var(--theme-text-dim);
    cursor: pointer;
  }

  .close-button:hover,
  .close-button:focus-visible {
    border-color: var(--theme-stroke-strong, var(--theme-stroke));
    color: var(--theme-text);
  }

  .picker-body {
    display: grid;
    grid-template-columns: minmax(22rem, 1.08fr) minmax(22rem, 0.92fr);
    gap: var(--settings-spacing-md, 14px);
    height: 100%;
    min-width: 0;
    min-height: 0;
    padding: var(--settings-spacing-md, 14px);
    background: var(--theme-panel-bg);
  }

  .matrix-pane,
  .realization-pane {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    border: 1px solid var(--theme-stroke);
    border-radius: var(--settings-radius-lg, 20px);
    background: var(--theme-card-bg);
  }

  section > header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--settings-spacing-sm, 8px);
    min-height: var(--min-touch-target, 44px);
    padding: var(--settings-spacing-sm, 8px) var(--settings-spacing-md, 14px);
    border-bottom: 1px solid var(--theme-stroke);
  }

  section > header strong {
    color: var(--theme-text);
    font-size: var(--font-size-min, 14px);
  }

  .matrix-heading {
    display: grid;
    gap: 2px;
  }

  .size-control {
    width: min(15rem, 52%);
    min-width: 10rem;
  }

  .matrix-stage,
  .drill-stage {
    min-width: 0;
    min-height: 0;
    background: #0a0f14;
  }

  .drill-stage {
    padding: var(--settings-spacing-md, 14px);
  }

  .status {
    display: grid;
    height: 100%;
    min-height: 15rem;
    place-items: center;
    padding: var(--settings-spacing-lg, 20px);
    color: var(--theme-text-dim);
    font-size: var(--font-size-min, 14px);
    text-align: center;
  }

  .status.error {
    color: var(--semantic-error, #fca5a5);
  }

  @media (max-width: 700px) {
    :global(dialog.base-modal.shape-matrix-tunnel-picker[data-size="xl"]) {
      width: 100dvw;
      height: 100dvh;
    }

    .picker-body {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: 22rem minmax(32rem, 1fr);
      height: auto;
    }

    section > header {
      align-items: flex-start;
      flex-direction: column;
      justify-content: center;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .close-button {
      transition: none;
    }
  }
</style>
