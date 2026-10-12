<!--
	VideoCanvas.svelte - Video display with bounding box drawing

	Allows user to draw a bounding box on the first frame of a video.
	The box is drawn by clicking and dragging on the canvas.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import type { BoundingBox } from "../domain/models";

  // Props
  let {
    videoUrl,
    onVideoLoaded,
    onBoxDrawn,
    drawnBox = null,
  }: {
    videoUrl: string | null;
    onVideoLoaded: (event: Event) => void;
    onBoxDrawn: (box: BoundingBox) => void;
    drawnBox: BoundingBox | null;
  } = $props();

  // State
  let videoElement = $state<HTMLVideoElement | null>(null);
  let containerElement = $state<HTMLDivElement | null>(null);
  let isDrawing = $state(false);
  let drawStart = $state<{ x: number; y: number } | null>(null);
  let currentBox = $state<BoundingBox | null>(null);

  // Convert page coordinates to normalized video coordinates
  function pageToNormalized(
    pageX: number,
    pageY: number
  ): { x: number; y: number } | null {
    if (!containerElement || !videoElement) return null;

    const rect = containerElement.getBoundingClientRect();
    const videoRect = videoElement.getBoundingClientRect();

    // Calculate the actual video display area (accounting for object-fit: contain)
    const videoAspect = videoElement.videoWidth / videoElement.videoHeight;
    const containerAspect = rect.width / rect.height;

    let displayWidth: number,
      displayHeight: number,
      offsetX: number,
      offsetY: number;

    if (containerAspect > videoAspect) {
      // Container is wider than video
      displayHeight = rect.height;
      displayWidth = displayHeight * videoAspect;
      offsetX = (rect.width - displayWidth) / 2;
      offsetY = 0;
    } else {
      // Container is taller than video
      displayWidth = rect.width;
      displayHeight = displayWidth / videoAspect;
      offsetX = 0;
      offsetY = (rect.height - displayHeight) / 2;
    }

    const x = (pageX - rect.left - offsetX) / displayWidth;
    const y = (pageY - rect.top - offsetY) / displayHeight;

    // Clamp to 0-1
    return {
      x: Math.max(0, Math.min(1, x)),
      y: Math.max(0, Math.min(1, y)),
    };
  }

  function handleMouseDown(event: MouseEvent) {
    const pos = pageToNormalized(event.pageX, event.pageY);
    if (!pos) return;

    isDrawing = true;
    drawStart = pos;
    currentBox = null;
  }

  function handleMouseMove(event: MouseEvent) {
    if (!isDrawing || !drawStart) return;

    const pos = pageToNormalized(event.pageX, event.pageY);
    if (!pos) return;

    // Calculate bounding box from start to current position
    const x = Math.min(drawStart.x, pos.x);
    const y = Math.min(drawStart.y, pos.y);
    const width = Math.abs(pos.x - drawStart.x);
    const height = Math.abs(pos.y - drawStart.y);

    currentBox = { x, y, width, height };
  }

  function handleMouseUp(event: MouseEvent) {
    if (!isDrawing) return;

    isDrawing = false;

    if (currentBox && currentBox.width > 0.01 && currentBox.height > 0.01) {
      onBoxDrawn(currentBox);
    }

    drawStart = null;
  }

  // Touch support
  function handleTouchStart(event: TouchEvent) {
    if (event.touches.length === 1) {
      const touch = event.touches[0];
      if (!touch) return;
      const pos = pageToNormalized(touch.pageX, touch.pageY);
      if (!pos) return;

      isDrawing = true;
      drawStart = pos;
      currentBox = null;
      event.preventDefault();
    }
  }

  function handleTouchMove(event: TouchEvent) {
    if (!isDrawing || !drawStart || event.touches.length !== 1) return;

    const touch = event.touches[0];
    if (!touch) return;
    const pos = pageToNormalized(touch.pageX, touch.pageY);
    if (!pos) return;

    const x = Math.min(drawStart.x, pos.x);
    const y = Math.min(drawStart.y, pos.y);
    const width = Math.abs(pos.x - drawStart.x);
    const height = Math.abs(pos.y - drawStart.y);

    currentBox = { x, y, width, height };
    event.preventDefault();
  }

  function handleTouchEnd(event: TouchEvent) {
    if (!isDrawing) return;

    isDrawing = false;

    if (currentBox && currentBox.width > 0.01 && currentBox.height > 0.01) {
      onBoxDrawn(currentBox);
    }

    drawStart = null;
  }

  let displayBox = $derived(drawnBox ?? currentBox);
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
  class="video-canvas"
  bind:this={containerElement}
  onmousedown={handleMouseDown}
  onmousemove={handleMouseMove}
  onmouseup={handleMouseUp}
  onmouseleave={handleMouseUp}
  ontouchstart={handleTouchStart}
  ontouchmove={handleTouchMove}
  ontouchend={handleTouchEnd}
  role="application"
  aria-label="Video frame with bounding box drawing"
>
  {#if videoUrl}
    <video
      bind:this={videoElement}
      src={videoUrl}
      onloadedmetadata={onVideoLoaded}
      class="video"
      muted
      playsinline
    ></video>

    {#if displayBox}
      <div
        class="bounding-box"
        class:drawing={isDrawing}
        style="
					left: {displayBox.x * 100}%;
					top: {displayBox.y * 100}%;
					width: {displayBox.width * 100}%;
					height: {displayBox.height * 100}%;
				"
      >
        <span class="box-label">Prop</span>
      </div>
    {/if}

    <div class="crosshair-h"></div>
    <div class="crosshair-v"></div>
  {/if}
</div>

<style>
  .video-canvas {
    position: relative;
    flex: 1;
    min-height: 300px;
    background: black;
    border-radius: 12px;
    overflow: hidden;
    cursor: crosshair;
    touch-action: none;
  }

  .video {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: contain;
    pointer-events: none;
  }

  .bounding-box {
    position: absolute;
    border: 2px solid var(--semantic-success);
    background: rgba(16, 185, 129, 0.1);
    transition: border-color var(--duration-normal);
  }

  .bounding-box.drawing {
    border-style: dashed;
  }

  .box-label {
    position: absolute;
    top: -24px;
    left: 0;
    padding: 2px 8px;
    background: var(--semantic-success);
    color: white;
    font-size: var(--font-size-compact);
    font-weight: 600;
    border-radius: 4px 4px 0 0;
  }

  /* Crosshair guides */
  .crosshair-h,
  .crosshair-v {
    position: absolute;
    background: rgba(255, 255, 255, 0.1);
    pointer-events: none;
  }

  .crosshair-h {
    left: 0;
    right: 0;
    top: 50%;
    height: 1px;
  }

  .crosshair-v {
    top: 0;
    bottom: 0;
    left: 50%;
    width: 1px;
  }
</style>
