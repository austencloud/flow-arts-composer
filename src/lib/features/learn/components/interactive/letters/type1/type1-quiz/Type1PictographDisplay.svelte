<!--
Type1PictographDisplay - Pictograph visualizer with loading state
-->
<script lang="ts">
  import PictographContainer from "#lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
  import ProgressRing from "#lib/shared/components/loading/ProgressRing.svelte";

  let {
    isLoading,
    pictographData,
  }: {
    isLoading: boolean;
    pictographData: PictographData | null;
  } = $props();
</script>

<div class="visualizer-container">
  {#if isLoading}
    <div class="loading-state">
      <ProgressRing percent={-1} size={32} strokeWidth={3} />
    </div>
  {:else if pictographData}
    <PictographContainer
      {pictographData}
      showTKA={false}
      showReversals={false}
      disableTransitions={true}
    />
  {:else}
    <div class="error-state">
      <span class="error-icon">⚠</span>
      <span>Could not load pictograph</span>
    </div>
  {/if}
</div>

<style>
  .visualizer-container {
    width: 160px;
    height: 160px;
    background: white;
    border-radius: 12px;
    overflow: hidden;
  }

  .loading-state,
  .error-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    gap: 0.5rem;
  }

  .error-state {
    background: color-mix(in srgb, var(--semantic-error, #ef4444) 5%, transparent);
    color: var(--semantic-error);
  }

  .error-icon {
    font-size: 1.5rem;
  }

  @media (max-width: 500px) {
    .visualizer-container {
      width: 140px;
      height: 140px;
    }
  }

</style>
