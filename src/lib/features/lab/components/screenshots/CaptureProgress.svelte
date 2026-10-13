<!--
  CaptureProgress - Animated progress bar and count during active captures.
  Auto-polls the capture job status endpoint every 2 seconds.
  Shimmer overlay while running, popIn on completion, shake on error.
-->
<script lang="ts">
  import { untrack } from "svelte";
  import type { CaptureJobStatus } from "../../services/types";

  interface OrchestratorLike {
    getJobStatus(jobId: string): Promise<CaptureJobStatus>;
  }

  interface Props {
    jobId: string | null;
    orchestrator: OrchestratorLike;
    onPollStatus?: (status: CaptureJobStatus) => void;
    onComplete?: () => void;
  }

  let { jobId, orchestrator, onPollStatus, onComplete }: Props = $props();

  let status = $state<CaptureJobStatus | null>(null);
  let prevCompleted = $state(0);
  let countBump = $state(false);
  // Not reactive - infrastructure-only, no rendering depends on this ref
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  const progressPercent = $derived(
    status && status.total > 0
      ? Math.round((status.completed / status.total) * 100)
      : 0
  );

  const elapsed = $derived(() => {
    if (!status) return "";
    const ms = (status.finishedAt ?? Date.now()) - status.startedAt;
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  });

  // Animate count changes
  $effect(() => {
    if (!status || status.completed === prevCompleted) return;
    prevCompleted = status.completed;
    countBump = true;
    const timeout = setTimeout(() => {
      countBump = false;
    }, 300);
    return () => clearTimeout(timeout);
  });

  // Poll job status when jobId is set
  $effect(() => {
    const id = jobId;

    if (!id) {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
      status = null;
      return;
    }

    // Start polling via orchestrator service
    async function poll() {
      if (!id) return;
      try {
        const data = await orchestrator.getJobStatus(id);
        status = data;
        onPollStatus?.(data);

        if (data.status === "completed" || data.status === "failed") {
          if (pollTimer) {
            clearInterval(pollTimer);
            pollTimer = null;
          }
          onComplete?.();
        }
      } catch {
        // Network error, keep polling
      }
    }

    untrack(() => {
      poll(); // Immediate first poll
      pollTimer = setInterval(poll, 2000);
    });

    return () => {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    };
  });
</script>

{#if status}
  <div
    class="capture-progress"
    class:failed={status.status === "failed"}
    class:completed={status.status === "completed"}
  >
    <div class="progress-header">
      {#if status.status === "running"}
        <i class="fas fa-circle-notch fa-spin"></i>
        <span class="progress-text">
          Capturing
          <span class="count" class:bump={countBump}>
            {status.completed} / {status.total}
          </span>
        </span>
      {:else if status.status === "completed"}
        <i class="fas fa-check-circle complete-icon"></i>
        <span class="progress-text">
          Captured {status.completed} screenshots
        </span>
      {:else}
        <i class="fas fa-exclamation-triangle error-icon"></i>
        <span class="progress-text">Capture failed</span>
      {/if}
      <span class="elapsed">{elapsed()}</span>
    </div>

    <div class="progress-bar-track">
      <div
        class="progress-bar-fill"
        class:complete={status.status === "completed"}
        class:error={status.status === "failed"}
        class:running={status.status === "running"}
        style="width: {progressPercent}%"
      ></div>
    </div>

    {#if status.status === "failed" && status.error}
      <p class="error-detail">{status.error}</p>
    {/if}
  </div>
{/if}

<style>
  .capture-progress {
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

  .capture-progress.failed {
    border-color: var(--semantic-error, #ef4444);
    animation: shake calc(var(--duration-dramatic) + var(--duration-fast))
      var(--ease-standard);
  }

  .capture-progress.completed {
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

  .elapsed {
    margin-left: auto;
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.5));
    font-variant-numeric: tabular-nums;
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

  .error-detail {
    margin: 0;
    font-size: var(--font-size-compact, 12px);
    color: var(--semantic-error, #ef4444);
    font-family: "SF Mono", "Fira Code", monospace;
    white-space: pre-wrap;
    max-height: 80px;
    overflow-y: auto;
  }

  @media (prefers-reduced-motion: reduce) {
    .capture-progress,
    .capture-progress.failed {
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
  }
</style>
