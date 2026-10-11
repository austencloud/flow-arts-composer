<!--
  HandPathExplorerLab.svelte

  Lab tab for browsing unique hand paths across the sequence library.
  Groups sequences by their leftPathHash / rightPathHash and lets you explore
  which paths are reused most across your library.
-->
<script lang="ts">
  import { getSequenceRepository } from "#lib/shared/create/get-sequence-repository.js";
  import type { SequenceRepository } from "#lib/shared/create/services/sequence-repository.js";
  import { createExplorerState } from "./state/explorer-state.svelte";
  import { setExplorerContext } from "./context/explorer-context";
  import HandPathCard from "./components/HandPathCard.svelte";
  import HandPathDetail from "./components/HandPathDetail.svelte";

  const sequenceRepository = getSequenceRepository();

  const state = createExplorerState(sequenceRepository);
  setExplorerContext({ state });
</script>

<div class="explorer">
  <!-- Main grid panel -->
  <div
    class="explorer__grid-panel"
    class:explorer__grid-panel--narrowed={state.selectedGroup !== null}
  >
    <div class="explorer__header">
      <span class="explorer__title">Hand Path Explorer</span>
      {#if !state.isLoading && !state.loadError}
        <span class="explorer__count"
          >{state.pathGroups.length} unique paths</span
        >
      {/if}
    </div>

    {#if state.isLoading}
      <div class="explorer__center">
        <i
          class="fas fa-circle-notch fa-spin explorer__spinner"
          aria-hidden="true"
        ></i>
        <span>Loading library...</span>
      </div>
    {:else if state.loadError}
      <div class="explorer__center explorer__center--error">
        <i class="fas fa-exclamation-triangle" aria-hidden="true"></i>
        <span>{state.loadError}</span>
      </div>
    {:else if state.pathGroups.length === 0}
      <div class="explorer__center">
        <i class="fas fa-wind" aria-hidden="true"></i>
        <span>No sequences with compositional data found.</span>
        <span class="explorer__hint"
          >Sequences need leftSoloProp / rightSoloProp fields to appear here.</span
        >
      </div>
    {:else}
      <div class="explorer__grid">
        {#each state.pathGroups as group (group.hash)}
          <HandPathCard {group} />
        {/each}
      </div>
    {/if}
  </div>

  <!-- Detail panel - slides in when a path is selected -->
  {#if state.selectedGroup !== null}
    <div class="explorer__detail-panel">
      <HandPathDetail group={state.selectedGroup} />
    </div>
  {/if}
</div>

<style>
  .explorer {
    display: flex;
    height: 100%;
    overflow: hidden;
  }

  /* Grid panel                                                           */
  .explorer__grid-panel {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
    overflow: hidden;
    transition: flex 0.2s ease;
  }

  /* When the detail panel is open, give the grid slightly less space */
  .explorer__grid-panel--narrowed {
    flex: 1;
  }

  .explorer__header {
    display: flex;
    align-items: baseline;
    gap: 10px;
    padding: 16px;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    flex-shrink: 0;
  }

  .explorer__title {
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
    color: var(--theme-text, #fff);
  }

  .explorer__count {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.5));
  }

  .explorer__grid {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 12px;
    align-content: start;
    scrollbar-width: thin;
    scrollbar-color: var(--scrollbar-thumb, rgba(255, 255, 255, 0.2))
      transparent;
  }

  @media (max-width: 480px) {
    .explorer__grid {
      grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
      gap: 8px;
      padding: 10px;
    }
  }

  /* Empty / loading / error states                                       */
  .explorer__center {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.5));
    font-size: var(--font-size-min, 14px);
    text-align: center;
    padding: 32px;
  }

  .explorer__center--error {
    color: var(--semantic-error, #ef4444);
  }

  .explorer__spinner {
    font-size: 24px;
    color: var(--theme-accent, #a855f7);
  }

  .explorer__hint {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.35));
    max-width: 320px;
  }

  /* Detail panel                                                         */
  .explorer__detail-panel {
    width: 320px;
    flex-shrink: 0;
    overflow: hidden;
  }

  @media (max-width: 640px) {
    /* On small screens, the detail panel overlays the grid panel */
    .explorer {
      position: relative;
    }

    .explorer__detail-panel {
      position: absolute;
      inset: 0;
      width: 100%;
      z-index: 10;
    }
  }
</style>
