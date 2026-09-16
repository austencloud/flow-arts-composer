<script lang="ts">
  import type { PlacementGroup } from "../domain/level5-lab-types";
  import {
    TAU_DIAMOND_PLACEMENTS,
    TAU_BOX_PLACEMENTS,
    TERRA_PLACEMENTS,
  } from "../domain/level5-placement-data";
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";

  let {
    selectedGroup,
    onSelect,
  } = $props<{
    selectedGroup: PlacementGroup;
    onSelect: (group: PlacementGroup) => void;
  }>();

  const totalCount =
    TAU_DIAMOND_PLACEMENTS.length +
    TAU_BOX_PLACEMENTS.length +
    TERRA_PLACEMENTS.length;

  const options = $derived<{ value: PlacementGroup; label: string; count: number }[]>([
    { value: "all", label: "All", count: totalCount },
    { value: "tau-diamond", label: "Tau Diamond", count: TAU_DIAMOND_PLACEMENTS.length },
    { value: "tau-box", label: "Tau Box", count: TAU_BOX_PLACEMENTS.length },
    { value: "terra", label: "Terra", count: TERRA_PLACEMENTS.length },
  ]);
</script>

<nav class="filter-chips">
  <SegmentedControl
    {options}
    value={selectedGroup}
    onchange={onSelect}
    color="accent"
    size="sm"
  />
</nav>

<style>
  .filter-chips {
    padding: 0 1.5rem 1rem;
    flex-shrink: 0;
  }
</style>
