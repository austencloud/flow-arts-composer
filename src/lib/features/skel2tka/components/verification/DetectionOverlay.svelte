<!--
  DetectionOverlay - Canvas overlay positioned over a video element

  Accepts a phase-specific renderer and detection data.
  Redraws whenever the current frame changes.
  Positioned identically to the video so markers line up with the footage.
-->
<script lang="ts">
  import type { Phase1OverlayRenderer } from "../../services/phase1-overlay-renderer";
import type { OverlayRenderContext } from "../../services/types";
  import type { DetectionFrame } from "#lib/shared/train/domain/detection-frame.js";
  import type { DetectedBeat } from "../../domain/models";

  let {
    renderer,
    frame,
    frameIndex,
    beats,
    timestamp,
    width,
    height,
  }: {
    renderer: Phase1OverlayRenderer;
    frame: DetectionFrame | null;
    frameIndex: number;
    beats: DetectedBeat[];
    timestamp: number;
    width: number;
    height: number;
  } = $props();

  let canvasEl: HTMLCanvasElement | undefined = $state();

  $effect(() => {
    if (!canvasEl || width <= 0 || height <= 0) return;

    const ctx = canvasEl.getContext("2d");
    if (!ctx) return;

    // Ensure canvas resolution matches display size
    if (canvasEl.width !== width || canvasEl.height !== height) {
      canvasEl.width = width;
      canvasEl.height = height;
    }

    const context: OverlayRenderContext = {
      ctx,
      width,
      height,
      frame,
      frameIndex,
      beats,
      timestamp,
    };

    renderer.render(context);
  });
</script>

<canvas
  bind:this={canvasEl}
  class="detection-overlay"
  style="width: {width}px; height: {height}px;"
  aria-hidden="true"
></canvas>

<style>
  .detection-overlay {
    position: absolute;
    top: 0;
    left: 0;
    pointer-events: none;
  }
</style>
