<script lang="ts">
  import type { GridJoin } from "@tka/tka-types";
  import type { CharacterInstanceState } from "../../state/character-instance-state.svelte";
  import GridJoinSection from "#lib/shared/grid-join/GridJoinSection.svelte";
  import { gridJoinsEqual } from "#lib/shared/grid-join/grid-join-controller.js";

  let {
    performers,
    onChange,
    fill = false,
  }: {
    performers: readonly CharacterInstanceState[];
    onChange: (join: GridJoin | null | undefined) => void;
    fill?: boolean;
  } = $props();

  const previewPerformer = $derived(
    performers.find((item) => item.loadedSequence !== null) ?? performers[0]
  );
  const sequence = $derived(previewPerformer?.loadedSequence);
  const pictograph = $derived(
    sequence?.startPlacement ??
      sequence?.startingPlacement ??
      sequence?.steps[0] ??
      null
  );
  const gridMode = $derived(sequence?.gridMode ?? pictograph?.gridMode);
  const join = $derived(previewPerformer?.gridJoin ?? null);
  const mixed = $derived(
    performers.some((item) => !gridJoinsEqual(item.gridJoin, join))
  );
  const followsSequence = $derived(
    performers.every((item) => item.settings.gridJoin === undefined)
  );
  const scale = $derived(previewPerformer?.gridScale ?? 1);
  const mixedGridModes = $derived(
    new Set(
      performers.map((item) => {
        const sequence = item.loadedSequence;
        return (
          sequence?.gridMode ??
          sequence?.startPlacement?.gridMode ??
          sequence?.startingPlacement?.gridMode ??
          sequence?.steps[0]?.gridMode ??
          "diamond"
        );
      })
    ).size > 1
  );
</script>

<div class="performer-grid-panel" class:fill>
  <div class="grid-source">
    <span class="grid-status" aria-live="polite">
      {mixed
        ? "Mixed grids"
        : followsSequence
          ? "Using sequence grid"
          : "Performer grid"}
    </span>
    <button
      type="button"
      class="reset-grid"
      disabled={followsSequence || performers.length === 0}
      onclick={() => onChange(undefined)}>Use sequence grid</button
    >
  </div>

  {#if pictograph}
    <p class="grid-hint">
      {#if mixed}
        Choose a grid for the selected performers.
      {:else if scale < 1}
        Grids and props use {Math.round(scale * 100)}% of their base size.
      {:else}
        Both hands share one grid at full size.
      {/if}
    </p>
    {#if mixedGridModes}
      <p class="grid-hint">
        Join directions adapt to each performer’s grid orientation.
      </p>
    {/if}
    <GridJoinSection
      {pictograph}
      {gridMode}
      {join}
      {mixed}
      {onChange}
      {fill}
      leftPropType={previewPerformer?.effectiveProp}
      rightPropType={previewPerformer?.effectiveProp}
      embedded
    />
  {:else}
    <p class="grid-hint">Load a sequence to choose its grid configuration.</p>
  {/if}
</div>

<style>
  .performer-grid-panel {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .performer-grid-panel.fill {
    flex: 1;
    min-height: 0;
  }

  .grid-source {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 8px;
  }

  .grid-status {
    color: var(--theme-text);
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
  }

  .reset-grid {
    min-height: 44px;
    padding: 8px 12px;
    border: 1px solid var(--theme-stroke);
    border-radius: 8px;
    background: var(--theme-card-bg);
    color: var(--theme-text);
    font-size: var(--font-size-min, 14px);
    cursor: pointer;
  }

  .reset-grid:hover:enabled {
    background: var(--theme-card-hover-bg);
    border-color: var(--theme-stroke-strong);
  }

  .reset-grid:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .reset-grid:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  .grid-hint {
    flex: none;
    margin: 0;
    color: var(--theme-text-dim);
    font-size: var(--font-size-min, 14px);
    line-height: 1.45;
  }
</style>
