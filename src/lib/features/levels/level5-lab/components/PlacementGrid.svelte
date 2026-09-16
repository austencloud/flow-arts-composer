<script lang="ts">
  import type { GridPlacement } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
  import type { Orientation } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
  import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import type { PlacementSection, CardOrientations } from "../domain/level5-lab-types";
  import PlacementCard from "./PlacementCard.svelte";

  let {
    sections,
    orientationMap,
    onOrientationChange,
    leftPropType,
    rightPropType,
  } = $props<{
    sections: PlacementSection[];
    orientationMap: Map<GridPlacement, CardOrientations>;
    onOrientationChange: (placement: GridPlacement, hand: "left" | "right", value: Orientation) => void;
    leftPropType: PropType;
    rightPropType: PropType;
  }>();
</script>

<div class="sections themed-scrollbar">
  {#each sections as section (section.label)}
    <section class="placement-section">
      <h2 class="section-heading">
        {section.label}
        <span class="section-mode">{section.gridMode}</span>
      </h2>
      <div class="grid">
        {#each section.placements as placement (placement)}
          {@const orientations = orientationMap.get(placement)}
          {#if orientations}
            <PlacementCard
              {placement}
              {orientations}
              {onOrientationChange}
              {leftPropType}
              {rightPropType}
            />
          {/if}
        {/each}
      </div>
    </section>
  {/each}
</div>

<style>
  .sections {
    flex: 1;
    overflow-y: auto;
    padding: 0 1.5rem 1.5rem;
  }

  .placement-section {
    margin-bottom: 1.5rem;
  }

  .placement-section:last-child {
    margin-bottom: 0;
  }

  .section-heading {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin: 0 0 0.75rem;
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
    color: var(--theme-text, #fff);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .section-mode {
    font-size: var(--font-size-compact, 12px);
    font-weight: 500;
    text-transform: lowercase;
    letter-spacing: normal;
    padding: 0.125rem 0.5rem;
    border-radius: 4px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
    color: var(--theme-text-secondary, #888);
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 1rem;
  }
</style>
