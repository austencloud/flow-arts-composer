<script lang="ts">
  import { onMount } from "svelte";
  import type { VideoCropData, AspectRatioPreset } from "../types";
  import { ASPECT_RATIO_VALUES } from "../types";
  import ProgressRing from "#lib/shared/components/loading/ProgressRing.svelte";

  interface Props {
    videoUrl: string;
    initialCrop?: VideoCropData;
    onApply: (crop: VideoCropData) => void;
    onCancel: () => void;
  }

  let { videoUrl, initialCrop, onApply, onCancel }: Props = $props();

  // Crop state - initialized from props in $effect to avoid reactivity warnings
  let position = $state<{ x: number; y: number }>({ x: 0, y: 0 });
  let scale = $state<number>(1);
  let aspectLabel = $state<AspectRatioPreset>("original");

  // Initialize from initialCrop once
  let initialized = false;
  $effect(() => {
    if (!initialized && initialCrop) {
      position = { x: initialCrop.position.x, y: initialCrop.position.y };
      scale = initialCrop.scale;
      aspectLabel = initialCrop.aspectLabel;
      initialized = true;
    }
  });

  // Video element and dimensions
  let videoEl = $state<HTMLVideoElement | undefined>();
  let containerEl = $state<HTMLDivElement | undefined>();
  let videoNativeAspect = $state(16 / 9); // Default until video loads
  let videoLoaded = $state(false);
  let isPaused = $state(false);

  // Gesture state (not reactive - only used in event handlers)
  let pointerCache: PointerEvent[] = [];
  let prevPointerDist = -1;
  let prevMidpoint: { x: number; y: number } | null = null;
  let isPanning = $state(false);
  let panStart = { x: 0, y: 0 };
  let positionStart = { x: 0, y: 0 };
  let hasInteracted = $state(false);

  // Computed aspect ratio
  const targetAspect = $derived(
    aspectLabel === "original" ? videoNativeAspect : ASPECT_RATIO_VALUES[aspectLabel]
  );

  // Track video rendered dimensions for proper frame sizing
  let videoRect = $state({ width: 0, height: 0 });

  // Update video dimensions when video loads or container resizes
  function updateVideoRect() {
    if (videoEl && containerEl) {
      const containerRect = containerEl.getBoundingClientRect();
      // Calculate how the video fits within container (object-fit: contain)
      const containerAspect = containerRect.width / containerRect.height;

      let renderedWidth: number;
      let renderedHeight: number;

      if (videoNativeAspect > containerAspect) {
        // Video is wider than container - constrained by width
        renderedWidth = containerRect.width;
        renderedHeight = containerRect.width / videoNativeAspect;
      } else {
        // Video is taller than container - constrained by height
        renderedHeight = containerRect.height;
        renderedWidth = containerRect.height * videoNativeAspect;
      }

      videoRect = { width: renderedWidth, height: renderedHeight };
    }
  }

  // Calculate the crop frame dimensions relative to video bounds
  const cropFrameStyle = $derived.by(() => {
    if (videoRect.width === 0 || videoRect.height === 0) return "";

    const videoAspect = videoRect.width / videoRect.height;

    let frameWidth: number;
    let frameHeight: number;

    if (targetAspect > videoAspect) {
      // Target is wider than video - constrain by video width
      frameWidth = videoRect.width;
      frameHeight = frameWidth / targetAspect;
    } else {
      // Target is taller than video - constrain by video height
      frameHeight = videoRect.height;
      frameWidth = frameHeight * targetAspect;
    }

    return `width: ${frameWidth}px; height: ${frameHeight}px;`;
  });

  // Video transform style
  const videoTransform = $derived(
    `transform: translate(${position.x * 100}%, ${position.y * 100}%) scale(${scale});`
  );

  function handleVideoLoaded() {
    if (videoEl) {
      videoNativeAspect = videoEl.videoWidth / videoEl.videoHeight;
      videoLoaded = true;
      updateVideoRect();
    }
  }

  function togglePlayPause() {
    if (videoEl) {
      if (isPaused) {
        videoEl.play();
      } else {
        videoEl.pause();
      }
      isPaused = !isPaused;
    }
  }

  function handleKeydown(ev: KeyboardEvent) {
    if (ev.key === "Escape") {
      ev.preventDefault();
      onCancel();
    } else if (ev.key === " ") {
      ev.preventDefault();
      togglePlayPause();
    }
  }

  // Handle resize to update video dimensions
  onMount(() => {
    const resizeObserver = new ResizeObserver(() => {
      updateVideoRect();
    });

    if (containerEl) {
      resizeObserver.observe(containerEl);
    }

    // Add keyboard listener
    window.addEventListener("keydown", handleKeydown);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("keydown", handleKeydown);
    };
  });

  function handlePointerDown(ev: PointerEvent) {
    hasInteracted = true;
    pointerCache.push(ev);
    (ev.target as HTMLElement).setPointerCapture(ev.pointerId);

    if (pointerCache.length === 1) {
      // Single pointer - start panning
      isPanning = true;
      panStart = { x: ev.clientX, y: ev.clientY };
      positionStart = { x: position.x, y: position.y };
    }
  }

  function handlePointerMove(ev: PointerEvent) {
    // Update cached pointer
    const idx = pointerCache.findIndex((p) => p.pointerId === ev.pointerId);
    if (idx >= 0) {
      pointerCache[idx] = ev;
    }

    if (pointerCache.length === 2) {
      // Two-finger gesture: pinch zoom + pan
      handlePinchZoom();
    } else if (pointerCache.length === 1 && isPanning) {
      // Single finger: pan only
      handlePan(ev);
    }
  }

  function handlePinchZoom() {
    const p1 = pointerCache[0];
    const p2 = pointerCache[1];
    if (!p1 || !p2) return;

    // Calculate distance between pointers
    const curDist = Math.hypot(p1.clientX - p2.clientX, p1.clientY - p2.clientY);

    // Calculate midpoint
    const curMidpoint = {
      x: (p1.clientX + p2.clientX) / 2,
      y: (p1.clientY + p2.clientY) / 2,
    };

    if (prevPointerDist > 0 && prevMidpoint) {
      // Calculate scale change
      const scaleChange = curDist / prevPointerDist;
      const newScale = Math.max(1, Math.min(5, scale * scaleChange));

      // Calculate pan from midpoint movement (normalized to container)
      if (containerEl) {
        const rect = containerEl.getBoundingClientRect();
        const dx = (curMidpoint.x - prevMidpoint.x) / rect.width;
        const dy = (curMidpoint.y - prevMidpoint.y) / rect.height;

        // Apply pan with bounds checking
        position = {
          x: clampPosition(position.x + dx, newScale),
          y: clampPosition(position.y + dy, newScale)
        };
      }

      scale = newScale;
    }

    prevPointerDist = curDist;
    prevMidpoint = curMidpoint;
  }

  function handlePan(ev: PointerEvent) {
    if (!containerEl) return;

    const rect = containerEl.getBoundingClientRect();
    const dx = (ev.clientX - panStart.x) / rect.width;
    const dy = (ev.clientY - panStart.y) / rect.height;

    position = {
      x: clampPosition(positionStart.x + dx, scale),
      y: clampPosition(positionStart.y + dy, scale)
    };
  }

  function clampPosition(value: number, currentScale: number): number {
    // Limit pan so video edges don't show in crop frame
    const maxPan = (currentScale - 1) / (2 * currentScale);
    return Math.max(-maxPan, Math.min(maxPan, value));
  }

  function handlePointerUp(ev: PointerEvent) {
    const idx = pointerCache.findIndex((p) => p.pointerId === ev.pointerId);
    if (idx >= 0) {
      pointerCache.splice(idx, 1);
    }

    if (pointerCache.length < 2) {
      prevPointerDist = -1;
      prevMidpoint = null;
    }

    if (pointerCache.length === 0) {
      isPanning = false;
    }
  }

  function handleWheel(ev: WheelEvent) {
    ev.preventDefault();

    // Trackpad pinch zoom (Ctrl+wheel in Chrome/Firefox)
    if (ev.ctrlKey) {
      const zoomFactor = 1 - ev.deltaY * 0.01;
      scale = Math.max(1, Math.min(5, scale * zoomFactor));
    } else {
      // Regular scroll = pan
      if (containerEl) {
        const rect = containerEl.getBoundingClientRect();
        const dx = -ev.deltaX / rect.width;
        const dy = -ev.deltaY / rect.height;
        position = {
          x: clampPosition(position.x + dx * 0.5, scale),
          y: clampPosition(position.y + dy * 0.5, scale)
        };
      }
    }
  }

  function selectAspect(preset: AspectRatioPreset) {
    aspectLabel = preset;
    // Reset position when changing aspect to avoid weird crops
    position = { x: 0, y: 0 };
  }

  function resetCrop() {
    position = { x: 0, y: 0 };
    scale = 1;
    aspectLabel = "original";
  }

  function applyCrop() {
    const cropData: VideoCropData = {
      position: { x: position.x, y: position.y },
      scale,
      aspect: targetAspect,
      aspectLabel,
    };
    onApply(cropData);
  }

  const aspectPresets: { label: AspectRatioPreset; display: string; icon: string }[] = [
    { label: "original", display: "Original", icon: "fa-expand" },
    { label: "16:9", display: "16:9", icon: "fa-rectangle-wide" },
    { label: "1:1", display: "1:1", icon: "fa-square" },
    { label: "9:16", display: "9:16", icon: "fa-mobile-alt" },
    { label: "4:5", display: "4:5", icon: "fa-portrait" },
  ];
