<!--
  VideoPreviewPanel.svelte

  Inline video preview shown after a successful video export.
  Displays the exported video with playback controls, re-download, and dismiss.
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { fade } from "svelte/transition";
  import { shareTarget } from "#lib/shared/mobile/share-action.svelte.js";

  interface Props {
    blobUrl: string;
    onDismiss: () => void;
    onRedownload: () => void;
    /** Desktop label for the save/download action. Defaults to "Save Again" (the
     *  2D path auto-downloads first); preview-first callers (tunnel) pass "Save".
     *  On mobile the label is always "Share" — the action opens the native share
     *  sheet (shareOrDownloadBlob), so the desktop copy is overridden there. */
    saveLabel?: string;
    /** Opt-in cloud save. The button only exists when a host supplies this, so
     *  a surface with no sequence to attach a film to never shows it. */
    onSaveToCloud?: () => void | Promise<void>;
    cloudSaveLabel?: string;
  }

  let {
    blobUrl,
    onDismiss,
    onRedownload,
    saveLabel,
    onSaveToCloud,
    cloudSaveLabel,
  }: Props = $props();

  let cloudSaveState = $state<"idle" | "saving" | "saved">("idle");

  async function saveToCloud() {
    if (!onSaveToCloud || cloudSaveState !== "idle") return;
    cloudSaveState = "saving";
    try {
      await onSaveToCloud();
      cloudSaveState = "saved";
    } catch {
      // The host owns the error message; this button just becomes available
      // again so the person can retry.
      cloudSaveState = "idle";
    }
  }

  // Mobile shares (native sheet); keep each host's desktop copy otherwise.
  const effectiveSaveLabel = $derived(shareTarget.isMobile ? t("viewer_share") : (saveLabel ?? t("viewer_ui_save_again")));
  const effectiveCloudSaveLabel = $derived(cloudSaveLabel ?? t("viewer_ui_save_to_sequence"));

  let videoEl = $state<HTMLVideoElement | null>(null);
  let isPlaying = $state(false);
  let hasEnded = $state(false);

  function handlePlay() {
    isPlaying = true;
    hasEnded = false;
  }

  function handlePause() {
    isPlaying = false;
  }

  function handleEnded() {
    isPlaying = false;
    hasEnded = true;
  }

  function togglePlayback() {
    if (!videoEl) return;
    if (videoEl.paused) {
      if (hasEnded) {
        videoEl.currentTime = 0;
        hasEnded = false;
      }
      videoEl.play();
    } else {
      videoEl.pause();
    }
  }

  function replay() {
    if (!videoEl) return;
    videoEl.currentTime = 0;
    hasEnded = false;
    videoEl.play();
  }
</script>

<div
  class="preview-panel"
  in:fade={{ duration: 200 }}
  role="region"
  aria-label={t("viewer_ui_video_export_preview")}
