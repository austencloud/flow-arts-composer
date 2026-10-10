<script lang="ts">
  import { getViewer3DContext } from "../../context/viewer-3d-context";
  import FormationSelector from "./FormationSelector.svelte";
  import { PRESET_VALID_COUNTS } from "@austencloud/scene-3d";
  import type { FormationPreset } from "@austencloud/scene-3d";
  import {
    reportViewerControlChange,
    type ViewerControlSink,
  } from "#lib/shared/sequence-viewer/domain/viewer-control-analytics.js";

  interface Props {
    onSettingChange?: ViewerControlSink;
  }
  let { onSettingChange }: Props = $props();

  const viewer = getViewer3DContext();
  const performerCount = $derived(viewer.performerManager.performers.length);

  const disabledPresets = $derived.by(() => {
    const disabled = new Set<FormationPreset>();
    for (const [preset, validCounts] of Object.entries(PRESET_VALID_COUNTS)) {
      if (!validCounts.includes(performerCount)) {
        disabled.add(preset as FormationPreset);
      }
    }
    return disabled;
  });

  function handleFormationChange(preset: FormationPreset) {
    const previous = viewer.activeFormation;
    viewer.applyFormationFromUI(preset);
    reportViewerControlChange(
      onSettingChange,
      "viewer_3d_formation",
      "preset",
      previous,
      preset
    );
  }
</script>

<div class="formation-content">
  <FormationSelector
    value={viewer.activeFormation === "manual"
      ? "grid-2x2"
      : viewer.activeFormation}
    {performerCount}
    {disabledPresets}
    onchange={handleFormationChange}
  />
</div>

<style>
  .formation-content {
    --theme-panel-bg: rgba(0, 0, 0, 0.3);
    --theme-stroke: rgba(255, 255, 255, 0.08);
    --theme-text-dim: rgba(255, 255, 255, 0.5);
    --theme-text: rgba(255, 255, 255, 0.9);
    --theme-card-hover-bg: rgba(255, 255, 255, 0.08);
    --theme-accent: color-mix(in srgb, #60a5fa 30%, transparent);
  }
  .formation-content :global(.formation-btn.active) {
    background: color-mix(in srgb, #60a5fa 25%, transparent);
    border: 1px solid color-mix(in srgb, #60a5fa 45%, transparent);
    box-shadow: 0 2px 8px color-mix(in srgb, #60a5fa 18%, transparent);
  }
</style>
