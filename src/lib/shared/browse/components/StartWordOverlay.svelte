<!--
  StartWordOverlay - the Start word on a shared gallery picture.

  Shared pictures are drawn once for every visitor, so their Start corner is
  left blank (THUMBNAIL_RENDERER_VERSION 8). This lays the visitor's word on
  top with the same drawer the picture uses (renderStepNumber), at the
  picture's own resolution, so English looks as it did when the word was
  baked in and every other language gets its own word.

  The picture is `object-fit: contain` in its box, so the layer recreates the
  picture's frame from its natural size and places the word inside it.
-->
<script lang="ts">
  import {
    calculateHeaderHeight,
    renderStepNumber,
    STEP_LABEL_FONT_RATIO,
    STEP_NUMBER_OFFSET_RATIO,
  } from "@tka/render-composition";
  import { calculateLayout } from "#lib/shared/render/services/layout-calculator.js";
  import { ensureCardFonts } from "#lib/shared/render/services/gelasio-fonts.js";
  import { localStepLabels } from "#lib/shared/render/services/local-step-labels.js";
  import { DEFAULT_BEAT_SIZE } from "#lib/shared/browse/services/thumbnail-renderer.js";

  interface Props {
    /** The shown picture's pixel size. */
    naturalWidth: number;
    naturalHeight: number;
    /** Used only when the picture was stored at another scale. */
    stepCount: number;
    startPlacementLayout: "row" | "column";
    darkMode: boolean;
  }

  const {
    naturalWidth,
    naturalHeight,
    stepCount,
    startPlacementLayout,
    darkMode,
  }: Props = $props();

  // Room under the word for descenders and tall scripts.
  const BAND_RATIO = STEP_NUMBER_OFFSET_RATIO + STEP_LABEL_FONT_RATIO * 1.6;

  // The start cell is the grid's top-left cell, directly under the header.
  // Shared pictures always carry the header (the level badge is on by default)
  // and are drawn at DEFAULT_BEAT_SIZE per cell, so the width names the
  // column count; a picture stored at another scale falls back to the layout
  // table the card's own aspect ratio uses.
  const box = $derived.by(() => {
    if (naturalWidth <= 0 || naturalHeight <= 0) return null;
    const exact = naturalWidth % DEFAULT_BEAT_SIZE === 0;
    const columns = exact
      ? naturalWidth / DEFAULT_BEAT_SIZE
      : calculateLayout(stepCount, true, startPlacementLayout)[0];
    if (columns < 1) return null;
    const scale = naturalWidth / (columns * DEFAULT_BEAT_SIZE);
    const cell = DEFAULT_BEAT_SIZE * scale;
    const top = calculateHeaderHeight(DEFAULT_BEAT_SIZE, columns) * scale;
    return {
      cell,
      width: Math.round(cell),
      height: Math.ceil(cell * BAND_RATIO),
      leftPct: 0,
      topPct: (top / naturalHeight) * 100,
      widthPct: (cell / naturalWidth) * 100,
      heightPct: ((cell * BAND_RATIO) / naturalHeight) * 100,
    };
  });

  let canvas = $state<HTMLCanvasElement | null>(null);
  let fontsReady = $state(false);
  void ensureCardFonts().then(() => (fontsReady = true));

  $effect(() => {
    const word = localStepLabels().start;
    if (!canvas || !box || !fontsReady) return;
    canvas.width = box.width;
    canvas.height = box.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, box.width, box.height);
    renderStepNumber(ctx, 0, 0, 0, box.cell, darkMode, word);
  });
</script>

{#if box}
  <div
    class="start-word-layer"
    style:--picture-ratio={naturalWidth / naturalHeight}
    aria-hidden="true"
  >
    <div class="picture-frame">
      <!-- Left to right in every language: the word sits in the cell's
           top-left corner, as on the drawn card. -->
      <canvas
        bind:this={canvas}
        dir="ltr"
        style:left="{box.leftPct}%"
        style:top="{box.topPct}%"
        style:width="{box.widthPct}%"
        style:height="{box.heightPct}%"
      ></canvas>
    </div>
  </div>
{/if}

<style>
  .start-word-layer {
    position: absolute;
    inset: 0;
    container-type: size;
    display: grid;
    place-items: center;
    pointer-events: none;
  }

  .picture-frame {
    position: relative;
    width: min(100cqw, 100cqh * var(--picture-ratio));
    aspect-ratio: var(--picture-ratio);
  }

  canvas {
    position: absolute;
    display: block;
  }
</style>