>
  <div class="preview-header">
    <div class="success-badge">
      <i class="fas fa-check-circle" aria-hidden="true"></i>
      <span>{t("viewer_ui_export_complete")}</span>
    </div>
  </div>

  <div class="video-container">
    <!-- svelte-ignore a11y_media_has_caption -->
    <video
      bind:this={videoEl}
      src={blobUrl}
      playsinline
      onplay={handlePlay}
      onpause={handlePause}
      onended={handleEnded}
      class="preview-video"
    ></video>

    <button
      type="button"
      class="play-overlay"
      class:visible={!isPlaying}
      onclick={togglePlayback}
      aria-label={hasEnded ? t("viewer_ui_replay_video") : isPlaying ? t("viewer_ui_pause_video") : t("viewer_ui_play_video")}
    >
      <div class="play-icon">
        {#if hasEnded}
          <i class="fas fa-redo" aria-hidden="true"></i>
        {:else}
          <i class="fas fa-play" aria-hidden="true"></i>
        {/if}
      </div>
    </button>
  </div>

  <div class="preview-actions">
    <button
      type="button"
      class="action-btn secondary"
      onclick={replay}
      aria-label={t("viewer_ui_replay_video")}
    >
      <i class="fas fa-redo" aria-hidden="true"></i>
      {t("viewer_ui_replay")}
    </button>
    <button
      data-save-shortcut={!shareTarget.isMobile ? "" : undefined}
      type="button"
      class="action-btn primary"
      onclick={onRedownload}
      aria-label={effectiveSaveLabel}
    >
      <i class="fas {shareTarget.isMobile ? 'fa-share-nodes' : 'fa-download'}" aria-hidden="true"></i>
      {effectiveSaveLabel}
    </button>
    {#if onSaveToCloud}
      <button
        type="button"
        class="action-btn secondary"
        onclick={() => void saveToCloud()}
        disabled={cloudSaveState !== "idle"}
        aria-label={effectiveCloudSaveLabel}
      >
        <i
          class="fas {cloudSaveState === 'saved'
            ? 'fa-check'
            : cloudSaveState === 'saving'
              ? 'fa-spinner fa-spin'
              : 'fa-cloud-arrow-up'}"
          aria-hidden="true"
        ></i>
        {cloudSaveState === "saved"
          ? t("viewer_ui_saved")
          : cloudSaveState === "saving"
            ? t("viewer_ui_saving")
            : effectiveCloudSaveLabel}
      </button>
    {/if}
    <button
      type="button"
      class="action-btn secondary"
      onclick={onDismiss}
      aria-label={t("viewer_ui_done_return_viewer")}
    >
      <i class="fas fa-check" aria-hidden="true"></i>
      {t("viewer_ui_done")}
    </button>
  </div>
</div>

<style>
  .preview-panel {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 12px 16px;
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    flex-shrink: 0;
  }

  .preview-header {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .success-badge {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 14px;
    background: color-mix(in srgb, var(--semantic-success, #22c55e) 15%, transparent);
    border: 1px solid color-mix(in srgb, var(--semantic-success, #22c55e) 40%, transparent);
    border-radius: 20px;
    color: var(--semantic-success, #22c55e);
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
  }

  .success-badge i {
    font-size: 14px;
  }

  .video-container {
    position: relative;
    border-radius: 12px;
    overflow: hidden;
    background: black;
    aspect-ratio: 1 / 1;
    max-height: 300px;
    align-self: center;
    width: 100%;
    max-width: 300px;
  }

  .preview-video {
    width: 100%;
    height: 100%;
    object-fit: contain;
    display: block;
  }

  .play-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.3);
    border: none;
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.2s ease;
    -webkit-tap-highlight-color: transparent;
  }

  .play-overlay.visible {
    opacity: 1;
  }

  .play-overlay:hover {
    opacity: 1;
  }

  .play-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 56px;
    height: 56px;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(8px);
    border: 1px solid var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
    color: white;
    font-size: 22px;
    transition: transform 0.15s ease;
  }

  .play-overlay:hover .play-icon {
    transform: scale(1.08);
  }

  .play-overlay:active .play-icon {
    transform: scale(0.95);
  }

  .preview-actions {
    display: flex;
    gap: 8px;
  }

  .action-btn {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: var(--min-touch-target);
    padding: 10px 14px;
    border-radius: 10px;
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .action-btn:disabled {
    cursor: default;
    opacity: 0.7;
    -webkit-tap-highlight-color: transparent;
  }

  .action-btn.secondary {
    background: color-mix(in srgb, var(--theme-card-bg) 70%, transparent);
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
  }

  .action-btn.secondary:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.15));
    color: var(--theme-text, white);
  }

  .action-btn.primary {
    background: var(--theme-accent, #6366f1);
    border: none;
    color: white;
  }

  .action-btn.primary:hover {
    filter: brightness(1.1);
    box-shadow: 0 4px 12px color-mix(in srgb, var(--theme-accent, #6366f1) 40%, transparent);
  }

  .action-btn:active {
    transform: scale(0.96);
    transition-duration: 50ms;
  }

  .action-btn:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--theme-accent, #6366f1) 50%, transparent);
    outline-offset: 2px;
  }

  @media (min-width: 768px) {
    .video-container {
      max-height: 400px;
      max-width: 400px;
    }

    .preview-panel {
      padding: 20px 24px;
      gap: 16px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .play-overlay,
    .play-icon,
    .action-btn {
      transition: none !important;
    }

    .action-btn:active {
      transform: none !important;
    }
  }
</style>
