<script lang="ts">
  import StepGrid from "#lib/features/create/shared/workspace-panel/sequence-display/components/StepGrid.svelte";
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  let {
    sequence,
    title,
    focusStep = 0,
  }: {
    sequence: SequenceData | null;
    title: string;
    focusStep?: number;
  } = $props();
  let page = $state(0);
  let inspected = $state<number | null>(null);
  const pageSize = 8;
  const pages = $derived(
    Math.max(1, Math.ceil((sequence?.steps.length ?? 0) / pageSize))
  );
  const safePage = $derived(Math.min(page, pages - 1));
  const steps = $derived(
    sequence?.steps.slice(safePage * pageSize, (safePage + 1) * pageSize) ?? []
  );
  $effect(() => {
    if (focusStep > 0) page = Math.floor((focusStep - 1) / pageSize);
  });
</script>

<section class="path-panel" aria-label={title}>
  <header>
    <h2>{title}</h2>
    <span>{sequence?.steps.length ?? 0} steps</span>
  </header>
  <div class="grid-stage">
    {#if sequence}
      <StepGrid
        {steps}
        startPlacement={safePage === 0 ? sequence.startPlacement : null}
        fitAllSteps
        sizingProfile="preview"
        manualColumnCount={3}
        narrowMaxColumns={3}
        allowFewStepOverflowOnNarrow={false}
        autoFocusSelectedStep={false}
        selectedStepNumber={inspected ?? (focusStep || null)}
        onStepClick={(step) => (inspected = step)}
      />
    {:else}
      <div class="empty">
        Your path will appear here after you choose a starting location.
      </div>
    {/if}
  </div>
  <footer>
    {#if pages > 1}
      <PanelButton
        ariaLabel="Previous path page"
        disabled={safePage === 0}
        onclick={() => (page = safePage - 1)}>Previous</PanelButton
      >
      <span>{safePage + 1} / {pages}</span>
      <PanelButton
        ariaLabel="Next path page"
        disabled={safePage === pages - 1}
        onclick={() => (page = safePage + 1)}>Next</PanelButton
      >
    {:else}
      <span>Use Undo to change the last choice.</span>
    {/if}
  </footer>
</section>

<style>
  .path-panel {
    height: 100%;
    min-height: 0;
    min-width: 0;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    gap: 12px;
  }
  header,
  footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    min-width: 0;
  }
  h2 {
    font-size: 18px;
    margin: 0;
  }
  header span,
  footer span {
    color: var(--theme-text-dim);
    font-size: 14px;
  }
  .grid-stage {
    min-height: 0;
    min-width: 0;
    position: relative;
  }
  .empty {
    display: grid;
    height: 100%;
    place-content: center;
    padding: 24px;
    text-align: center;
    color: var(--theme-text-dim);
    font-size: 16px;
  }
  footer {
    min-height: 44px;
  }
</style>
