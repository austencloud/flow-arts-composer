<!--
  The two hands on the diamond grid (ALPHA3: blue at west, red at east), the
  same canonical pictograph the print sheet uses. It prepares on the client,
  so it mounts after hydration inside a box its parent sizes; nothing shifts
  when it appears, and prerendering never touches the pictograph pipeline.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import PictographContainer from "#lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
  import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import { THE_GRID_ALPHA3 } from "../_data/the-grid-pictograph";

  let {
    darkMode = false,
    printMode = false,
  }: { darkMode?: boolean; printMode?: boolean } = $props();

  let mounted = $state(false);
  onMount(() => (mounted = true));
</script>

<div class="hands-art">
  {#if mounted && THE_GRID_ALPHA3}
    <PictographContainer
      pictographData={THE_GRID_ALPHA3}
      gridMode={GridMode.DIAMOND}
      leftPropTypeOverride={PropType.HAND}
      rightPropTypeOverride={PropType.HAND}
      showGrid={true}
      showTKA={false}
      showPlacements={false}
      showReversals={false}
      showTnD={false}
      showElemental={false}
      showNonRadialPoints={false}
      showHandPoints={true}
      {darkMode}
      {printMode}
      disableTransitions={true}
    />
  {/if}
</div>

<style>
  .hands-art {
    width: 100%;
    height: 100%;
  }
</style>
