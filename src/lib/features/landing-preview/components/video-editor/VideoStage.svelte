<script lang="ts">
  /**
   * VideoStage
   *
   * Left panel of the video editor - contains the video player with
   * crop/snip controls in the header.
   */
  import CroppedVideoPlayer from "../CroppedVideoPlayer.svelte";
  import type { ShowcaseVideo } from "../../types";
  import ProgressRing from "#lib/shared/components/loading/ProgressRing.svelte";

  interface Props {
    video: ShowcaseVideo;
    videoUrl: string | null;
    saving: boolean;
    onOpenCrop: () => void;
    onClearCrop: () => void;
    onOpenSnip: () => void;
    onClearSnip: () => void;
    /** Bind to get video element reference */
    videoElement?: HTMLVideoElement | null;
    onTimeUpdate?: () => void;
  }

  let {
    video,
    videoUrl,
    saving,
    onOpenCrop,
    onClearCrop,
    onOpenSnip,
    onClearSnip,
    videoElement = $bindable(null),
    onTimeUpdate,
  }: Props = $props();

  const hasCrop = $derived(!!video.crop);
  const hasSnip = $derived(!!video.snip);

  const snipDurationLabel = $derived.by(() => {
    if (!video.snip) return "";
    const duration = video.snip.outPoint - video.snip.inPoint;
    return `${duration.toFixed(1)}s`;
  });

  const currentVideoSrc = $derived(videoUrl || video.videoUrl);
</script>

<div class="video-stage">
  <!-- Header controls -->
  <div class="stage-header">
    <div class="header-actions">
      <button
        class="control-btn"
        class:active={hasCrop}
        onclick={onOpenCrop}
        disabled={saving}
        aria-label="Crop video"
        title={hasCrop ? `Cropped: ${video.crop?.aspectLabel}` : "Crop video"}
      >
        <i class="fas fa-crop-alt" aria-hidden="true"></i>
        {#if hasCrop}
          <span class="control-label">{video.crop?.aspectLabel}</span>
        {/if}
      </button>
      {#if hasCrop}
        <button
          class="clear-btn"
          onclick={onClearCrop}
          disabled={saving}
          aria-label="Clear crop"
          title="Clear crop"
        >
          <i class="fas fa-times" aria-hidden="true"></i>
        </button>
      {/if}
      <button
        class="control-btn"
        class:active={hasSnip}
        onclick={onOpenSnip}
        disabled={saving}
        aria-label="Trim video"
        title={hasSnip ? `Trimmed: ${snipDurationLabel}` : "Trim video"}
      >
        <i class="fas fa-cut" aria-hidden="true"></i>
        {#if hasSnip}
          <span class="control-label">{snipDurationLabel}</span>
        {/if}
      </button>
      {#if hasSnip}
        <button
          class="clear-btn"
          onclick={onClearSnip}
          disabled={saving}
          aria-label="Clear trim"
          title="Clear trim"
        >
          <i class="fas fa-times" aria-hidden="true"></i>
        </button>
      {/if}
    </div>
  </div>

  <!-- Video player -->
  <div class="video-container">
    {#if currentVideoSrc}
      <CroppedVideoPlayer
        src={currentVideoSrc}
        crop={video.crop}
        snip={video.snip}
        bind:videoElement
        {onTimeUpdate}
        controls
        autoplay
        loop
        playsinline
      />
    {:else}
      <div class="video-loading">
        <ProgressRing percent={-1} size={32} strokeWidth={3} />
        <span>Loading video...</span>
      </div>
    {/if}
  </div>
</div>

<style>
  .video-stage {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
    height: 100%;
  }

  .stage-header {
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 12px 0;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 6px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border-radius: 12px;
  }

  .control-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 10px 14px;
    border-radius: 8px;
    border: none;
    background: transparent;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    cursor: pointer;
    font-size: 14px;
    transition: all 0.2s;
  }

  .control-btn:hover:not(:disabled) {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.08));
    color: var(--theme-text, white);
  }

  .control-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .control-btn.active {
    background: color-mix(in srgb, var(--theme-accent, #6366f1) 30%, transparent);
    color: var(--theme-accent-light, #a5b4fc);
  }

  .control-btn.active:hover:not(:disabled) {
    background: color-mix(in srgb, var(--theme-accent, #6366f1) 40%, transparent);
  }

  .control-label {
    font-size: 12px;
    font-weight: 600;
  }

  .clear-btn {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    border: none;
    background: color-mix(in srgb, var(--semantic-error, #ef4444) 30%, transparent);
    color: #fca5a5;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    transition: all 0.2s;
  }

  .clear-btn:hover:not(:disabled) {
    background: color-mix(in srgb, var(--semantic-error, #ef4444) 50%, transparent);
    color: white;
  }

  .clear-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .video-container {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 0;
    overflow: hidden;
  }

  .video-container :global(video) {
    max-width: 100%;
    max-height: 100%;
    border-radius: 16px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  }

  .video-loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    font-size: 14px;
  }

  /* Mobile: video takes less height */
  @media (max-width: 900px) {
    .video-stage {
      flex: 0 0 auto;
      max-height: 45vh;
    }

    .stage-header {
      padding: 8px 0;
    }
  }
</style>
