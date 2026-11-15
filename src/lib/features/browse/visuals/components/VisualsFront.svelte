<!--
  VisualsFront.svelte — the Visuals front page, when no type is named: a
  piece already playing (the stage) and two doors to everything (one per type
  that has work).

  Shape follows the box it is given (container queries, not the viewport). In
  a tall box the stage is the top half and the doors fill the rest side by
  side. In a wide, short box the stage stands at the left, filling the height,
  and the doors stack in a column at its right; the stage takes whatever width
  the doors leave, so no band of page is left empty at any size. Nothing here
  scrolls.
-->
<script lang="ts">
  import type { PublicArtifactEnvelope } from "#lib/shared/artifact-revisions/domain/public-artifact.js";
  import type {
    PublishedVisualType,
    VisualTypeMeta,
  } from "../domain/visuals-types.js";
  import type { VisualPieceLoader } from "../services/visual-piece-loader.js";
  import VisualsDoors from "./VisualsDoors.svelte";
  import VisualsStage from "./VisualsStage.svelte";

  interface FrontGroup {
    readonly meta: VisualTypeMeta;
    readonly items: readonly PublicArtifactEnvelope[];
  }

  let {
    groups,
    playlist,
    loader,
    active,
    onOpenPiece,
    onOpenType,
  }: {
    /** The types that have work, in display order. */
    groups: readonly FrontGroup[];
    playlist: readonly PublicArtifactEnvelope[];
    loader: VisualPieceLoader;
    active: boolean;
    onOpenPiece: (envelope: PublicArtifactEnvelope) => void;
    onOpenType: (route: PublishedVisualType) => void;
  } = $props();
</script>

<!-- A container's own rules cannot answer its own query, so the sized box and
     the grid inside it are two elements. -->
<div class="front-box">
  <div class="front">
    <div class="stage-slot">
      <VisualsStage {playlist} {loader} {active} onOpen={onOpenPiece} />
    </div>
    <div class="doors-slot">
      <VisualsDoors {groups} onOpen={onOpenType} />
    </div>
  </div>
</div>

<style>
  .front-box {
    container-type: size;
    container-name: front;
    flex: 1;
    min-height: 0;
    min-width: 0;
  }

  .front {
    display: grid;
    width: 100%;
    height: 100%;
    grid-template-rows: minmax(0, 11fr) minmax(0, 10fr);
    gap: 12px;
  }

  .stage-slot,
  .doors-slot {
    min-width: 0;
    min-height: 0;
  }

  .doors-slot {
    padding: 0 12px 12px;
  }

  /* Tablet landscape and wider: the stage at the left filling the height, the
     doors stacked in a column at its right. */
  @container front (min-aspect-ratio: 5 / 4) {
    .front {
      grid-template-rows: minmax(0, 1fr);
      grid-template-columns: minmax(0, 1fr) clamp(16rem, 30cqw, 30rem);
    }

    .doors-slot {
      padding: 12px 12px 12px 0;
    }

    .doors-slot :global(.doors) {
      flex-direction: column;
    }
  }
</style>
