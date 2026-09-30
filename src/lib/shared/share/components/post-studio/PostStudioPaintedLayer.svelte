<script lang="ts">
  import type {
    PaintFrame,
    PostStudioLayerPainter,
  } from "$lib/shared/media-composition/services/post-studio-layer-painter";
  import { paintSurfaceGeometry } from "$lib/shared/media-composition/services/post-studio-layer-painter";

  let {
    painter,
    frame,
    opacity = 1,
  }: {
    painter: PostStudioLayerPainter;
    frame: PaintFrame;
    opacity?: number;
  } = $props();
  let canvas = $state<HTMLCanvasElement | null>(null);
  let width = $state(0);
  let height = $state(0);
  let preparedVersion = $state(0);
  let pixelScale = $state(1);
  const target = $derived({
    width: Math.max(1, Math.round(width * pixelScale)),
    height: Math.max(1, Math.round(height * pixelScale)),
  });
  const surface = $derived(paintSurfaceGeometry(painter, target));

  $effect(() => {
    if (!canvas || width <= 0 || height <= 0) return;
    const targetCanvas = canvas;
    pixelScale = window.devicePixelRatio || 1;
    if (targetCanvas.width !== surface.width)
      targetCanvas.width = surface.width;
    if (targetCanvas.height !== surface.height)
      targetCanvas.height = surface.height;
    let active = true;
    void painter
      .prepare(surface.rect)
      .then(() => {
        if (active) preparedVersion += 1;
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  });

  $effect(() => {
    preparedVersion;
    if (!canvas || canvas.width <= 0 || canvas.height <= 0) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    painter.paint(context, surface.rect, frame);
  });
</script>

<div
  class="painted-layer"
  style:opacity
  bind:clientWidth={width}
  bind:clientHeight={height}
>
  <canvas
    bind:this={canvas}
    aria-hidden="true"
    style:left={`${-surface.rect.x / pixelScale}px`}
    style:top={`${-surface.rect.y / pixelScale}px`}
    style:width={surface.width === target.width
      ? "100%"
      : `${surface.width / pixelScale}px`}
    style:height={surface.height === target.height
      ? "100%"
      : `${surface.height / pixelScale}px`}
  ></canvas>
</div>

<style>
  .painted-layer,
  canvas {
    display: block;
    width: 100%;
    height: 100%;
  }
  .painted-layer {
    position: relative;
    min-width: 0;
    min-height: 0;
  }
  canvas {
    position: absolute;
    pointer-events: none;
  }
</style>
