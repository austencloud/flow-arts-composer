<!--
	SheetMorphOverlay.svelte

	Sprite-crops of the card's own baked thumbnail, mounted only for the frames
	around the play-preview view transition.

	View transitions can only morph named PAINTED elements, and the card's word
	header, grid, and step cells exist only as pixels inside one cached <img>.
	Each overlay div here shows a region of that same image via a
	background-position crop, so the "card side" of the morph is guaranteed to
	look exactly like the card — it IS the card's pixels. The live preview
	carries the matching view-transition-names (see CardHoverPreviewLayer), and
	the browser interpolates between the two.

	Handles the img's object-fit: contain letterboxing: crops are computed
	against the CONTAINED image rect, not the container box.
-->
<script lang="ts">
  import type { SheetRegionMap, SheetRegion } from "#lib/shared/browse/services/sheet-region-map.js";

  const {
    src,
    regions,
    boxWidth,
    boxHeight,
  }: {
    src: string;
    regions: SheetRegionMap;
    /** The thumbnail container's current box (the overlay fills it). */
    boxWidth: number;
    boxHeight: number;
  } = $props();

  /** How many step cells get their own named morph layer. The rest stay part
   * of the grid crop and ride along with it — "most of them slide away". */
  const NAMED_STEPS = 4;

  // object-fit: contain — the image rect inside the box.
  const fitted = $derived.by(() => {
    if (!boxWidth || !boxHeight) return null;
    const boxAspect = boxWidth / boxHeight;
    const imgAspect = regions.canvasAspect;
    let w: number, h: number;
    if (boxAspect > imgAspect) {
      h = boxHeight;
      w = h * imgAspect;
    } else {
      w = boxWidth;
      h = w / imgAspect;
    }
    return { x: (boxWidth - w) / 2, y: (boxHeight - h) / 2, w, h };
  });

  function cropStyle(r: SheetRegion): string {
    const f = fitted;
    if (!f) return "display:none";
    return [
      `left:${f.x + r.x * f.w}px`,
      `top:${f.y + r.y * f.h}px`,
      `width:${r.w * f.w}px`,
      `height:${r.h * f.h}px`,
      `background-image:url("${src}")`,
      `background-size:${f.w}px ${f.h}px`,
      `background-position:${-(r.x * f.w)}px ${-(r.y * f.h)}px`,
    ].join(";");
  }
</script>

<div class="sheet-morph-overlay" aria-hidden="true">
  <!-- The grid crop is the "mandala expands forward" pair: it grows into the
       animator stage. Named cells layer over it and fly to the rail. -->
  <div class="crop grid-crop" style={cropStyle(regions.grid)}></div>
  {#if regions.header}
    <div class="crop header-crop" style={cropStyle(regions.header)}></div>
  {/if}
  {#if regions.start}
    <div class="crop cell-crop-0" style={cropStyle(regions.start)}></div>
  {/if}
  {#each regions.steps.slice(0, NAMED_STEPS) as step, i (i)}
    <div class="crop cell-crop-{i + 1}" style={cropStyle(step)}></div>
  {/each}
</div>

<style>
  .sheet-morph-overlay {
    position: absolute;
    inset: 0;
    /* Above the static img, below the preview layer (z 2) and chips (z 10):
       the overlay exists only in the state where the preview is absent, so it
       never has to win against it. */
    z-index: 1;
    pointer-events: none;
  }

  .crop {
    position: absolute;
    background-repeat: no-repeat;
  }

  /* Only one card mounts this overlay at a time (it exists solely during that
     card's own toggle), and only one preview layer exists app-wide, so static
     names are unique document-wide by construction. */
  .grid-crop {
    view-transition-name: card-morph-stage;
  }
  .header-crop {
    view-transition-name: card-morph-header;
  }
  .cell-crop-0 {
    view-transition-name: card-morph-cell-0;
  }
  .cell-crop-1 {
    view-transition-name: card-morph-cell-1;
  }
  .cell-crop-2 {
    view-transition-name: card-morph-cell-2;
  }
  .cell-crop-3 {
    view-transition-name: card-morph-cell-3;
  }
  .cell-crop-4 {
    view-transition-name: card-morph-cell-4;
  }
</style>
