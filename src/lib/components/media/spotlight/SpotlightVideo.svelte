<!--
  SpotlightVideo.svelte

  Video player component for the media spotlight viewer.

  Features:
  - Native HTML5 video with custom controls
  - Play/pause on tap
  - Progress scrubbing
  - Mute toggle
  - Picture-in-picture support (where available)
-->
<script lang="ts">
  import type { MediaItem } from "./MediaSpotlight.svelte";
  import { formatTime } from "#lib/shared/sequence-viewer/utils/format-time.js";

  interface Props {
    /** The video item to display */
    item: MediaItem;
    /** Whether controls should be visible */
    controlsVisible?: boolean;
    /** Called when video loads */
    onLoad?: () => void;
    /** Called on error */
    onError?: (message: string) => void;
  }

  let {
    item,
    controlsVisible = true,
    onLoad,
    onError,
  }: Props = $props();

  let videoRef = $state<HTMLVideoElement | null>(null);
  let isPlaying = $state(false);
  let isMuted = $state(false);
  let currentTime = $state(0);
  let duration = $state(0);
  let isLoaded = $state(false);
  let hasError = $state(false);

  const progress = $derived(duration > 0 ? (currentTime / duration) * 100 : 0);
  const formattedTime = $derived(formatTime(currentTime));
  const formattedDuration = $derived(formatTime(duration));

  function handleLoadedMetadata() {
    if (videoRef) {
      duration = videoRef.duration;
      isLoaded = true;
      onLoad?.();
    }
  }

  function handleTimeUpdate() {
    if (videoRef) {
      currentTime = videoRef.currentTime;
    }
  }

  function handleError() {
    hasError = true;
    onError?.("Failed to load video");
  }

  function togglePlay() {
    if (videoRef) {
      if (isPlaying) {
        videoRef.pause();
        isPlaying = false;
      } else {
        videoRef.play();
        isPlaying = true;
      }
    }
  }

  function toggleMute() {
    if (videoRef) {
      videoRef.muted = !videoRef.muted;
      isMuted = videoRef.muted;
    }
  }

  function handleProgressClick(e: MouseEvent) {
    if (!videoRef || !duration) return;

    const target = e.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = clickX / rect.width;
    videoRef.currentTime = percentage * duration;
  }

  function handleVideoClick() {
    togglePlay();
  }

  async function togglePiP() {
    if (!videoRef) return;

    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (document.pictureInPictureEnabled) {
        await videoRef.requestPictureInPicture();
      }
    } catch (err) {
      console.warn("PiP not supported:", err);
    }
  }
</script>

