<!--
  One still pictograph on the Guide front page. Pictographs prepare on the
  client, so this mounts after hydration inside a box its parent sizes:
  nothing shifts when it appears and prerendering never touches the
  pictograph pipeline. Colours follow the app's own pictograph theme.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import PictographContainer from "#lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
  import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
  import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";

  let {
    pictographData,
    hands = false,
    showTKA = true,
    showReversals = false,
  }: {
    pictographData: PictographData | StepData | undefined;
    /** Draw both props as hands (the Grid and Placements pictures). */
    hands?: boolean;
    showTKA?: boolean;
    showReversals?: boolean;
  } = $props();

  let mounted = $state(false);
  onMount(() => (mounted = true));
</script>

<div class="hub-pictograph">
  {#if mounted && pictographData}
    <PictographContainer
      {pictographData}
      gridMode={GridMode.DIAMOND}
      leftPropTypeOverride={hands ? PropType.HAND : undefined}
      rightPropTypeOverride={hands ? PropType.HAND : undefined}
      showGrid={true}
      {showTKA}
      showPlacements={false}
      {showReversals}
      showTnD={false}
      showElemental={false}
      showNonRadialPoints={false}
      showHandPoints={hands}
      stepNumberOverride={false}
      disableTransitions={true}
    />
  {/if}
</div>

<style>
  .hub-pictograph {
    width: 100%;
    aspect-ratio: 1;
  }
</style>
