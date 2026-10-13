<!--
  UploadProgress - Animated progress bar during screenshot upload to Firebase.
  Matches CaptureProgress styling. Shows phases: deduplicating, uploading, completed, failed.
-->
<script lang="ts">
  import type { UploadProgress } from "../../services/types";

  interface Props {
    progress: UploadProgress;
    onRetry?: () => void;
  }

  let { progress, onRetry }: Props = $props();

  let prevUploaded = $state(0);
  let countBump = $state(false);

  const totalToUpload = $derived(progress.total - progress.skipped);

  const progressPercent = $derived(
    totalToUpload > 0
      ? Math.round((progress.uploaded / totalToUpload) * 100)
      : progress.phase === "completed"
        ? 100
        : 0
  );

  // Animate count changes
  $effect(() => {
    if (progress.uploaded === prevUploaded) return;
    prevUploaded = progress.uploaded;
    countBump = true;
    const timeout = setTimeout(() => {
      countBump = false;
    }, 300);
    return () => clearTimeout(timeout);
  });
</script>

<div
  class="upload-progress"
  class:failed={progress.phase === "failed"}
  class:completed={progress.phase === "completed"}
>
  <div class="progress-header">
    {#if progress.phase === "deduplicating"}
      <i class="fas fa-circle-notch fa-spin"></i>
      <span class="progress-text">Checking for duplicates...</span>
    {:else if progress.phase === "uploading"}
      <i class="fas fa-cloud-upload-alt fa-spin-pulse"></i>
      <span class="progress-text">
        Uploading
        <span class="count" class:bump={countBump}>
          {progress.uploaded} / {totalToUpload}
        </span>
      </span>
    {:else if progress.phase === "completed"}
      <i class="fas fa-check-circle complete-icon"></i>
      <span class="progress-text">
        Uploaded {progress.uploaded} screenshot{progress.uploaded !== 1
          ? "s"
          : ""}
        {#if progress.skipped > 0}
          <span class="skip-note">({progress.skipped} skipped)</span>
        {/if}
      </span>
    {:else}
      <i class="fas fa-exclamation-triangle error-icon"></i>
      <span class="progress-text">Upload failed</span>
    {/if}
  </div>

  <div class="progress-bar-track">
    <div
      class="progress-bar-fill"
      class:complete={progress.phase === "completed"}
      class:error={progress.phase === "failed"}
      class:running={progress.phase === "uploading"}
      style="width: {progressPercent}%"
    ></div>
  </div>

  {#if progress.phase === "uploading" && progress.currentFile}
    <p class="current-file">{progress.currentFile}</p>
  {/if}

  {#if progress.phase === "failed"}
    {#if progress.errors.length > 0}
      <p class="error-detail">{progress.errors.join("\n")}</p>
    {/if}
    {#if onRetry}
      <button class="retry-btn" onclick={onRetry}>
        <i class="fas fa-redo"></i>
        Retry
      </button>
    {/if}
  {/if}
</div>

<style>
  .upload-progress {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 8px;
    animation: slideUp var(--duration-normal)
      var(--ease-out, var(--ease-standard-out));
  }

  .upload-progress.failed {
    border-color: var(--semantic-error, #ef4444);
    animation: shake calc(var(--duration-dramatic) + var(--duration-fast))
      var(--ease-standard);
  }

  .upload-progress.completed {
    border-color: var(--semantic-success, #22c55e);
  }

  .progress-header {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: var(--font-size-min, 14px);
    color: var(--theme-text, #fff);
  }

  .progress-header i {
    font-size: var(--font-size-compact, 12px);
  }

  .complete-icon {
    color: var(--semantic-success, #22c55e);
    animation: popIn var(--duration-emphasis)
      var(--ease-spring, var(--ease-spring));
  }

  .error-icon {
    color: var(--semantic-error, #ef4444);
  }

  .progress-text {
    font-weight: 500;
  }

  .count {
    font-variant-numeric: tabular-nums;
    display: inline-block;
    transition: transform var(--duration-instant)
      var(--ease-spring, var(--ease-spring));
  }

  .count.bump {
    animation: scaleIn var(--duration-fast)
      var(--ease-spring, var(--ease-spring));
  }

  .skip-note {
    font-weight: 400;
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.5));
  }

  .progress-bar-track {
    height: 6px;
    border-radius: 3px;
    background: var(--theme-stroke, rgba(255, 255, 255, 0.1));
    overflow: hidden;
    position: relative;
  }

  .progress-bar-fill {
    height: 100%;
    border-radius: 3px;
    background: var(--theme-accent, #3b82f6);
    transition: width var(--duration-emphasis) var(--ease-standard);
    position: relative;
  }

  .progress-bar-fill.running::after {
    content: "";
    position: absolute;
    inset: 0;
    background: linear-gradient(
      90deg,
      transparent 0%,
      rgba(255, 255, 255, 0.25) 50%,
      transparent 100%
    );
    background-size: 200% 100%;
    animation: shimmer 1.5s linear infinite;
  }

  .progress-bar-fill.complete {
    background: var(--semantic-success, #22c55e);
  }

  .progress-bar-fill.error {
    background: var(--semantic-error, #ef4444);
  }

  .current-file {
    margin: 0;
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.5));
    font-family: "SF Mono", "Fira Code", monospace;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .error-detail {
    margin: 0;
    font-size: var(--font-size-compact, 12px);
    color: var(--semantic-error, #ef4444);
    font-family: "SF Mono", "Fira Code", monospace;
    white-space: pre-wrap;
    max-height: 80px;
    overflow-y: auto;
  }

  .retry-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    align-self: flex-start;
    padding: 6px 14px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.15));
    border-radius: 6px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    color: var(--theme-text, #fff);
    font-size: var(--font-size-compact, 12px);
    font-family: inherit;
    cursor: pointer;
    transition:
      background var(--duration-fast) var(--ease-out, ease-out),
      border-color var(--duration-fast) var(--ease-out, ease-out),
      color var(--duration-fast) var(--ease-out, ease-out),
      opacity var(--duration-fast) var(--ease-out, ease-out),
      transform var(--duration-fast) var(--ease-out, ease-out),
      box-shadow var(--duration-fast) var(--ease-out, ease-out),
      max-height var(--duration-fast) var(--ease-out, ease-out);
  }

  .retry-btn:hover {
    background: rgba(255, 255, 255, 0.08);
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.25));
  }

  .retry-btn:active {
    transform: scale(0.97);
  }

  .retry-btn:focus-visible {
    outline: 2px solid var(--theme-accent, #3b82f6);
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    .upload-progress,
    .upload-progress.failed {
      animation: none;
    }

    .complete-icon,
    .count.bump {
      animation: none;
    }

    .progress-bar-fill {
      transition: none;
    }

    .progress-bar-fill.running::after {
      animation: none;
    }

    .count {
      transition: none;
    }

    .retry-btn {
      transition: none;
    }

    .retry-btn:active {
      transform: none;
    }
  }
</style>
