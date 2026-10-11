<script lang="ts">
  /**
   * SceneFeatureToggles
   *
   * Content for the "Scene" tab in Viewer3DGearPopover.
   * Renders chip-style toggles for each scene feature.
   */

  import { getSceneFeatureContext } from "../context/scene-feature-context";
  import FilterChipBase from "#lib/shared/browse/components/filter-chips/FilterChipBase.svelte";

  const sceneFeatures = getSceneFeatureContext();
</script>

<div class="scene-chips">
  {#each sceneFeatures.features as feature (feature.key)}
    <FilterChipBase
      label={feature.label}
      mode="toggle"
      active={sceneFeatures.isEnabled(feature.key)}
      size="sm"
      onclick={() => sceneFeatures.toggle(feature.key)}
    />
  {/each}
</div>

<style>
  .scene-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 4px 0;
  }
</style>
