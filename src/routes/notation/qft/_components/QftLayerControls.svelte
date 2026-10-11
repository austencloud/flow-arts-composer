<script lang="ts">
  import FilterChipBase from "#lib/shared/browse/components/filter-chips/FilterChipBase.svelte";
  import QftLayerGlyph from "#lib/shared/notation/qft/components/QftLayerGlyph.svelte";
  import {
    LAYER_KEYS,
    LAYER_LABELS,
  } from "#lib/shared/notation/qft/qft-layers.js";
  import { getQftAppContext } from "../_context/qft-app-context";

  let { showReset = true }: { showReset?: boolean } = $props();
  const state = getQftAppContext();
</script>

<nav class="layers" aria-label="Stage layers">
  {#each LAYER_KEYS as key (key)}
    <FilterChipBase
      label={LAYER_LABELS[key]}
      mode="toggle"
      size="sm"
      active={state.layers[key]}
      onclick={() => state.toggleLayer(key)}
    >
      {#snippet iconSnippet()}
        <QftLayerGlyph layer={key} />
      {/snippet}
    </FilterChipBase>
  {/each}
  {#if showReset}
    <FilterChipBase
      label={state.allLayersOn ? "Only the prop" : "Everything"}
      icon={state.allLayersOn ? "fas fa-eye-slash" : "fas fa-eye"}
      mode="action"
      size="sm"
      onclick={state.toggleAllLayers}
    />
  {/if}
</nav>

<style>
  .layers {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.4rem;
  }

  .layers :global(.filter-chip) {
    width: 100%;
    justify-content: center;
  }

  @container (min-width: 44rem) {
    .layers {
      grid-template-columns: repeat(7, minmax(0, 1fr));
    }
  }
</style>
