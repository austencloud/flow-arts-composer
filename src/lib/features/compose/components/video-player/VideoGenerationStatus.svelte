<!--
  VideoGenerationStatus.svelte

  Displays the progress indicator when a video is being generated.
  Shows current phase, percentage, frame count, and allows cancellation.
-->
<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import ProgressRing from "$lib/shared/components/loading/ProgressRing.svelte";
  import type { VideoRenderProgress } from "$lib/shared/animation-engine/services/video-pre-renderer";
  let {
    progress,
    onCancel,
  }: {
    progress: VideoRenderProgress;
    onCancel: () => void;
  } = $props();
</script>

<div class="video-generation-status" role="status" aria-live="polite">
  <div class="status-content">
    <ProgressRing percent={-1} size={24} strokeWidth={2} />
    <div class="status-text">
      {#if progress.phase === "rendering"}
        Generating video... {progress.percent.toFixed(0)}%
      {:else if progress.phase === "encoding"}
        Encoding video...
      {:else}
        Complete!
      {/if}
    </div>
    <button class="cancel-btn" type="button" onclick={onCancel}
      >{t("action_cancel")}</button
    >
  </div>
  <div
    class="progress-bar"
    role="progressbar"
    aria-valuenow={progress.percent}
    aria-valuemin={0}
    aria-valuemax={100}
  >
    <div class="progress-fill" style="width: {progress.percent}%"></div>
  </div>
  <div class="status-detail">
    Frame {progress.currentFrame} / {progress.totalFrames}
  </div>
</div>

<style>
  .video-generation-status {
    position: absolute;
    top: 12px;
    right: 12px;
    background: var(--theme-panel-bg);
    color: white;
    padding: 12px 16px;
    border-radius: 10px;
    font-size: var(--font-size-compact);
    z-index: 20;
    min-width: 220px;
  }

  .status-content {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 8px;
  }

  .status-text {
    flex: 1;
  }

  .status-detail {
    font-size: var(--font-size-compact);
    color: var(--theme-text-dim);
    margin-top: 6px;
  }

  .cancel-btn {
    background: color-mix(in srgb, var(--theme-text) 20%, transparent);
    border: none;
    color: white;
    padding: 10px 14px;
    min-height: var(--min-touch-target);
    border-radius: 6px;
    cursor: pointer;
    font-size: var(--font-size-compact);
  }

  .cancel-btn:hover {
    background: color-mix(in srgb, var(--theme-text) 30%, transparent);
  }

  .progress-bar {
    width: 100%;
    height: 4px;
    background: color-mix(in srgb, var(--theme-text) 20%, transparent);
    border-radius: 2px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: linear-gradient(
      90deg,
      var(--semantic-success-bright, #4ade80),
      var(--semantic-success)
    );
    transition: width var(--duration-normal) ease;
  }

  @media (prefers-reduced-motion: reduce) {
    .progress-fill {
      transition: none;
    }
  }
</style>
