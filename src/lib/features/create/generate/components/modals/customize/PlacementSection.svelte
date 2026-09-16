<!--
PlacementSection.svelte - Re-exports from shared for backwards compatibility
-->
<script lang="ts">
  import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
  import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
  import SharedPlacementSection from "$lib/shared/components/placement-picker/PlacementSection.svelte";

  let {
    title,
    description,
    currentPlacement,
    onPlacementChange,
    gridMode = GridMode.DIAMOND,
    disabled = false,
    disabledReason = "",
  } = $props<{
    title: string;
    description: string;
    currentPlacement: PictographData | null;
    onPlacementChange: (placement: PictographData | null) => void;
    gridMode?: GridMode;
    disabled?: boolean;
    disabledReason?: string;
  }>();
</script>

<SharedPlacementSection
  {title}
  {description}
  {currentPlacement}
  {onPlacementChange}
  {gridMode}
  {disabled}
  {disabledReason}
/>
