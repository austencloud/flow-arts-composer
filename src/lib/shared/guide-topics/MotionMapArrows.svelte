<!--
  One move of one hand (blue unless `hand` says red), drawn over the grid: a shift or the dash as a
  real arrow (one arrow-only pictograph each), or, for static, a soft halo on
  the hand's own point, which has no arrow in the book. Every move from `from`
  stays mounted and hidden, so showing one is a fade, not a fresh render.
  `to` null fades the shown move out.
-->
<script lang="ts">
  import PictographContainer from "#lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import {
    GridMode,
    type GridLocation,
  } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
  import { getPlacementGridPoints } from "#lib/shared/pictograph/grid/services/placement-grid-points.js";
  import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import { HandSide } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
  import {
    motionMapArrowData,
    motionMapTargets,
  } from "./hand-motions-topic.js";

  interface Props {
    from: GridLocation;
    /** Where the shown move ends; `from` itself for static, null for none. */
    to: GridLocation | null;
    hand?: HandSide;
  }

  let { from, to, hand = HandSide.LEFT }: Props = $props();

  const targets = $derived(motionMapTargets(from));
  const handPoints = getPlacementGridPoints(GridMode.DIAMOND);
</script>

<div class="motion-map-arrows" class:red={hand === HandSide.RIGHT}>
  {#each targets as target (target.slot)}
    <div class="layer" class:shown={target.to === to}>
      <PictographContainer
        pictographData={motionMapArrowData(from, target, hand)}
        gridMode={GridMode.DIAMOND}
        leftPropTypeOverride={PropType.HAND}
        rightPropTypeOverride={PropType.HAND}
        visibleHand={hand}
        showGrid={false}
        showProps={false}
        transparentBackground={true}
        showTKA={false}
        showReversals={false}
        showTnD={false}
        showElemental={false}
        showPlacements={false}
        showNonRadialPoints={false}
        showHandPoints={false}
        stepNumberOverride={false}
      />
    </div>
  {/each}
  <svg class="layer halo" viewBox="0 0 950 950" aria-hidden="true">
    {#each handPoints as point (point.location)}
      <circle
        cx={point.x}
        cy={point.y}
        r="78"
        class:shown={point.location === from && to === from}
      />
    {/each}
  </svg>
</div>

<style>
  .motion-map-arrows {
    --hand-color: var(--prop-blue, #3b82f6);
    position: absolute;
    inset: 0;
  }
  .motion-map-arrows.red {
    --hand-color: var(--prop-red, #ef4444);
  }
  .layer {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }
  .layer:not(.halo),
  .halo circle {
    opacity: 0;
    transition: opacity var(--transition-normal);
  }
  .layer.shown,
  .halo circle.shown {
    opacity: 1;
  }
  .halo circle {
    fill: color-mix(in srgb, var(--hand-color) 14%, transparent);
    stroke: var(--hand-color);
    stroke-width: 5;
    stroke-opacity: 0.8;
  }
</style>
