<!--
  MandalaContrast

  One sequence drawn as mandalas, so the reader sees what a prop's ends do to
  the pattern. Two shapes:
  - A pair (the default): staves on the left, the picked prop on the right.
    Staves trace two tip paths, a one-ended prop traces one, and the shared
    propTipEnds() rule inside SequenceMandala decides which is which.
  - A single cell (`cells` holds one entry): one prop's own drawing, for a
    sequence that has no staff twin to compare against.

  The pair's left cell never changes. When the right prop changes, its label
  fades on the shared Crossfade, and its drawing fades only when the drawing
  itself differs (two-ended against one-ended), so fan and club, which draw
  the same, do not flash. The stage is a fixed square either way.

  Same LazyMount/idle-activation plumbing as SequenceHeroDemo, fixed-aspect
  stages per no-layout-shift.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import LazyMount from "#lib/shared/components/LazyMount.svelte";
  import { Crossfade } from "#lib/shared/transitions/motion.js";
  import { DURATION } from "#lib/shared/transitions/transitions.js";
  import { propTipEnds } from "#lib/shared/pictograph/prop/domain/prop-tip-ends.js";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";

  interface Cell {
    /** Prop type id the cell draws with. */
    prop: string;
    /** Already-translated label under the drawing. */
    label: string;
  }

  let {
    sequence,
    cells,
    note,
  }: { sequence: SequenceData; cells: Cell[]; note?: string } = $props();

  let active = $state(false);
  let reducedMotion = $state(false);

  onMount(() => {
    reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    if (typeof requestIdleCallback !== "undefined") {
      requestIdleCallback(() => (active = true), { timeout: 2500 });
    } else {
      setTimeout(() => (active = true), 300);
    }
  });

  const single = $derived(cells.length === 1);
  const left = $derived(cells[0]);
  const right = $derived(cells[1]);
</script>

{#snippet drawing(seq: SequenceData, prop: string)}
  <LazyMount
    loader={() =>
      import("#lib/shared/mandala/components/SequenceMandala.svelte")}
    {active}
    props={{
      sequence: seq,
      leftPropType: prop,
      rightPropType: prop,
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
{/snippet}

<figure class="mandala-contrast">
  <Crossfade key={single ? "single" : "pair"} duration={DURATION.normal} animateHeight>
    <div class="pair" class:single>
      {#if single && left}
        <div class="cell">
          <div class="stage">{@render drawing(sequence, left.prop)}</div>
          <span class="label">{left.label}</span>
        </div>
      {:else if left && right}
        <div class="cell">
          <div class="stage">{@render drawing(sequence, left.prop)}</div>
          <span class="label">{left.label}</span>
        </div>
        <div class="cell">
          <div class="stage">
            <Crossfade key={propTipEnds(right.prop)} duration={DURATION.normal} fill>
              {@render drawing(sequence, right.prop)}
            </Crossfade>
          </div>
          <Crossfade key={right.label} duration={DURATION.normal}>
            <span class="label">{right.label}</span>
          </Crossfade>
        </div>
      {/if}
    </div>
  </Crossfade>
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

  /* One drawing: a sensible single size, centred, instead of stretching a
     square stage across the whole column. */
  .pair.single {
    grid-template-columns: minmax(0, 1fr);
    max-width: 22rem;
    margin-inline: auto;
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
  /* SequenceMandala renders at a fixed pixel size; scale it to the stage.
     Its wrapper carries that size inline, and in a stage narrower than it the
     wrapper shrank in width only, so the drawing was stretched and cut. */
  .stage :global(.mandala-container) {
    width: 100% !important;
    height: 100% !important;
  }
  .stage :global(svg),
  .stage :global(canvas) {
    width: 100% !important;
    height: 100% !important;
  }

  /* Two lines reserved, so a label that wraps in one language or prop never
     changes the cell's height. */
  .label {
    min-height: 2.6em;
    line-height: 1.3;
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
