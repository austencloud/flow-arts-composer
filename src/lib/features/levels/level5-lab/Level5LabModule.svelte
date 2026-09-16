<script lang="ts">
  /**
   * Level 6 Lab Module (directory name `level5-lab` is historical)
   *
   * Admin-only sandbox for validating centric placement rendering.
   * Renders all 17 Tau/Terra placements as static pictographs with
   * per-card orientation controls.
   */

  import { GridMode, type GridPlacement } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
  import { Orientation } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import { getSettings } from "$lib/shared/application/state/app-state.svelte";
  import type { PlacementGroup, PlacementSection, CardOrientations } from "./domain/level5-lab-types";
  import {
    TAU_DIAMOND_PLACEMENTS,
    TAU_BOX_PLACEMENTS,
    TERRA_PLACEMENTS,
    isHandAtCenter,
  } from "./domain/level5-placement-data";
  import FilterChips from "./components/FilterChips.svelte";
  import PlacementGrid from "./components/PlacementGrid.svelte";


  let selectedGroup = $state<PlacementGroup>("all");

  /** Every placement tracked independently */
  const ALL_PLACEMENTS = [
    ...TAU_DIAMOND_PLACEMENTS,
    ...TAU_BOX_PLACEMENTS,
    ...TERRA_PLACEMENTS,
  ];

  /** Initialize per-card orientation map with sensible defaults */
  let orientationMap = $state<Map<GridPlacement, CardOrientations>>(
    new Map(
      ALL_PLACEMENTS.map((pos) => [
        pos,
        {
          left: isHandAtCenter(pos, "left") ? Orientation.CENTER_N : Orientation.IN,
          right: isHandAtCenter(pos, "right") ? Orientation.CENTER_N : Orientation.IN,
        },
      ])
    )
  );

  function handleOrientationChange(
    placement: GridPlacement,
    hand: "left" | "right",
    value: Orientation
  ): void {
    const current = orientationMap.get(placement);
    if (!current) return;
    const updated = new Map(orientationMap);
    updated.set(placement, { ...current, [hand]: value });
    orientationMap = updated;
  }


  const leftPropType = $derived.by(() => {
    const settings = getSettings();
    return (settings.leftPropType ?? settings.propType ?? PropType.STAFF) as PropType;
  });

  const rightPropType = $derived.by(() => {
    const settings = getSettings();
    return (settings.rightPropType ?? settings.propType ?? PropType.STAFF) as PropType;
  });

  const displaySections = $derived.by((): PlacementSection[] => {
    const sections: PlacementSection[] = [];

    if (selectedGroup === "all" || selectedGroup === "tau-diamond") {
      sections.push({
        label: "Tau Diamond",
        gridMode: GridMode.DIAMOND,
        placements: TAU_DIAMOND_PLACEMENTS,
      });
    }
    if (selectedGroup === "all" || selectedGroup === "tau-box") {
      sections.push({
        label: "Tau Box",
        gridMode: GridMode.BOX,
        placements: TAU_BOX_PLACEMENTS,
      });
    }
    if (selectedGroup === "all" || selectedGroup === "terra") {
      sections.push({
        label: "Terra",
        gridMode: GridMode.DIAMOND,
        placements: TERRA_PLACEMENTS,
      });
    }

    return sections;
  });
</script>

<div class="level5-lab">
  <header class="header">
    <div class="title-row">
      <h1>Level 6</h1>
      <span class="badge">Admin</span>
    </div>
    <p class="description">
      Centric placement rendering. Tau (one hand at center) and Terra (both at center).
    </p>
  </header>

  <FilterChips
    {selectedGroup}
    onSelect={(group) => (selectedGroup = group)}
  />

  <PlacementGrid
    sections={displaySections}
    {orientationMap}
    onOrientationChange={handleOrientationChange}
    {leftPropType}
    {rightPropType}
  />
</div>

<style>
  .level5-lab {
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
  }

  .header {
    padding: 1.5rem 1.5rem 1rem;
    flex-shrink: 0;
  }

  .title-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  h1 {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 600;
    color: var(--theme-text, #fff);
  }

  .badge {
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    background: rgba(249, 115, 22, 0.15);
    color: #f97316;
  }

  .description {
    margin: 0.5rem 0 0;
    font-size: var(--font-size-min, 14px);
    color: var(--theme-text-secondary, #888);
  }
</style>
