<script lang="ts">
  import { claimedViewTransitionName } from "#lib/shared/transitions/claimed-view-transition-name.js";
  import { SHAPE_MATRIX_PANE_NAME } from "../../services/shape-matrix-artwork";
  import { s as t } from "../../strings.svelte.js";
  import ShapeMatrixGrid from "../../components/ShapeMatrixGrid.svelte";
  import { MANDALA_STANDARD_TIP_DX } from "#lib/shared/mandala/domain/mandala-constants.js";
  import { theoryFlowerKey, type TheoryFlower } from "@tka/shape-domain";
  import { localizedTheoryFlowerLabel } from "../../services/shape-matrix-display.js";
  import {
    theoryCellArtworkSrc,
    theoryHeaderArtworkSrc,
    theoryTilePaths,
  } from "../../services/theory-matrix-artwork.js";
  import { getShapeMatrixAppContext } from "../context/shape-matrix-app-context";
  import { getShapeMatrixAnimationContext } from "../context/shape-matrix-animation-context";
  import { customizeSection } from "../state/shape-matrix-customize";
  import ShapeMatrixGridCorner from "./ShapeMatrixGridCorner.svelte";
  import ShapeMatrixRecipeStrip from "./ShapeMatrixRecipeStrip.svelte";

  interface Props {
    /** The shell owns navigation, the same way it does for the Matrix. */
    onselect?: (pair: { left: TheoryFlower; right: TheoryFlower }) => void;
    /** A header is one hand's ratio: play it alone, by its own prop. */
    onsolo?: (hand: "left" | "right", flower: TheoryFlower) => void;
    onsurprise?: () => void;
    /** The compact header popover points back at the axis it is changing. */
    emphasizedAxis?: "left" | "right" | "both" | null;
  }
  let { onselect, onsolo, onsurprise, emphasizedAxis = null }: Props = $props();

  const appState = getShapeMatrixAppContext();
  const animationState = getShapeMatrixAnimationContext();

  const surprise = $derived(onsurprise ?? (() => appState.surpriseMe()));
  /* The Level Matrix grid stays mounted behind this one, so the shared names
     (the selected tile, a soloed header, the pane stepping back) belong to
     whichever grid is showing. Two claimants abort the flight; a hidden one
     would be the picture that flies. */
  const gridShowing = $derived(
    appState.compact &&
      appState.surface === "theory" &&
      appState.activeView === "matrix"
  );
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
  //
  // Each hand traces its own reach: with a mixed pair (cat dog with staff and
  // bigstaff, say) the staff hand's tiles must show the staff's shape, not the
  // longer prop's. `scale` stays the pair's larger reach so every tile in the
  // grid keeps one shared extent fit, matching the live stage beside it.
  const reach = $derived({
    left: appState.data?.reach.left ?? MANDALA_STANDARD_TIP_DX,
    right: appState.data?.reach.right ?? MANDALA_STANDARD_TIP_DX,
  });
  const scale = $derived(appState.data?.clubTipDx ?? MANDALA_STANDARD_TIP_DX);

  /* The first fill draws on, as the Matrix grid's does: a pane that opens
     while the app is still loading draws each tile on once the page is
     shown; one that opens later shows the pictures at once. The draw-in
     reveals the same paths the stills are painted from. */
  // svelte-ignore state_referenced_locally
  const coldStart = appState.data === null;
  const drawGeometry = {
    header: (flower: TheoryFlower, hand: "left" | "right") => ({
      paths: theoryTilePaths(flower, hand, reach[hand]),
      tipDx: scale,
    }),
    cell: (left: TheoryFlower, right: TheoryFlower) => ({
      left: theoryTilePaths(left, "left", reach.left),
      right: theoryTilePaths(right, "right", reach.right),
      tipDx: scale,
    }),
  };
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
  class:sideways={appState.sideways}
  use:claimedViewTransitionName={{
    name: SHAPE_MATRIX_PANE_NAME,
    enabled: gridShowing && appState.mandalaHandoff,
  }}
  aria-label={t("shape_engine_theory_matrix_aria")}
>
  <!-- On its side the app's bar column holds the dice and both ratios. -->
  {#if appState.compact && !appState.sideways}
    <ShapeMatrixRecipeStrip surface="theory" onsurprise={surprise} />
  {/if}
  <div class="theory-stage" inert={workspaceOpen} aria-hidden={workspaceOpen}>
    <ShapeMatrixGrid
      rowAxis={appState.theoryRowAxis}
      colAxis={appState.theoryColAxis}
      maxCellPx={320}
      selectedPair={appState.theoryPair}
      claimSelected={gridShowing}
      keyOf={theoryFlowerKey}
      labelOf={localizedTheoryFlowerLabel}
      paintHeader={(flower, hand: "left" | "right", sizePx, painter) =>
        theoryHeaderArtworkSrc(
          flower,
          hand,
          reach[hand],
          scale,
          sizePx,
          painter
        )}
      paintCell={(left, right, sizePx, painter) =>
        theoryCellArtworkSrc(left, right, reach, scale, sizePx, painter)}
      drawIn={coldStart}
      onScreen={appState.surface === "theory"}
      {drawGeometry}
      emphasizedAxis={emphasis}
      corner={cornerGuide}
      revealToken={appState.revealToken}
      onselect={onselect ?? appState.selectTheoryPair}
      onsolo={onsolo ?? appState.selectTheorySolo}
      soloHand={appState.theorySoloHand}
      hint
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

  .theory-pane.compact.sideways {
    grid-template-rows: minmax(0, 1fr);
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
