<!--
  One pairing of the guide's 144-cell matrix, opened over the guide
  (2026-11-07, Austen: a cell click took him out of the guide into the Shape
  Engine, "this is disruptive to the flow"). The Shape Engine's own cell drill
  draws it: the flower, traced live by the props in one of six element modes.
  Closing lands back on the matrix with the cell still marked; the Shape
  Engine link stays for anyone who wants the whole tool.

  A dialog, not the matrix's square: the drill stacks modes, the animation, a
  pictograph strip and its tabs, and in the square the animation got a strip
  120px tall. The canonical dialog owns focus, Escape and the backdrop.

  The drill reads its animation scope from context; the Shape Engine's shell
  provides one, so this host provides its own.
-->
<script lang="ts">
  import ShapeMatrixDrill from "@tka/shape-engine/components/ShapeMatrixDrill.svelte";
  import { setShapeMatrixAnimationContext } from "@tka/shape-engine/app/context/shape-matrix-animation-context.js";
  import { createShapeMatrixAnimationState } from "@tka/shape-engine/app/state/shape-matrix-animation-state.svelte.js";
  import type { ShapeMatrixData } from "@tka/shape-engine/services/shape-matrix-flowers.js";
  import type { VtgMode } from "@tka/shape-engine/services/shape-matrix-realizations.js";
  import type { Flower } from "@tka/shape-domain";
  import BaseModal from "#lib/shared/foundation/ui/modal/BaseModal.svelte";
  import LinkChip from "#lib/shared/ui/components/LinkChip.svelte";

  let {
    open = $bindable(false),
    data,
    pair,
    caption,
    engineHref,
    engineName,
    mode = $bindable(),
    propMode = $bindable(null),
  }: {
    open: boolean;
    data: ShapeMatrixData;
    pair: { left: Flower; right: Flower };
    /** Which pairing this is, in words: left hand and right. */
    caption: string;
    engineHref: string;
    engineName: string;
    /** The element mode the pairing plays in. The drill draws only a still
        flower until one is chosen, so the host starts it on one (the Shape
        Engine starts on the first) and keeps it from cell to cell. */
    mode: VtgMode | null;
    propMode?: VtgMode | null;
  } = $props();

  setShapeMatrixAnimationContext(createShapeMatrixAnimationState());

  // The drill stays mounted through the dialog's exit, then leaves.
  let shown = $state(false);
  $effect(() => {
    if (open) shown = true;
  });
</script>

<BaseModal
  bind:open
  size="xl"
  class="guide-matrix-pairing"
  labelledBy="guide-matrix-pairing-title"
  onclose={() => (open = false)}
  onclosed={() => (shown = false)}
>
  {#snippet header()}
    <div class="head">
      <div class="bar">
        <h2 id="guide-matrix-pairing-title">{caption}</h2>
        <LinkChip class="engine" href={engineHref}>{engineName}</LinkChip>
        <button
          type="button"
          class="close"
          onclick={() => (open = false)}
          aria-label="Back to the matrix"
        >
          <i class="fas fa-times" aria-hidden="true"></i>
        </button>
      </div>
    </div>
  {/snippet}
  <div class="drill-stage">
    {#if shown}
      <ShapeMatrixDrill
        {pair}
        {data}
        bind:selectedMode={mode}
        bind:selectedPropMode={propMode}
      />
    {/if}
  </div>
</BaseModal>

<style>
  /* Phones keep the canonical full-screen sheet; wider screens get a tall
     dialog so the animation has room. */
  @media (min-width: 521px) {
    :global(dialog.base-modal.guide-matrix-pairing[data-size="xl"]) {
      width: min(calc(100dvw - 2rem), 64rem);
      height: min(calc(100dvh - 2rem), 56rem);
    }
  }

  .head {
    container-type: inline-size;
  }

  .bar {
    grid-template-areas: "title engine close";
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    align-items: center;
    gap: 0.6rem;
    padding: 0.6rem 0.75rem 0.6rem 1.1rem;
    border-bottom: 1px solid var(--theme-stroke);
  }

  h2 {
    grid-area: title;
    margin: 0;
    min-inline-size: 0;
    overflow: hidden;
    color: var(--theme-text);
    font-size: var(--font-size-base, 1rem);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .bar :global(.engine) {
    grid-area: engine;
    min-block-size: var(--min-touch-target, 44px);
    padding-inline: 0.9rem;
  }

  .close {
    grid-area: close;
    display: grid;
    width: var(--min-touch-target, 44px);
    height: var(--min-touch-target, 44px);
    place-items: center;
    border: 1px solid var(--theme-stroke);
    border-radius: 50%;
    background: var(--theme-card-bg);
    color: var(--theme-text-dim);
    cursor: pointer;
  }

  .close:hover,
  .close:focus-visible {
    border-color: var(--theme-stroke-strong, var(--theme-stroke));
    color: var(--theme-text);
  }

  /* Phone width: one row still, so the animation keeps the height. The
     pairing's name wraps onto two short lines beside a smaller link. */
  @container (max-width: 34rem) {
    .bar {
      gap: 0.45rem;
      padding: 0.5rem 0.6rem 0.5rem 0.85rem;
    }

    h2 {
      font-size: 0.875rem;
      line-height: 1.25;
      white-space: normal;
    }

    .bar :global(.engine) {
      min-block-size: 2.25rem;
      padding-inline: 0.65rem;
      font-size: 0.8rem;
    }
  }

  /* The drill sizes itself from its container, as it does in the Shape
     Engine's detail pane. */
  .drill-stage {
    block-size: 100%;
    min-inline-size: 0;
    min-block-size: 0;
    padding: 0.75rem;
    box-sizing: border-box;
    overflow: hidden;
    background: var(--theme-panel-bg, #0a0f14);
    container: shape-matrix-drill / size;
  }
</style>