</script>

<div class="crop-editor">
  <header class="crop-header">
    <button class="header-btn" onclick={onCancel} aria-label="Cancel crop">
      <i class="fas fa-times" aria-hidden="true"></i>
    </button>
    <span class="header-title">Crop Video</span>
    <button class="header-btn apply" onclick={applyCrop} aria-label="Apply crop">
      <i class="fas fa-check" aria-hidden="true"></i>
    </button>
  </header>

  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="crop-stage"
    bind:this={containerEl}
    onpointerdown={handlePointerDown}
    onpointermove={handlePointerMove}
    onpointerup={handlePointerUp}
    onpointercancel={handlePointerUp}
    onpointerleave={handlePointerUp}
    onwheel={handleWheel}
  >
    <!-- Loading state -->
    {#if !videoLoaded}
      <div class="loading-overlay">
        <ProgressRing percent={-1} size={32} strokeWidth={3} />
        <span>Loading video...</span>
      </div>
    {/if}

    <!-- Darkened background showing full video -->
    <div class="video-backdrop">
      <!-- svelte-ignore a11y_media_has_caption -->
      <video
        bind:this={videoEl}
        src={videoUrl}
        autoplay
        loop
        muted
        playsinline
        onloadedmetadata={handleVideoLoaded}
        style={videoTransform}
      ></video>
    </div>

    <!-- Crop frame overlay -->
    {#if videoLoaded}
      <div class="crop-frame" style={cropFrameStyle}>
        <!-- Corner handles for visual feedback -->
        <div class="handle tl"></div>
        <div class="handle tr"></div>
        <div class="handle bl"></div>
        <div class="handle br"></div>
      </div>
    {/if}

    <!-- Play/Pause button -->
    <button
      class="play-pause-btn"
      onclick={togglePlayPause}
      aria-label={isPaused ? "Play video" : "Pause video"}
    >
      <i class="fas {isPaused ? 'fa-play' : 'fa-pause'}" aria-hidden="true"></i>
    </button>

    <!-- Instructions - fade out after interaction -->
    {#if !hasInteracted}
      <div class="instructions">
        <span>Drag to pan, pinch to zoom. Space to pause.</span>
      </div>
    {/if}
  </div>

  <!-- Aspect ratio presets -->
  <div class="aspect-bar">
    {#each aspectPresets as preset}
      <button
        class="aspect-btn"
        class:selected={aspectLabel === preset.label}
        onclick={() => selectAspect(preset.label)}
      >
        <i class="fas {preset.icon}" aria-hidden="true"></i>
        <span>{preset.display}</span>
      </button>
    {/each}
  </div>

  <!-- Zoom slider -->
  <div class="zoom-bar">
    <button
      class="zoom-btn"
      onclick={() => (scale = Math.max(1, scale - 0.25))}
      disabled={scale <= 1}
      aria-label="Zoom out"
    >
      <i class="fas fa-minus" aria-hidden="true"></i>
    </button>
    <input
      type="range"
      min="1"
      max="5"
      step="0.1"
      bind:value={scale}
      class="zoom-slider"
      aria-label="Zoom level"
    />
    <button
      class="zoom-btn"
      onclick={() => (scale = Math.min(5, scale + 0.25))}
      disabled={scale >= 5}
      aria-label="Zoom in"
    >
      <i class="fas fa-plus" aria-hidden="true"></i>
    </button>
    <span class="zoom-value">{Math.round(scale * 100)}%</span>
  </div>

  <!-- Action buttons -->
  <div class="action-bar">
    <button class="action-btn secondary" onclick={resetCrop}>
      <i class="fas fa-undo" aria-hidden="true"></i>
      Reset
    </button>
    <button class="action-btn secondary" onclick={onCancel}>
      Cancel
    </button>
    <button class="action-btn primary" onclick={applyCrop}>
      Apply Crop
    </button>
  </div>
</div>

<style>
  .crop-editor {
    position: fixed;
    inset: 0;
    z-index: var(--z-toast);
    background: var(--theme-panel-bg, #0d0d14);
    display: flex;
    flex-direction: column;
  }

  /* Header */
  .crop-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.06));
  }

  .header-btn {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    border: none;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.08));
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    transition: all 0.2s;
  }

  .header-btn:hover {
    background: var(--theme-card-bg-hover, rgba(255, 255, 255, 0.12));
    color: var(--theme-text, white);
  }

  .header-btn.apply {
    background: var(--semantic-success, #10b981);
    color: white;
  }

  .header-btn.apply:hover {
    background: #059669;
  }

  .header-title {
    font-size: 16px;
    font-weight: 600;
    color: var(--theme-text, white);
  }

  /* Crop stage */
  .crop-stage {
    flex: 1;
    position: relative;
    overflow: hidden;
    touch-action: none;
    cursor: grab;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .crop-stage:active {
    cursor: grabbing;
  }

  .video-backdrop {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #000;
  }

  .video-backdrop video {
    width: 100%;
    height: 100%;
    object-fit: contain;
    transform-origin: center center;
  }

  /* Crop frame */
  .crop-frame {
    position: relative;
    border: 2px solid white;
    box-shadow:
      0 0 0 9999px rgba(0, 0, 0, 0.6),
      0 0 20px rgba(0, 0, 0, 0.5);
    pointer-events: none;
  }

  .handle {
    position: absolute;
    width: 20px;
    height: 20px;
    border: 3px solid white;
  }

  .handle.tl {
    top: -3px;
    left: -3px;
    border-right: none;
    border-bottom: none;
  }

  .handle.tr {
    top: -3px;
    right: -3px;
    border-left: none;
    border-bottom: none;
  }

  .handle.bl {
    bottom: -3px;
    left: -3px;
    border-right: none;
    border-top: none;
  }

  .handle.br {
    bottom: -3px;
    right: -3px;
    border-left: none;
    border-top: none;
  }

  .instructions {
    position: absolute;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    padding: 8px 16px;
    background: rgba(0, 0, 0, 0.7);
    border-radius: 20px;
    font-size: 13px;
    color: rgba(255, 255, 255, 0.7);
    pointer-events: none;
    animation: fadeIn 0.3s ease-out;
  }

  /* Loading state */
  .loading-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    background: rgba(0, 0, 0, 0.8);
    z-index: 10;
    color: rgba(255, 255, 255, 0.7);
    font-size: 14px;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateX(-50%) translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
  }

  /* Play/Pause button */
  .play-pause-btn {
    position: absolute;
    bottom: 70px;
    left: 50%;
    transform: translateX(-50%);
    width: var(--min-touch-target);
    height: var(--min-touch-target);
    border-radius: 50%;
    border: none;
    background: rgba(0, 0, 0, 0.6);
    color: white;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;
    transition: all 0.2s;
    z-index: 5;
  }

  .play-pause-btn:hover {
    background: rgba(0, 0, 0, 0.8);
    transform: translateX(-50%) scale(1.05);
  }

  /* Aspect bar */
  .aspect-bar {
    display: flex;
    justify-content: center;
    gap: 8px;
    padding: 16px;
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.06));
  }

  .aspect-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 10px 16px;
    border-radius: 10px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    cursor: pointer;
    font-size: 12px;
    transition: all 0.15s;
  }

  .aspect-btn i {
    font-size: 16px;
  }

  .aspect-btn:hover {
    background: var(--theme-card-bg-hover, rgba(255, 255, 255, 0.08));
    color: var(--theme-text, white);
  }

  .aspect-btn.selected {
    background: color-mix(in srgb, var(--theme-accent, #6366f1) 20%, transparent);
    border-color: var(--theme-accent, #6366f1);
    color: var(--theme-accent-light, #a5b4fc);
  }

  /* Zoom bar */
  .zoom-bar {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 12px 20px;
  }

  .zoom-btn {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    transition: all 0.15s;
  }

  .zoom-btn:hover:not(:disabled) {
    background: var(--theme-card-bg-hover, rgba(255, 255, 255, 0.08));
    color: var(--theme-text, white);
  }

  .zoom-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .zoom-slider {
    width: 150px;
    height: 4px;
    border-radius: 2px;
    background: var(--theme-stroke, rgba(255, 255, 255, 0.1));
    appearance: none;
    cursor: pointer;
  }

  .zoom-slider::-webkit-slider-thumb {
    appearance: none;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: white;
    cursor: pointer;
  }

  .zoom-slider::-moz-range-thumb {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: white;
    border: none;
    cursor: pointer;
  }

  .zoom-value {
    width: 50px;
    font-size: 13px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    text-align: right;
  }

  /* Action bar */
  .action-bar {
    display: flex;
    gap: 10px;
    padding: 16px 20px;
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.06));
  }

  .action-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 14px 20px;
    border-radius: 10px;
    border: none;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
  }

  .action-btn.secondary {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.05));
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
  }

  .action-btn.secondary:hover {
    background: var(--theme-card-bg-hover, rgba(255, 255, 255, 0.08));
    color: var(--theme-text, white);
  }

  .action-btn.primary {
    flex: 1;
    background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
    color: white;
  }

  .action-btn.primary:hover {
    opacity: 0.9;
  }

  /* Mobile adjustments */
  @media (max-width: 600px) {
    .aspect-bar {
      gap: 4px;
      padding: 12px 8px;
    }

    .aspect-btn {
      padding: 8px 10px;
      font-size: 11px;
    }

    .aspect-btn i {
      font-size: 14px;
    }

    .zoom-slider {
      width: 100px;
    }

    .action-bar {
      flex-wrap: wrap;
    }

    .action-btn.primary {
      flex: 1 0 100%;
      order: -1;
    }

    /* Mobile: ensure touch targets */
    .zoom-btn {
      width: var(--min-touch-target);
      height: var(--min-touch-target);
    }
  }

  /* Focus indicators for accessibility */
  .header-btn:focus-visible,
  .aspect-btn:focus-visible,
  .zoom-btn:focus-visible,
  .action-btn:focus-visible,
  .play-pause-btn:focus-visible {
    outline: 2px solid var(--theme-accent, #6366f1);
    outline-offset: 2px;
  }

  .zoom-slider:focus-visible {
    outline: 2px solid var(--theme-accent, #6366f1);
    outline-offset: 4px;
  }

  /* Reduced motion support */
  @media (prefers-reduced-motion: reduce) {
    .instructions {
      animation: none;
    }

    .header-btn,
    .aspect-btn,
    .zoom-btn,
    .action-btn,
    .play-pause-btn {
      transition: none;
    }
  }
</style>
