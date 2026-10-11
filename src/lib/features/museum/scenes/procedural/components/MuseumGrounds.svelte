<script lang="ts">
  import { calculateMuseumLayout } from "../domain/layout-calculator";
  import Pavilion from "./Pavilion.svelte";
  import ExhibitSlot from "./ExhibitSlot.svelte";
  import PerformerPlatform from "./PerformerPlatform.svelte";
  import type { MuseumState } from "#lib/shared/museum/state/museum-state.svelte.js";

  interface Props {
    museumState: MuseumState;
    groundY: number;
    playerPosition: { x: number; y: number; z: number };
  }

  let { museumState, groundY, playerPosition }: Props = $props();

  // Recalculate layout when exhibit count changes
  const layout = $derived.by(() => {
    const count = Math.max(1, museumState.populatedCount);
    return calculateMuseumLayout(count);
  });

  // Push layout to state whenever it recalculates
  $effect(() => {
    museumState.setLayout(layout);
  });

  // Placeholder thumbnail resolver - returns undefined for now.
  // Phase 4 will wire this to Firebase/cloud thumbnail URLs.
  function getThumbnailUrl(_sequenceId: string): string | undefined {
    return undefined;
  }
</script>

{#each layout.pavilions as pavilion (pavilion.id)}
  <Pavilion {pavilion} {groundY} />

  {#each pavilion.slots as slot (slot.id)}
    {#if slot.type === "wall"}
      <ExhibitSlot
        {slot}
        exhibit={museumState.getExhibitForSlot(slot.id)}
        thumbnailUrl={museumState.getExhibitForSlot(slot.id)
          ? getThumbnailUrl(museumState.getExhibitForSlot(slot.id)!.sequenceId)
          : undefined}
        {playerPosition}
        isOwner={museumState.isOwner}
      />
    {:else if slot.type === "performer"}
      <PerformerPlatform
        {slot}
        isPopulated={!!museumState.getExhibitForSlot(slot.id.replace("-performer-", "-wall-"))}
        {playerPosition}
      />
    {/if}
  {/each}
{/each}
