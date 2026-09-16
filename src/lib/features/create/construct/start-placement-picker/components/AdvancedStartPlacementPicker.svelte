<!-- AdvancedStartPlacementPicker.svelte - Advanced start placement picker with all 16 variations -->
<script lang="ts">
  import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
  import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
  import SimpleGlassScroll from "$lib/shared/foundation/ui/SimpleGlassScroll.svelte";
  import { onMount } from "svelte";
  import { createAdvancedPickerState } from "../state/advanced-picker-state.svelte";
  import PlacementGroupGrid from "./PlacementGroupGrid.svelte";
  import ResponsivePlacementGrid from "./ResponsivePlacementGrid.svelte";

  const {
    pictographDataSet,
    selectedPictograph = null,
    currentGridMode,
    onPictographSelect,
    isSideBySideLayout = () => false,
  }: {
    pictographDataSet: PictographData[];
    selectedPictograph?: PictographData | null;
    currentGridMode: GridMode;
    onPictographSelect: (pictograph: PictographData) => void;
    isSideBySideLayout?: () => boolean;
  } = $props();

  // Create state for UI management
  const pickerState = createAdvancedPickerState();

  // Derived state from picker state
  const isTransitioning = $derived(pickerState.isTransitioning);
  const hasOverflow = $derived(pickerState.hasOverflow);

  // Trigger animation on mount
  onMount(() => {
    pickerState.initializeAnimations();
  });

  // Watch for grid mode changes
  $effect(() => {
    pickerState.handleGridModeChange(currentGridMode, currentGridMode);
  });

  // Check overflow when data changes
  $effect(() => {
    pictographDataSet; // Track dependency
    requestAnimationFrame(() => {
      // Note: overflow detection will be handled by ResponsivePlacementGrid
    });
  });

  // Organize pictographs by placement (Alpha, Beta, Gamma)
  function getPlacementGroups() {
    const groups = {
      alpha: [] as PictographData[],
      beta: [] as PictographData[],
      gamma: [] as PictographData[],
    };

    pictographDataSet.forEach((pictograph) => {
      const placement = pictograph.startPlacement?.toLowerCase() || "";
      if (placement.startsWith("alpha")) {
        groups.alpha.push(pictograph);
      } else if (placement.startsWith("beta")) {
        groups.beta.push(pictograph);
      } else if (placement.startsWith("gamma")) {
        groups.gamma.push(pictograph);
      }
    });

    return groups;
  }

  const placementGroups = $derived(getPlacementGroups());
</script>

<div class="advanced-picker-container">
  <!-- Responsive Grid of all 16 start placements -->
  <SimpleGlassScroll variant="primary" height="100%" width="100%">
    <ResponsivePlacementGrid
      {isTransitioning}
      {hasOverflow}
      {isSideBySideLayout}
    >
      <!-- Alpha row (4 variations) -->
      <PlacementGroupGrid
        pictographs={placementGroups.alpha}
        {selectedPictograph}
        groupClass="alpha-row"
        startIndex={0}
        shouldAnimate={pickerState.shouldPictographAnimate}
        {isTransitioning}
        onSelect={onPictographSelect}
        onAnimationEnd={pickerState.markAnimationComplete}
      />

      <!-- Beta row (4 variations) -->
      <PlacementGroupGrid
        pictographs={placementGroups.beta}
        {selectedPictograph}
        groupClass="beta-row"
        startIndex={placementGroups.alpha.length}
        shouldAnimate={pickerState.shouldPictographAnimate}
        {isTransitioning}
        onSelect={onPictographSelect}
        onAnimationEnd={pickerState.markAnimationComplete}
      />

      <!-- Gamma rows (8 variations) -->
      <PlacementGroupGrid
        pictographs={placementGroups.gamma}
        {selectedPictograph}
        groupClass="gamma-row"
        startIndex={placementGroups.alpha.length + placementGroups.beta.length}
        shouldAnimate={pickerState.shouldPictographAnimate}
        {isTransitioning}
        onSelect={onPictographSelect}
        onAnimationEnd={pickerState.markAnimationComplete}
      />
    </ResponsivePlacementGrid>
  </SimpleGlassScroll>
</div>

<style>
  .advanced-picker-container {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    padding: 0;
    box-sizing: border-box;
    overflow: hidden;
    position: relative;
  }
</style>
