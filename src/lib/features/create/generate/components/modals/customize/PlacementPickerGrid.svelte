<!--
PlacementPickerGrid.svelte - Re-exports from shared for backwards compatibility
-->
<script lang="ts">
  import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
  import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
  import SharedPlacementPickerGrid from "$lib/shared/components/placement-picker/PlacementPickerGrid.svelte";

  let {
    currentPlacement = null,
    onPlacementChange,
    gridMode = GridMode.DIAMOND,
  } = $props<{
    currentPlacement: PictographData | null;
    onPlacementChange: (placement: PictographData | null) => void;
    gridMode?: GridMode;
  }>();
</script>

<SharedPlacementPickerGrid {currentPlacement} {onPlacementChange} {gridMode} />
