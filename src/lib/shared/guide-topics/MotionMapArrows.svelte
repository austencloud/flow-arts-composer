<!--
  Every move the blue hand can make from one point, drawn at once over the
  grid: both shifts and the dash as real arrows (one arrow-only
  pictograph each), plus a soft halo on the hand's own point for static,
  which has no arrow in the book. A lit move stays bright and the others dim.
  When `from` changes, each arrow's pictograph crossfades to its new path
  through PictographContainer's own content transition, and the halo fades
  across to the new point.
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
    type HandMove,
  } from "./hand-motions-topic.js";

  interface Props {
    from: GridLocation;
    lit: HandMove | null;
    /** 0 to 1, for the build's fade-in. */
    opacity: number;
  }

  let { from, lit, opacity }: Props = $props();

  const targets = $derived(motionMapTargets(from));
  const handPoints = getPlacementGridPoints(GridMode.DIAMOND);
  const dimmed = (move: HandMove) => lit !== null && lit !== move;
</script>

<div class="motion-map-arrows" style:opacity>
  {#each targets as target (target.slot)}
    <div class="layer" class:dim={dimmed(target.move)}>
      <PictographContainer
        pictographData={motionMapArrowData(from, target)}
        gridMode={GridMode.DIAMOND}
        leftPropTypeOverride={PropType.HAND}
        rightPropTypeOverride={PropType.HAND}
        visibleHand={HandSide.LEFT}
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
        class:shown={point.location === from}
        class:lit={lit === "static"}
        class:dim={dimmed("static")}
      />
    {/each}
  </svg>
</div>

<style>
  .motion-map-arrows {
    position: absolute;
    inset: 0;
  }
  .layer {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    transition: opacity var(--transition-normal);
  }
  .layer.dim {
    opacity: 0.3;
  }
  .halo circle {
    opacity: 0;
    fill: color-mix(in srgb, var(--prop-blue, #3b82f6) 8%, transparent);
    stroke: var(--prop-blue, #3b82f6);
    stroke-width: 5;
    stroke-opacity: 0.45;
    transition:
      opacity var(--transition-emphasis),
      stroke-opacity var(--transition-normal),
      fill var(--transition-normal);
  }
  .halo circle.shown {
    opacity: 1;
  }
  .halo circle.lit {
    stroke-opacity: 0.9;
    fill: color-mix(in srgb, var(--prop-blue, #3b82f6) 18%, transparent);
  }
  .halo circle.dim {
    stroke-opacity: 0.15;
  }
</style>
