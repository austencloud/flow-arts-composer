<script lang="ts">
  import { getViewer3DContext } from "../../context/viewer-3d-context";
  import EffortPalette from "#lib/shared/phrase-effort-lab/components/EffortPalette.svelte";
  import CascadeBadge from "./CascadeBadge.svelte";
  import type { EffortId } from "#lib/shared/effort/domain/effort-types.js";

  const viewer = getViewer3DContext();
  const scopedPerformers = $derived(viewer.scopedPerformers());
  const selected = $derived(scopedPerformers[0] ?? null);
  const isAllMode = $derived(viewer.isAllPerformersSelected);
  const isMultiMode = $derived(scopedPerformers.length > 1 && !isAllMode);

  const currentEffort = $derived(
    scopedPerformers.every(
      (performer) =>
        performer.effectiveEffortId === scopedPerformers[0]?.effectiveEffortId
    )
      ? (selected?.effectiveEffortId ?? viewer.defaultSettings.effortId)
      : null
  );

  const isOverridden = $derived(
    !isAllMode &&
      scopedPerformers.some((performer) => performer.hasOverride.effort)
  );
  const overrideCount = $derived(
    scopedPerformers.filter((performer) => performer.hasOverride.effort).length
  );

  function handleSelect(effortId: EffortId) {
    viewer.setEffortScoped(effortId);
  }
</script>

<div
  style="--theme-stroke: rgba(255,255,255,0.1); --theme-card-bg: rgba(255,255,255,0.04); --theme-text-dim: rgba(255,255,255,0.5);"
>
  {#if (isAllMode || isMultiMode) && overrideCount > 0}
    <CascadeBadge
      mode="overrides"
      {overrideCount}
      categoryLabel="effort"
      onReset={() => viewer.resetEffortScoped()}
    />
  {:else if !isAllMode && !isMultiMode && isOverridden}
    <CascadeBadge mode="custom" onReset={() => viewer.resetEffortScoped()} />
  {:else if !isAllMode && !isMultiMode}
    <CascadeBadge mode="default" />
  {/if}

  <EffortPalette selectedEffort={currentEffort} onSelect={handleSelect} />
</div>
