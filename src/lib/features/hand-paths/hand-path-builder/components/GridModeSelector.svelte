<!--
  GridModeSelector.svelte - Diamond / Box / Skewed toggle

  Lets the user pick which set of grid points to tap.
  Switching grid mode resets all path state (points change).
-->
<script lang="ts">
  import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
  import { getBuilderContext } from "../context/builder-context";

  const builder = getBuilderContext();

  const modes: Array<{ mode: GridMode; label: string; hint: string }> = [
    { mode: GridMode.DIAMOND, label: "Diamond", hint: "N E S W" },
    { mode: GridMode.BOX,     label: "Box",     hint: "Ne Se Sw Nw" },
    { mode: GridMode.SKEWED,  label: "Skewed",  hint: "all 8 perimeter" },
  ];
</script>

<div class="grid-mode-selector" role="group" aria-label="Grid mode">
  {#each modes as { mode, label, hint } (mode)}
    <button
      class="mode-btn"
      class:active={builder.gridMode === mode}
      onclick={() => builder.setGridMode(mode)}
      aria-pressed={builder.gridMode === mode}
      title={hint}
    >
      {label}
    </button>
  {/each}
</div>

<style>
  .grid-mode-selector {
    display: flex;
    gap: 6px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    border-radius: 10px;
    padding: 4px;
  }

  .mode-btn {
    flex: 1;
    padding: 7px 12px;
    border-radius: 7px;
    font-size: var(--font-size-compact, 12px);
    font-weight: 500;
    cursor: pointer;
    transition: background 0.15s ease, color 0.15s ease;
    background: transparent;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.5));
    border: none;
  }

  .mode-btn:hover {
    background: var(--theme-card-bg-hover, rgba(255, 255, 255, 0.07));
    color: var(--theme-text, #fff);
  }

  .mode-btn.active {
    background: var(--theme-accent, rgba(59, 130, 246, 0.25));
    color: var(--theme-text, #fff);
    font-weight: 600;
  }

  .mode-btn:focus-visible {
    outline: 2px solid var(--theme-accent, #3b82f6);
    outline-offset: 2px;
  }
</style>
