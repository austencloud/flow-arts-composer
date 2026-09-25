<script lang="ts">
  import type {
    PaintFrame,
    PostStudioLayerPainter,
  } from "$lib/shared/media-composition/services/post-studio-layer-painter";

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

  $effect(() => {
    if (!canvas || width <= 0 || height <= 0) return;
    const target = canvas;
    const scale = window.devicePixelRatio || 1;
    const pixelWidth = Math.max(1, Math.round(width * scale));
    const pixelHeight = Math.max(1, Math.round(height * scale));
    if (target.width !== pixelWidth) target.width = pixelWidth;
    if (target.height !== pixelHeight) target.height = pixelHeight;
    let active = true;
    void painter
      .prepare({ width: pixelWidth, height: pixelHeight })
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
    painter.paint(
      context,
      { x: 0, y: 0, width: canvas.width, height: canvas.height },
      frame
    );
  });
</script>

<div
  class="painted-layer"
  style:opacity
  bind:clientWidth={width}
  bind:clientHeight={height}
>
  <canvas bind:this={canvas} aria-hidden="true"></canvas>
</div>

<style>
  .painted-layer,
  canvas {
    display: block;
    width: 100%;
    height: 100%;
  }
  .painted-layer {
    min-width: 0;
    min-height: 0;
  }
</style>
