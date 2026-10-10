<script lang="ts">
  import { getViewer3DContext } from "../../context/viewer-3d-context";
  import EffectsPanel from "#lib/shared/animation-engine/components/effects-panel/EffectsPanel.svelte";
  import CascadeBadge from "./CascadeBadge.svelte";

  const viewer = getViewer3DContext();
  const scopedPerformers = $derived(viewer.scopedPerformers());
  const isAllMode = $derived(viewer.isAllPerformersSelected);
  const isMultiMode = $derived(scopedPerformers.length > 1 && !isAllMode);

  const isOverridden = $derived(
    !isAllMode &&
      scopedPerformers.some((performer) => performer.hasOverride.effects)
  );
  const overrideCount = $derived(
    scopedPerformers.filter((performer) => performer.hasOverride.effects).length
  );
</script>

<div class="effects-content">
  {#if (isAllMode || isMultiMode) && overrideCount > 0}
    <CascadeBadge
      mode="overrides"
      {overrideCount}
      categoryLabel="effects"
      onReset={() => viewer.resetEffectsScoped()}
    />
  {:else if !isAllMode && !isMultiMode && isOverridden}
    <CascadeBadge mode="custom" onReset={() => viewer.resetEffectsScoped()} />
  {:else if !isAllMode && !isMultiMode}
    <CascadeBadge mode="default" />
  {/if}

  <EffectsPanel
    layout="grid"
    bpm={0}
    onBpmChange={() => {}}
    isPlaying={false}
    onPlaybackToggle={() => {}}
    showPlayback={false}
  />
</div>

<style>
  .effects-content {
    max-height: 70vh;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
</style>
