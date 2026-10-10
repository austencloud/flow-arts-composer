<!--
  FrameInspector - Video + overlay + scrubber + data panel

  The primary verification interface. Shows the source video with
  detection overlay, frame-by-frame scrubber, and structured data.

  Keyboard shortcuts:
  - Arrow Left/Right: prev/next frame
  - Shift + Arrow Left/Right: prev/next beat boundary
  - Space: play/pause
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import type { Phase1OverlayRenderer } from "../../services/phase1-overlay-renderer";
  import type { Phase1Result } from "../../domain/models";
  import type { DetectionFrame } from "#lib/shared/train/domain/detection-frame.js";
  import DetectionOverlay from "./DetectionOverlay.svelte";
  import FrameDataPanel from "./FrameDataPanel.svelte";

  let {
    videoFile,
    result,
    renderer,
  }: {
    videoFile: File;
    result: Phase1Result;
    renderer: Phase1OverlayRenderer;
  } = $props();

  let videoEl: HTMLVideoElement | undefined = $state();
  let containerEl: HTMLDivElement | undefined = $state();
  let currentFrameIndex = $state(0);
  let isPlaying = $state(false);
  let videoWidth = $state(640);
  let videoHeight = $state(480);
  let videoReady = $state(false);

  const totalFrames = $derived(result.timeline.frames.length);
  const fps = $derived(result.timeline.fps);
  const frameDuration = $derived(1 / fps);

  const currentFrame = $derived<DetectionFrame | null>(
    result.timeline.frames[currentFrameIndex] ?? null
  );

  const currentTimestamp = $derived(
    currentFrame?.timestamp ?? currentFrameIndex * frameDuration
  );

  // Create the object URL inside an effect so creation and revocation are paired:
  // when videoFile changes (or the component is destroyed) the previous URL is
  // revoked before a new one is made, avoiding leaks. $derived must stay pure, so
  // this side effect belongs in $effect, not in a derived value.
  let videoUrl = $state("");
  $effect(() => {
    const url = URL.createObjectURL(videoFile);
    videoUrl = url;
    videoReady = false;
    return () => URL.revokeObjectURL(url);
  });

  // Sync video element to current frame
  $effect(() => {
    if (videoEl && videoReady && !isPlaying) {
      videoEl.currentTime = currentTimestamp;
    }
  });

  function handleVideoLoaded() {
    if (!videoEl) return;
    videoWidth = videoEl.videoWidth;
    videoHeight = videoEl.videoHeight;
    videoReady = true;
  }

  function seekToFrame(index: number) {
    currentFrameIndex = Math.max(0, Math.min(index, totalFrames - 1));
  }

  function prevFrame() {
    seekToFrame(currentFrameIndex - 1);
  }

  function nextFrame() {
    seekToFrame(currentFrameIndex + 1);
  }

  function prevStep() {
    const currentTime = currentTimestamp;
    for (let i = result.beats.length - 1; i >= 0; i--) {
      const beat = result.beats[i];
      if (beat && beat.startTime < currentTime - 0.01) {
        const beatStart = beat.startTime;
        const targetFrame = result.timeline.frames.findIndex(
          (f) => f.timestamp >= beatStart
        );
        if (targetFrame >= 0) {
          seekToFrame(targetFrame);
          return;
        }
      }
    }
    seekToFrame(0);
  }

  function nextStep() {
    const currentTime = currentTimestamp;
    for (const step of result.beats) {
      if (step.startTime > currentTime + 0.01) {
        const targetFrame = result.timeline.frames.findIndex(
          (f) => f.timestamp >= step.startTime
        );
        if (targetFrame >= 0) {
          seekToFrame(targetFrame);
          return;
        }
      }
    }
    seekToFrame(totalFrames - 1);
  }

  function togglePlayback() {
    if (!videoEl) return;

    if (isPlaying) {
      videoEl.pause();
      isPlaying = false;
    } else {
      videoEl.play();
      isPlaying = true;
    }
  }

  function handleTimeUpdate() {
    if (!videoEl || !isPlaying) return;

    // Find the closest frame to the current video time
    const currentTime = videoEl.currentTime;
    let closestIdx = 0;
    let closestDist = Infinity;

    for (let i = 0; i < result.timeline.frames.length; i++) {
      const frame = result.timeline.frames[i];
      if (!frame) continue;
      const dist = Math.abs(frame.timestamp - currentTime);
      if (dist < closestDist) {
        closestDist = dist;
        closestIdx = i;
      }
    }

    currentFrameIndex = closestIdx;
  }

  function handleVideoEnded() {
    isPlaying = false;
  }

  function handleSliderChange(event: Event) {
    const target = event.target as HTMLInputElement;
    seekToFrame(parseInt(target.value, 10));
  }

  function handleKeydown(event: KeyboardEvent) {
    // Don't capture if user is in an input field
    if (
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLTextAreaElement
    ) {
      return;
    }

    switch (event.key) {
      case "ArrowLeft":
        event.preventDefault();
        event.shiftKey ? prevStep() : prevFrame();
        break;
      case "ArrowRight":
        event.preventDefault();
        event.shiftKey ? nextStep() : nextFrame();
        break;
      case " ":
        event.preventDefault();
        togglePlayback();
        break;
    }
  }

  // Constrain display dimensions to fit container
  const displayWidth = $derived(Math.min(videoWidth, 720));
  const displayHeight = $derived(
    Math.round(displayWidth * (videoHeight / videoWidth))
  );
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="frame-inspector" bind:this={containerEl}>
  <div class="video-container" style="width: {displayWidth}px; height: {displayHeight}px;">
    <video
      bind:this={videoEl}
      src={videoUrl}
      onloadedmetadata={handleVideoLoaded}
      ontimeupdate={handleTimeUpdate}
      onended={handleVideoEnded}
      muted
      playsinline
      preload="auto"
      style="width: {displayWidth}px; height: {displayHeight}px;"
    ></video>

    {#if videoReady}
      <DetectionOverlay
        {renderer}
        frame={currentFrame}
        frameIndex={currentFrameIndex}
        beats={result.beats}
        timestamp={currentTimestamp}
        width={displayWidth}
        height={displayHeight}
      />
    {:else}
      <div class="video-loading" aria-live="polite">
        <i class="fas fa-circle-notch fa-spin"></i>
        <span>{t('skel2tka_loading_video')}</span>
      </div>
    {/if}
  </div>

  <div class="controls">
    <div class="scrubber-row">
      <button class="control-btn" onclick={prevStep} title={t('skel2tka_prev_beat_hint')} aria-label={t('skel2tka_prev_beat')}>
        <i class="fas fa-step-backward"></i>
      </button>
      <button class="control-btn" onclick={prevFrame} title={t('skel2tka_prev_frame_hint')} aria-label={t('skel2tka_prev_frame')}>
        <i class="fas fa-chevron-left"></i>
      </button>
      <button class="control-btn play-btn" onclick={togglePlayback} title={t('skel2tka_play_pause_hint')} aria-label={isPlaying ? t('skel2tka_pause') : t('skel2tka_play')}>
        <i class="fas {isPlaying ? 'fa-pause' : 'fa-play'}"></i>
      </button>
      <button class="control-btn" onclick={nextFrame} title={t('skel2tka_next_frame_hint')} aria-label={t('skel2tka_next_frame')}>
        <i class="fas fa-chevron-right"></i>
      </button>
      <button class="control-btn" onclick={nextStep} title={t('skel2tka_next_beat_hint')} aria-label={t('skel2tka_next_beat')}>
        <i class="fas fa-step-forward"></i>
      </button>
    </div>

    <div class="slider-row">
      <input
        type="range"
        min="0"
        max={totalFrames - 1}
        value={currentFrameIndex}
        oninput={handleSliderChange}
        class="frame-slider"
        aria-label={t('skel2tka_frame_scrubber')}
      />
    </div>

    <div class="keyboard-hints">
      <span><kbd>&larr;</kbd><kbd>&rarr;</kbd> {t('skel2tka_kbd_frame')}</span>
      <span><kbd>Shift</kbd>+<kbd>&larr;</kbd><kbd>&rarr;</kbd> {t('skel2tka_kbd_beat')}</span>
      <span><kbd>Space</kbd> {t('skel2tka_kbd_play')}</span>
    </div>
  </div>

  <FrameDataPanel
    frame={currentFrame}
    frameIndex={currentFrameIndex}
    {totalFrames}
    timestamp={currentTimestamp}
    beats={result.beats}
  />
</div>

<style>
  .frame-inspector {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .video-container {
    position: relative;
    background: #000;
    border-radius: 8px;
    overflow: hidden;
  }

  video {
    display: block;
    object-fit: contain;
  }

  .video-loading {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.5));
    font-size: var(--font-size-compact, 12px);
  }

  .video-loading i {
    font-size: 20px;
    color: var(--theme-accent, #3b82f6);
  }

  .controls {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .scrubber-row {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
  }

  .control-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 6px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    color: var(--theme-text, #ffffff);
    cursor: pointer;
    font-size: 14px;
    transition: background 0.15s;
  }

  .control-btn:hover {
    background: var(--theme-card-bg-hover, rgba(255, 255, 255, 0.08));
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.15));
  }

  .play-btn {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    font-size: 16px;
  }

  .slider-row {
    padding: 0 4px;
  }

  .frame-slider {
    width: 100%;
    height: 6px;
    appearance: none;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.08));
    border-radius: 3px;
    outline: none;
    cursor: pointer;
  }

  .frame-slider::-webkit-slider-thumb {
    appearance: none;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--theme-accent, #3b82f6);
    cursor: pointer;
  }

  .frame-slider::-moz-range-thumb {
    width: 14px;
    height: 14px;
    border: none;
    border-radius: 50%;
    background: var(--theme-accent, #3b82f6);
    cursor: pointer;
  }

  .keyboard-hints {
    display: flex;
    justify-content: center;
    gap: 16px;
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.4));
  }

  .keyboard-hints kbd {
    display: inline-block;
    padding: 1px 4px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.08));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.15));
    border-radius: 3px;
    font-family: monospace;
    font-size: 11px;
  }
</style>
