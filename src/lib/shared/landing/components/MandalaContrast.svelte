<!--
  MandalaContrast

  One sequence, two mandalas: rendered once with staves (two tip paths) and
  once with clubs (one tip path). This is the visual proof of the dual-ended
  collapse on the per-prop notation pages — the same math traces twice the
  pattern when the prop has a second end.

  Grep evidence (2026-07-17): the existing mandala components are the viewer
  pane (MandalaPane) and the loading visual (MandalaLoader); no public-page
  embed exists. Same LazyMount/idle-activation plumbing as SequenceHeroDemo,
  fixed-aspect stages per no-layout-shift.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import LazyMount from "#lib/shared/components/LazyMount.svelte";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";

  let { sequence, note }: { sequence: SequenceData; note?: string } = $props();

  let active = $state(false);
  let reducedMotion = $state(false);

  onMount(() => {
    reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (typeof requestIdleCallback !== "undefined") {
      requestIdleCallback(() => (active = true), { timeout: 2500 });
    } else {
      setTimeout(() => (active = true), 300);
    }
  });

  const CELLS = [
    { prop: "staff", label: "Staves: both ends traced" },
    { prop: "club", label: "Clubs: one end traced" },
  ] as const;
</script>

<figure class="mandala-contrast">
  <div class="pair">
    {#each CELLS as cell (cell.prop)}
      <div class="cell">
        <div class="stage">
          <LazyMount
            loader={() => import("#lib/shared/mandala/components/SequenceMandala.svelte")}
            {active}
            props={{
              sequence,
              leftPropType: cell.prop,
              rightPropType: cell.prop,
              show: "both",
              style: "stroke",
              size: 300,
              darkMode: true,
              animate: !reducedMotion,
              animateMin: 80,
              animateMax: 170,
              animatePeriod: 6,
            }}
          />
        </div>
        <span class="label">{cell.label}</span>
      </div>
    {/each}
  </div>
  {#if note}
    <figcaption>{note}</figcaption>
  {/if}
</figure>

<style>
  .mandala-contrast {
    margin: 2.4rem auto 0;
    max-width: 100%;
  }

  .pair {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1rem;
  }

  .cell {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.7rem;
  }

  .stage {
    position: relative;
    width: 100%;
    aspect-ratio: 1;
    border-radius: 18px;
    overflow: hidden;
    background: oklch(0.16 0.018 270 / 0.45);
    border: 1px solid oklch(0.4 0.04 270 / 0.14);
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  /* SequenceMandala renders at a fixed pixel size; scale it to the stage. */
  .stage :global(svg),
  .stage :global(canvas) {
    width: 100% !important;
    height: 100% !important;
  }

  .label {
    font-size: 0.85rem;
    color: oklch(0.72 0.012 270);
    text-align: center;
  }

  figcaption {
    margin-top: 0.9rem;
    text-align: center;
    font-size: 0.85rem;
    color: oklch(0.62 0.02 270);
  }

  /* No wide-screen type tier: the visual uses its authored logical sizes. */
</style>