<div class="spotlight-video-container">
  <!-- svelte-ignore a11y_media_has_caption -->
  <video
    bind:this={videoRef}
    class="spotlight-video"
    src={item.url}
    poster={item.thumbnailUrl}
    playsinline
    onclick={handleVideoClick}
    onloadedmetadata={handleLoadedMetadata}
    ontimeupdate={handleTimeUpdate}
    onerror={handleError}
    onended={() => { isPlaying = false; }}
  >
    Your browser does not support video playback.
  </video>

  {#if hasError}
    <div class="spotlight-video-error">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="48"
        height="48"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      <p>Failed to load video</p>
    </div>
  {/if}

  <!-- Play/Pause Overlay (when paused) -->
  {#if !isPlaying && isLoaded && !hasError}
    <button
      class="spotlight-video-play-overlay"
      onclick={togglePlay}
      aria-label="Play video"
      type="button"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="64"
        height="64"
        viewBox="0 0 24 24"
        fill="currentColor"
      >
        <polygon points="5 3 19 12 5 21 5 3" />
      </svg>
    </button>
  {/if}

  <!-- Controls Bar -->
  {#if controlsVisible && isLoaded}
    <div class="spotlight-video-controls">
      <!-- Play/Pause Button -->
      <button
        class="video-control-btn"
        onclick={togglePlay}
        aria-label={isPlaying ? "Pause" : "Play"}
        type="button"
      >
        {#if isPlaying}
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="4" width="4" height="16" />
            <rect x="14" y="4" width="4" height="16" />
          </svg>
        {:else}
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
        {/if}
      </button>

      <!-- Time Display -->
      <div class="video-time">
        <span class="video-time-current">{formattedTime}</span>
        <span class="video-time-separator">/</span>
        <span class="video-time-duration">{formattedDuration}</span>
      </div>

      <!-- Progress Bar -->
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <div
        class="video-progress"
        onclick={handleProgressClick}
        role="slider"
        aria-label="Seek video"
        aria-valuenow={currentTime}
        aria-valuemin={0}
        aria-valuemax={duration}
        tabindex="0"
      >
        <div class="video-progress-track">
          <div class="video-progress-fill" style:width="{progress}%"></div>
        </div>
      </div>

      <!-- Mute Button -->
      <button
        class="video-control-btn"
        onclick={toggleMute}
        aria-label={isMuted ? "Unmute" : "Mute"}
        type="button"
      >
        {#if isMuted}
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            <line x1="23" y1="9" x2="17" y2="15" />
            <line x1="17" y1="9" x2="23" y2="15" />
          </svg>
        {:else}
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
          </svg>
        {/if}
      </button>

      <!-- PiP Button (if supported) -->
      {#if document?.pictureInPictureEnabled}
        <button
          class="video-control-btn"
          onclick={togglePiP}
          aria-label="Picture in picture"
          type="button"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
            <rect x="12" y="10" width="8" height="6" rx="1" ry="1" />
          </svg>
        </button>
      {/if}
    </div>
  {/if}
</div>

<style>
  .spotlight-video-container {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }

  .spotlight-video {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    cursor: pointer;
  }

  .spotlight-video-error {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    color: rgba(255, 255, 255, 0.8);
    background: rgba(0, 0, 0, 0.5);
  }

  .spotlight-video-error svg {
    opacity: 0.6;
  }

  .spotlight-video-error p {
    margin: 0;
    font-size: 14px;
  }

  /* Play Overlay */
  .spotlight-video-play-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.3);
    border: none;
    cursor: pointer;
    transition: background 150ms ease;
  }

  .spotlight-video-play-overlay:hover {
    background: rgba(0, 0, 0, 0.4);
  }

  .spotlight-video-play-overlay svg {
    color: white;
    filter: drop-shadow(0 2px 8px rgba(0, 0, 0, 0.4));
    transition: transform 150ms cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  .spotlight-video-play-overlay:hover svg {
    transform: scale(1.1);
  }

  /* Controls Bar */
  .spotlight-video-controls {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    padding-bottom: calc(12px + var(--spotlight-safe-area-bottom, 0px));
    background: linear-gradient(to top, rgba(0, 0, 0, 0.8) 0%, transparent 100%);
  }

  .video-control-btn {
    width: 40px;
    height: 40px;
    border: none;
    border-radius: 50%;
    background: transparent;
    color: white;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition:
      background 150ms ease,
      transform 150ms ease;
  }

  .video-control-btn:hover {
    background: rgba(255, 255, 255, 0.1);
  }

  .video-control-btn:active {
    transform: scale(0.95);
  }

  .video-control-btn:focus-visible {
    outline: 2px solid white;
    outline-offset: 2px;
  }

  .video-time {
    font-size: 13px;
    font-variant-numeric: tabular-nums;
    color: rgba(255, 255, 255, 0.9);
    white-space: nowrap;
  }

  .video-time-separator {
    margin: 0 2px;
    opacity: 0.6;
  }

  .video-progress {
    flex: 1;
    height: 32px;
    padding: 0;
    background: transparent;
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
  }

  .video-progress:focus-visible {
    outline: 2px solid white;
    outline-offset: 2px;
  }

  .video-progress-track {
    width: 100%;
    height: 4px;
    background: rgba(255, 255, 255, 0.3);
    border-radius: 2px;
    overflow: hidden;
    transition: height 150ms ease;
  }

  .video-progress:hover .video-progress-track {
    height: 6px;
  }

  .video-progress-fill {
    height: 100%;
    background: white;
    border-radius: 2px;
    transition: width 100ms linear;
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .spotlight-video-play-overlay svg,
    .video-control-btn,
    .video-progress-track {
      transition: none;
    }
  }
</style>
