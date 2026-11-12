<!--
  MandalaFilterStill: the applied Mandala filter's own picture, for a chip.

  A mandala family has no name, so "Mandala: Mandala" said nothing. The chip
  shows the family's small still in the text colour instead. Until the climb
  has resolved the family the box is held empty at the same size, so the chip
  does not change width when the still arrives. The still is decorative; the
  chip keeps "Mandala" as its accessible name.
-->
<script lang="ts">
  import MandalaStill from "#lib/shared/mandala/components/MandalaStill.svelte";
  import { mandalaClimb } from "#lib/shared/browse/services/mandala-climb.svelte.js";

  let { value }: { value: unknown } = $props();

  /** Drawn at the box's pixel size so the line weight suits a chip. */
  const STILL_PX = 20;

  const family = $derived(
    typeof value === "string" && value ? mandalaClimb.familyOf(value) : undefined
  );
</script>

<span class="mandala-filter-still" aria-hidden="true">
  {#if family}
    <MandalaStill
      key={family.representative.key}
      paths={family.representative.paths}
      size={STILL_PX}
      tone="ink"
    />
  {/if}
</span>

<style>
  .mandala-filter-still {
    display: inline-block;
    flex: none;
    width: 1.25rem;
    height: 1.25rem;
    color: currentColor;
  }
</style>
