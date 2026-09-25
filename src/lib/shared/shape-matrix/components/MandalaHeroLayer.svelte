<!-- src/lib/shared/shape-matrix/components/MandalaHeroLayer.svelte
  Still mandala floor. Fills its parent (which must be the SAME square
  AnimatorCanvas renders into — that shared frame is the whole alignment
  contract). Inside that square it sizes a tight box, `engineExtentBoxRatio`
  of the square, and renders the shared ShapeMatrixMandalaArt primitive there
  at the matrix tile's extent fit. That box holds exactly the drawing the
  engine paints in the full square, so the floor is pixel-for-pixel the
  guide the live canvas will draw over it, and the box that carries the
  shared-element name is the tile's picture at the hero's size.
  Opacity animates via CSS so the still-mandala → live-guide transition never
  re-rasterizes. During a shared-element handoff the floor is forced fully
  visible with no transition so the transition snapshot has artwork in it. -->
<script lang="ts">
  import type { MandalaPaths } from "$lib/shared/mandala/domain/mandala-types";
  import { getSettings } from "$lib/shared/application/state/app-state.svelte";
  import { motionDuration } from "$lib/shared/transitions/motion";
  import { DURATION } from "$lib/shared/transitions/transitions";
  import {
    pathsArtworkSrc,
    shapeMatrixArtworkPainterForColors,
  } from "../services/shape-matrix-artwork";
  import { engineExtentBoxRatio } from "../services/shape-matrix-render";
  import ShapeMatrixMandalaArt from "./ShapeMatrixMandalaArt.svelte";

  let {
    paths,
    artKey,
    tipDx,
    opacity = 1,
    claim = false,
    handoff = false,
  }: {
    paths: MandalaPaths;
    /** Identity of the pair these paths belong to; a change crossfades. */
    artKey: string;
    /** Tip reach the tiles were painted with; the extent fit depends on it. */
    tipDx: number;
    opacity?: number;
    /** This floor owns the shared tile↔hero transition name right now. */
    claim?: boolean;
    /** A shared-element transition is capturing: show the artwork, instantly. */
    handoff?: boolean;
  } = $props();

  const transitionDuration = motionDuration(DURATION.normal);
  const effectiveOpacity = $derived(handoff ? 1 : opacity);
  // The live guide that replaces this floor strokes in the viewer's saved
  // hand colors, and so do the matrix tiles it morphs from. Painting the
  // floor in the default palette flipped the mandala's color at the handoff.
  const painter = $derived(
    shapeMatrixArtworkPainterForColors(getSettings().primaryPropColors)
  );
  const paint = $derived((sizePx: number) =>
    pathsArtworkSrc(paths, sizePx, tipDx, painter)
  );
  const extentRatio = $derived(engineExtentBoxRatio(paths, tipDx));
</script>

<!-- The square's box comes from container units, not a measurement, so it is
     correct in the same layout pass that sizes the frame. A shared-element
     transition captures the frame the view flips; a JS-measured side would
     still read 0 from the collapsed pane at that moment. -->
<div
  class="mandala-layer"
  class:handoff
  style={`opacity: ${effectiveOpacity}; --mandala-duration: ${transitionDuration}ms`}
  aria-hidden="true"
>
  <div class="mandala-square">
    <div class="mandala-extent" style={`--extent-ratio: ${extentRatio}`}>
      <ShapeMatrixMandalaArt {paint} {artKey} {claim} instant={handoff} />
    </div>
  </div>
</div>

<style>
  .mandala-layer {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    container-type: size;
    pointer-events: none;
    transition: opacity var(--mandala-duration) var(--transition-easing, ease);
  }
  /* The snapshot for a shared-element transition is taken the frame the
     floor is asked to show; a fade-in would capture a half-transparent tile. */
  .mandala-layer.handoff {
    transition: none;
  }
  .mandala-square {
    width: min(100cqw, 100cqh);
    height: min(100cqw, 100cqh);
    display: grid;
    place-items: center;
    overflow: visible;
  }
  /* The tile's picture at the hero's size: the extent-fit box whose drawing
     coincides with the engine's drawing in the full square. */
  .mandala-extent {
    width: calc(100% * var(--extent-ratio));
    height: calc(100% * var(--extent-ratio));
  }
  @media (prefers-reduced-motion: reduce) {
    .mandala-layer {
      transition: none;
    }
  }
</style>
