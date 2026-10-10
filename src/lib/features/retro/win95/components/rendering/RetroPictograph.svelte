<!--
  RetroPictograph - 16-color pixelated pictograph canvas

  Renders a single TKA pictograph beat as chunky pixel art
  using the PixelRenderer service. Internal resolution is 64x64,
  displayed at `size` x `size` with nearest-neighbor upscaling.

  If no data is provided, renders a gray placeholder with "?".

  Domain: Retro SCRIBE App
-->
<script lang="ts">
  import type { RetroPictographData } from "../../../shared/domain/pictograph-types";
  import { PixelRenderer } from "../../services/pixel-renderer";
  import { pictographPreparer } from "#lib/shared/pictograph/shared/services/pictograph-preparer.js";

  let {
    data = null,
    size = 128,
  }: {
    data?: RetroPictographData | null;
    size?: number;
  } = $props();

  const INTERNAL_SIZE = 128;

  let canvasEl: HTMLCanvasElement | undefined = $state();

  const renderer = new PixelRenderer(pictographPreparer);

  $effect(() => {
    if (!canvasEl) return;

    if (data) {
      renderer.render(canvasEl, data, INTERNAL_SIZE);
    } else {
      renderer.renderPlaceholder(canvasEl, INTERNAL_SIZE);
    }
  });
</script>

<!-- svelte-ignore a11y_no_interactive_element_to_noninteractive_role -->
<canvas
  bind:this={canvasEl}
  class="retro-pictograph"
  width={INTERNAL_SIZE}
  height={INTERNAL_SIZE}
  style="width: {size}px; height: {size}px;"
  aria-label={data ? `Pictograph: ${data.letter}` : "Empty pictograph"}
  role="img"
></canvas>

<style>
  .retro-pictograph {
    image-rendering: pixelated;
    image-rendering: crisp-edges;
    display: block;
  }
</style>
