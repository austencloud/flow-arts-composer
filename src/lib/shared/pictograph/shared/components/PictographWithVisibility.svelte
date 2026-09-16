<!--
PictographWithVisibility.svelte - Pictograph with Visibility Preview Controls

Thin wrapper around PictographContainer for visibility settings preview.
Handles the forceShowAll logic for showing all glyphs in settings panel.
-->
<script lang="ts">
  import type { PictographData } from "../domain/models/pictograph-data";
  import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
  import PictographContainer from "./PictographContainer.svelte";

  let {
    pictographData = null,
    stepData = null,
    forceShowAll = false,
    previewMode = false,
    onToggleTKA = undefined,
    onToggleTnD = undefined,
    onToggleElemental = undefined,
    onTogglePositions = undefined,
    onToggleReversals = undefined,
    onToggleNonRadial = undefined,
  } = $props<{
    pictographData?: PictographData | null;
    stepData?: StepData | null;
    forceShowAll?: boolean;
    previewMode?: boolean;
    onToggleTKA?: () => void;
    onToggleTnD?: () => void;
    onToggleElemental?: () => void;
    onTogglePositions?: () => void;
    onToggleReversals?: () => void;
    onToggleNonRadial?: () => void;
  }>();

  // Compute visibility overrides based on forceShowAll and previewMode
  // - forceShowAll + previewMode: undefined (use global state, previewMode handles dimming)
  // - forceShowAll + !previewMode: true (force everything visible)
  // - !forceShowAll: undefined (use global settings)
  const visibilityOverride = $derived(
    forceShowAll && !previewMode ? true : undefined
  );

  const effectiveData = $derived(pictographData || stepData);
</script>

<div class="pictograph-with-visibility">
  <PictographContainer
    pictographData={effectiveData}
    disableTransitions={true}
    {previewMode}
    showTKA={visibilityOverride}
    showTnD={visibilityOverride}
    showElemental={visibilityOverride}
    showPlacements={visibilityOverride}
    showReversals={visibilityOverride}
    showNonRadialPoints={visibilityOverride}
    {onToggleTKA}
    {onToggleTnD}
    {onToggleElemental}
    {onTogglePositions}
    {onToggleReversals}
    {onToggleNonRadial}
  />
</div>

<style>
  .pictograph-with-visibility {
    position: relative;
    width: 100%;
    height: 100%;
  }
</style>
