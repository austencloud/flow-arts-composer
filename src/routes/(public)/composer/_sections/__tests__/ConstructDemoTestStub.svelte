<!--
  Stands in for the construct demo's heavy children in component tests. A start
  picker or option picker becomes one button that makes its pick; the player
  and the step grid render nothing.
-->
<script lang="ts">
  import { createPictographData } from "$lib/shared/pictograph/shared/domain/factories/create-pictograph-data";
  import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";

  let {
    startPlacementState,
    onOptionSelected,
  }: {
    startPlacementState?: {
      selectPlacement: (placement: PictographData) => unknown;
    };
    onOptionSelected?: (option: PictographData) => void;
  } = $props();
</script>

{#if startPlacementState}
  <button
    type="button"
    onclick={() =>
      startPlacementState?.selectPlacement(
        createPictographData({ letter: "α" })
      )}
  >
    Choose start
  </button>
{:else if onOptionSelected}
  <button
    type="button"
    onclick={() => onOptionSelected?.(createPictographData({ letter: "A" }))}
  >
    Add step
  </button>
{/if}
