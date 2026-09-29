<script lang="ts">
  import type { EvaluatedFrameLayer } from "$lib/shared/media-composition/services/frame-evaluator";
  import { paintBlurredBackdrop } from "$lib/shared/media-composition/services/post-backdrop-painter";
  import {
    mediaDimensions,
    mediaForClip,
  } from "$lib/shared/media-composition/services/post-studio-frame-compositor";

  /**
   * The blurred background under the preview's items, painted by the export's
   * own painter from the main clip's mounted video. A blur has no detail to
   * lose, so it is drawn small and stretched to the frame.
   */
  let {
    root,
    layer,
    aspect,
  }: {
    /** Where the preview mounts the clips' media. */
    root: HTMLElement | null;
    layer: EvaluatedFrameLayer;
    /** The post's width over its height. */
    aspect: number;
  } = $props();

  const WIDTH = 360;
  let canvas = $state<HTMLCanvasElement | null>(null);

  // Redrawn only when the picture under it changes: a new frame of the video,
  // a seek landing, or the clip's fade, turn or mirror.
  $effect(() => {
    const target = canvas;
    const context = target?.getContext("2d");
    if (!target || !context) return;
    let frame = 0;
    let drawn: string | null = null;
    const draw = () => {
      frame = requestAnimationFrame(draw);
      const media = root ? mediaForClip(root, layer.clipId) : null;
      const height = Math.max(1, Math.round(WIDTH / aspect));
      const { opacity, transform } = layer;
      const state = !media
        ? "none"
        : media instanceof HTMLVideoElement
          ? `${media.currentTime}:${media.seeking}:${media.readyState}`
          : `${media.complete}`;
      const key = [
        layer.clipId,
        media?.currentSrc,
        state,
        opacity,
        transform.rotationDegrees,
        transform.flipHorizontal,
        height,
      ].join("|");
      if (key === drawn) return;
      drawn = key;
      if (target.width !== WIDTH) target.width = WIDTH;
      if (target.height !== height) target.height = height;
      context.clearRect(0, 0, target.width, target.height);
      if (!media) return;
      paintBlurredBackdrop(context, {
        source: media,
        sourceSize: mediaDimensions(media),
        frame: { width: target.width, height: target.height },
        transform,
        opacity,
      });
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  });
</script>

<canvas class="backdrop" bind:this={canvas} aria-hidden="true"></canvas>

<style>
  .backdrop {
    position: absolute;
    inset: 0;
    z-index: 0;
    display: block;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }
</style>
