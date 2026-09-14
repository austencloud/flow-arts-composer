<script lang="ts">
  import ShapeMatrixGrid from "$lib/shared/shape-matrix/components/ShapeMatrixGrid.svelte";
  import type { Flower } from "$lib/shared/shape-matrix/domain/flower-signature";
  import { getShapeMatrixAppContext } from "../context/shape-matrix-app-context";
  import { getShapeMatrixAnimationContext } from "../context/shape-matrix-animation-context";
  import { customizeSection } from "../state/shape-matrix-customize";
  import ShapeMatrixDifficultyStrip from "./ShapeMatrixDifficultyStrip.svelte";
  import ShapeMatrixGridCorner from "./ShapeMatrixGridCorner.svelte";
  import ShapeMatrixRecipeStrip from "./ShapeMatrixRecipeStrip.svelte";

  interface Props {
    /** The shell owns navigation (and the compact tile-to-hero morph). */
    onselect?: (pair: { left: Flower; right: Flower }) => void;
    /** A header: that axis item alone, on that hand. */
    onsolo?: (hand: "left" | "right", flower: Flower) => void;
    /** The shell owns the roll too, for the same compact morph. */
    onsurprise?: () => void;
  }
  let { onselect, onsolo, onsurprise }: Props = $props();

  const state = getShapeMatrixAppContext();
  const animationState = getShapeMatrixAnimationContext();
  const surprise = $derived(onsurprise ?? (() => state.surpriseMe()));
  /* The customize workspace covers this pane on wide hosts (the shell mounts
     it over the pane, once for both surfaces); the grid underneath is not
     something to tab into while it does. */
  const workspaceOpen = $derived(
    customizeSection(state, animationState) !== null
  );
</script>

{#snippet cornerGuide()}
  <ShapeMatrixGridCorner surface="level" onsurprise={surprise} />
{/snippet}

<section
  class="matrix-pane"
  class:compact={state.compact}
  aria-label="Shape matrix"
>
  {#if state.compact}
    <ShapeMatrixRecipeStrip surface="level" onsurprise={surprise} />
  {:else}
    <ShapeMatrixDifficultyStrip />
  {/if}
  <div class="matrix-stage" inert={workspaceOpen} aria-hidden={workspaceOpen}>
    {#if state.loadError}
      <div class="status error" role="alert">
        <p>The matrix could not be built.</p>
        <button type="button" onclick={state.load}>Try again</button>
      </div>
    {:else if !state.data}
      <p class="status" aria-live="polite">Building the matrix…</p>
    {:else}
      <ShapeMatrixGrid
        data={state.data}
        rowAxis={state.rowAxis}
        colAxis={state.colAxis}
        maxCellPx={320}
        selectedPair={state.selectedPair}
        claimSelected={state.compact && state.activeView === "matrix"}
        corner={cornerGuide}
        revealToken={state.revealToken}
        onselect={onselect ?? state.selectPair}
        onsolo={onsolo ?? state.selectSolo}
        soloHand={state.soloHand}
      />
    {/if}
  </div>
</section>

<style>
  .matrix-pane {
    position: relative;
    height: 100%;
    min-height: 0;
    display: grid;
    /* A strip above the grid in both hosts: difficulty on a wide one, the
       recipe on a compact one. */
    grid-template-rows: auto minmax(0, 1fr);
    overflow: hidden;
    border: 1px solid var(--theme-stroke, rgb(255 255 255 / 0.1));
    border-radius: 16px;
    background: var(--theme-panel-bg, rgb(16 23 33 / 0.82));
  }

  .status button {
    min-height: var(--min-touch-target, 44px);
    border: 1px solid
      color-mix(in srgb, var(--theme-accent, #f59e0b) 45%, transparent);
    border-radius: 999px;
    background: color-mix(
      in srgb,
      var(--theme-accent, #f59e0b) 10%,
      transparent
    );
    color: var(--theme-text, #fff);
    font: inherit;
    font-size: var(--font-size-min, 0.875rem);
    cursor: pointer;
  }

  .matrix-stage {
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    background: var(--theme-panel-bg, #0a0f14);
  }

  .status {
    display: grid;
    place-content: center;
    gap: 0.8rem;
    width: 100%;
    height: 100%;
    padding: 1rem;
    color: var(--theme-text, #fff);
    font-size: var(--font-size-min, 0.875rem);
    text-align: center;
  }

  .status.error {
    color: var(--semantic-error, #fb8a8a);
  }
  .status button {
    padding: 0.4rem 1rem;
  }

  button:focus-visible {
    outline: 2px solid var(--theme-accent, #f59e0b);
    outline-offset: 2px;
  }

  @container shape-matrix-app (max-width: 74.99rem) or (max-height: 41.99rem) {
    .matrix-pane {
      border: 0;
      border-radius: 0;
    }
  }
</style>
