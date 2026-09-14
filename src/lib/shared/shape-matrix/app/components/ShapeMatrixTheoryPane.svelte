<script lang="ts">
  import ShapeMatrixGrid from "$lib/shared/shape-matrix/components/ShapeMatrixGrid.svelte";
  import { MANDALA_STANDARD_TIP_DX } from "$lib/shared/mandala/domain/mandala-constants";
  import {
    theoryFlowerKey,
    theoryFlowerLabel,
    type TheoryFlower,
  } from "$lib/shared/shape-matrix/domain/theory-flower";
  import {
    theoryCellArtworkSrc,
    theoryHeaderArtworkSrc,
  } from "$lib/shared/shape-matrix/services/theory-matrix-artwork";
  import { getShapeMatrixAppContext } from "../context/shape-matrix-app-context";
  import { getShapeMatrixAnimationContext } from "../context/shape-matrix-animation-context";
  import { customizeSection } from "../state/shape-matrix-customize";
  import ShapeMatrixGridCorner from "./ShapeMatrixGridCorner.svelte";
  import ShapeMatrixRecipeStrip from "./ShapeMatrixRecipeStrip.svelte";

  interface Props {
    /** The shell owns navigation, the same way it does for the Matrix. */
    onselect?: (pair: { left: TheoryFlower; right: TheoryFlower }) => void;
    onsurprise?: () => void;
    /** The compact header popover points back at the axis it is changing. */
    emphasizedAxis?: "left" | "right" | "both" | null;
  }
  let { onselect, onsurprise, emphasizedAxis = null }: Props = $props();

  const appState = getShapeMatrixAppContext();
  const animationState = getShapeMatrixAnimationContext();

  const surprise = $derived(onsurprise ?? (() => appState.surpriseMe()));
  /* The customize workspace covers this pane on wide hosts, as on the
     Matrix: the shell mounts it over the pane, once for both surfaces. */
  const workspaceOpen = $derived(
    customizeSection(appState, animationState) !== null
  );

  /* The corner's ratio editors point back at the grid axis they change.
     Both live in this pane, so the pane owns that pointer. */
  let editingAxis = $state<"left" | "right" | "both" | null>(null);
  const emphasis = $derived(editingAxis ?? emphasizedAxis);

  // Theory geometry comes from the QfT model, not from a realized sequence, so
  // the grid renders before the pictograph data finishes loading. Prop reach is
  // the one thing it borrows, and the standard staff covers the wait.
  const tipDx = $derived(appState.data?.clubTipDx ?? MANDALA_STANDARD_TIP_DX);
</script>

{#snippet cornerGuide()}
  <ShapeMatrixGridCorner
    surface="theory"
    onsurprise={surprise}
    onratiofocuschange={(hand) => (editingAxis = hand)}
  />
{/snippet}

<section
  class="theory-pane"
  class:compact={appState.compact}
  aria-label="Theory matrix"
>
  {#if appState.compact}
    <ShapeMatrixRecipeStrip surface="theory" onsurprise={surprise} />
  {/if}
  <div class="theory-stage" inert={workspaceOpen} aria-hidden={workspaceOpen}>
    <ShapeMatrixGrid
      rowAxis={appState.theoryRowAxis}
      colAxis={appState.theoryColAxis}
      maxCellPx={320}
      selectedPair={appState.theoryPair}
      claimSelected={appState.compact && appState.activeView === "matrix"}
      keyOf={theoryFlowerKey}
      labelOf={theoryFlowerLabel}
      paintHeader={(flower, hand, sizePx) =>
        theoryHeaderArtworkSrc(flower, hand, tipDx, sizePx)}
      paintCell={(left, right, sizePx) =>
        theoryCellArtworkSrc(left, right, tipDx, sizePx)}
      emphasizedAxis={emphasis}
      corner={cornerGuide}
      revealToken={appState.revealToken}
      onselect={onselect ?? appState.selectTheoryPair}
    />
  </div>
</section>

<style>
  .theory-pane {
    position: relative;
    height: 100%;
    min-height: 0;
    display: grid;
    grid-template-rows: minmax(0, 1fr);
    overflow: hidden;
    border: 1px solid var(--theme-stroke, rgb(255 255 255 / 0.1));
    border-radius: 16px;
    background: var(--theme-panel-bg, rgb(16 23 33 / 0.82));
  }

  /* Compact hosts add the recipe strip above the grid. */
  .theory-pane.compact {
    grid-template-rows: auto minmax(0, 1fr);
  }

  .theory-stage {
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    background: var(--theme-panel-bg, #0a0f14);
  }

  @container shape-matrix-app (max-width: 74.99rem) or (max-height: 41.99rem) {
    .theory-pane {
      border: 0;
      border-radius: 0;
    }
  }
</style>
