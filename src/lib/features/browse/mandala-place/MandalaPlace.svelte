<!--
  MandalaPlace: Browse's third view, the wall of every mandala and one
  mandala's page, swapped with the standard panel Crossfade.

  It hands the engine's whole pool to the mandala index (the engine itself
  feeds the index only while a Mandala filter is on), reads the climb's
  families, and resolves the address's family value. A value that no family
  holds once families are final for the complete pool goes back to the wall.

  Spec: docs/superpowers/specs/2026-11-11-mandala-wall-design.md.
-->
<script lang="ts">
  import { untrack } from "svelte";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { Crossfade } from "#lib/shared/transitions/motion.js";
  import { DURATION } from "#lib/shared/transitions/transitions.js";
  import { mandalaIndex } from "#lib/shared/browse/services/mandala-index.svelte.js";
  import {
    mandalaClimb,
    mandalaFamiliesSettled,
  } from "#lib/shared/browse/services/mandala-climb.svelte.js";
  import { resolveMandalaPlace } from "./mandala-place-resolve";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import { openSequenceViewer } from "#lib/shared/sequence-viewer/services/sequence-viewer-navigator.js";
  import { mandalaPlace } from "./mandala-place-state.svelte";
  import MandalaWall from "./MandalaWall.svelte";
  import MandalaPage from "./MandalaPage.svelte";

  interface Props {
    /** Every sequence Browse has, and whether the engine has a first stage of it. */
    pool: readonly SequenceData[];
    poolReady: boolean;
    /** True once no further stage of the pool is coming (or loading failed):
     *  the engine's `poolComplete`. Without it the first stage counts. */
    poolComplete?: boolean;
  }

  let { pool, poolReady, poolComplete }: Props = $props();

  $effect(() => {
    if (!poolReady) return;
    const sequences = pool;
    untrack(() => mandalaIndex.setPool(sequences));
  });

  const families = $derived(mandalaClimb.families);
  const ready = $derived(mandalaClimb.ready);
  // Families are final for the complete pool: the same test the Mandala
  // filter uses, plus the engine's word that no stage is still coming.
  const settled = $derived(
    poolReady &&
      (poolComplete ?? true) &&
      mandalaFamiliesSettled(mandalaIndex, mandalaClimb, pool)
  );
  const empty = $derived(settled && families.length === 0);

  const view = $derived(
    resolveMandalaPlace({
      value: mandalaPlace.familyValue,
      settled,
      families,
      familyOf: (value) => mandalaClimb.familyOf(value),
      groupOf: (key) => mandalaIndex.groupOf(key),
    })
  );
  const family = $derived(view.family);
  const familyIndex = $derived(view.familyIndex);

  // An address naming a mandala no final family holds (a stale link, a
  // changed pool) lands on the wall instead of a page that never fills.
  // Families built from an early stage of the pool do not count: a family
  // only the whole pool holds would be sent away before it exists.
  $effect(() => {
    if (view.backToWall) untrack(() => mandalaPlace.backToWall());
  });

  function openSequence(sequence: SequenceData): void {
    openSequenceViewer(sequence, {
      source: "browse_gallery",
      returnPath: `${window.location.pathname}${window.location.search}`,
      returnLabel: t("browse_mandala_wall_title"),
    });
  }
</script>

<div class="mandala-place">
  <Crossfade
    key={mandalaPlace.familyValue ? "page" : "wall"}
    duration={DURATION.normal}
    fill
  >
    {#if mandalaPlace.familyValue}
      <MandalaPage
        {family}
        simpler={familyIndex > 0 ? (families[familyIndex - 1] ?? null) : null}
        busier={familyIndex >= 0 && familyIndex < families.length - 1
          ? (families[familyIndex + 1] ?? null)
          : null}
        sequenceId={mandalaPlace.sequenceId}
        {settled}
        onBack={() => mandalaPlace.backToWall()}
        onStep={(next) => mandalaPlace.stepTo(next.value)}
        onChoose={(id) => mandalaPlace.chooseSequence(id)}
        onOpen={openSequence}
      />
    {:else}
      <MandalaWall
        {families}
        {ready}
        {empty}
        {settled}
        anchor={mandalaPlace.wallAnchor}
        lastOpened={mandalaPlace.lastOpened}
        onAnchor={(id) => mandalaPlace.setWallAnchor(id)}
        onOpen={(opened) => mandalaPlace.openFamily(opened.value)}
        onBack={() => mandalaPlace.close()}
      />
    {/if}
  </Crossfade>
</div>

<style>
  .mandala-place {
    position: relative;
    width: 100%;
    height: 100%;
    min-height: 0;
    overflow: hidden;
    container-type: size;
  }
</style>
