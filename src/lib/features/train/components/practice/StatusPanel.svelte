<!--
  StatusPanel.svelte - Status indicators panel for Practice tab

  Consolidates camera/tracking/active status with collapsible performance stats.
  Mobile: Auto-collapses to show only status dots.
-->
<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { getPositionDetector } from "$lib/features/train/get-position-detector";
  import { t } from "$lib/shared/i18n/i18n.svelte.js";

  interface Props {
    isCameraReady?: boolean;
    isDetectionReady?: boolean;
    isDetectionActive?: boolean;
  }

  let {
    isCameraReady = false,
    isDetectionReady = false,
    isDetectionActive = false,
  }: Props = $props();

  // Performance monitoring
  const detectionService = getPositionDetector();
  let fps = $state(0);
  let avgFrameTime = $state(0);
  let videoResolution = $state("N/A");
  let perfInterval: number | null = null;
  let showStats = $state(false);

  onMount(() => {

    // Update performance stats every 500ms
    perfInterval = window.setInterval(() => {
      if (detectionService?.getPerformanceStats) {
        const stats = detectionService.getPerformanceStats();
        fps = stats.fps;
        avgFrameTime = stats.avgFrameTime;
        videoResolution = stats.videoResolution;
      }
    }, 500);
  });

  onDestroy(() => {
    if (perfInterval !== null) {
      clearInterval(perfInterval);
    }
  });
</script>

<div class="status-panel">
  <!-- Status indicators -->
  <div class="status-indicators">
    <button
      class="status-item"
      class:active={isCameraReady}
      onclick={() => (showStats = !showStats)}
      aria-label="{t('train_status_camera')}: {isCameraReady ? t('train_status_ready') : t('train_status_not_ready')}"
    >
      <div class="status-dot"></div>
      <span class="status-label">{t('train_status_camera')}</span>
    </button>
    <button
      class="status-item"
      class:active={isDetectionReady}
      onclick={() => (showStats = !showStats)}
      aria-label="{t('train_status_tracking')}: {isDetectionReady ? t('train_status_ready') : t('train_status_not_ready')}"
    >
      <div class="status-dot"></div>
      <span class="status-label">{t('train_status_tracking')}</span>
    </button>
    <button
      class="status-item"
      class:active={isDetectionActive}
      onclick={() => (showStats = !showStats)}
      aria-label="{t('train_status_active')}: {isDetectionActive ? t('train_status_active') : t('train_status_inactive')}"
    >
      <div class="status-dot"></div>
      <span class="status-label">{t('train_status_active')}</span>
    </button>
  </div>

  <!-- Performance stats (collapsible) -->
  {#if showStats && isDetectionActive && fps > 0}
    <div class="performance-stats">
      <div class="stat-row">
        <span class="stat-label">{t('train_status_fps')}:</span>
        <span class="stat-value" class:warn={fps < 20} class:error={fps < 10}
          >{fps}</span
        >
      </div>
      <div class="stat-row">
        <span class="stat-label">{t('train_status_frame')}:</span>
        <span
          class="stat-value"
          class:warn={avgFrameTime > 50}
          class:error={avgFrameTime > 100}>{avgFrameTime.toFixed(1)}ms</span
        >
      </div>
      <div class="stat-row">
        <span class="stat-label">{t('train_status_resolution')}:</span>
        <span class="stat-value">{videoResolution}</span>
      </div>
    </div>
  {/if}
</div>

<style>
  /* ============================================
	   STATUS PANEL - 2026 Design, No Glassmorphism
	   ============================================ */
  .status-panel {
    display: flex;
    flex-direction: column;
    gap: var(--space-2026-sm, 12px);
    padding: var(--space-2026-sm, 12px);
    background: var(--theme-panel-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: var(--radius-2026-md, 14px);
    box-shadow: var(--shadow-2026-md, 0 2px 8px rgba(0, 0, 0, 0.08));
    transition:
      background var(--duration-2026-fast, 150ms)
        var(--ease-2026-out, cubic-bezier(0.33, 1, 0.68, 1)),
      border-color var(--duration-2026-fast, 150ms)
        var(--ease-2026-out, cubic-bezier(0.33, 1, 0.68, 1));
  }

  .status-indicators {
    display: flex;
    gap: var(--space-2026-xs, 6px);
    flex-wrap: wrap;
  }

  .status-item {
    display: flex;
    align-items: center;
    gap: var(--space-2026-xs, 6px);
    padding: var(--space-2026-xs, 6px) var(--space-2026-sm, 12px);
    background: transparent;
    border: none;
    border-radius: var(--radius-2026-sm, 10px);
    opacity: 0.5;
    transition:
      opacity var(--duration-2026-fast, 150ms)
        var(--ease-2026-out, cubic-bezier(0.33, 1, 0.68, 1)),
      background var(--duration-2026-fast, 150ms)
        var(--ease-2026-out, cubic-bezier(0.33, 1, 0.68, 1));
    color: color-mix(in srgb, var(--theme-text, white) 90%, transparent);
    font-size: var(--font-size-compact, 12px);
    cursor: pointer;
    user-select: none;
    -webkit-tap-highlight-color: transparent;
  }

  .status-item:hover {
    background: var(--theme-card-hover-bg);
  }

  .status-item.active {
    opacity: 1;
  }

  .status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--theme-text-dim);
    transition: all var(--duration-2026-fast, 150ms)
      var(--ease-2026-out, cubic-bezier(0.33, 1, 0.68, 1));
    flex-shrink: 0;
  }

  .status-item.active .status-dot {
    background: var(--semantic-success, var(--semantic-success));
    box-shadow: 0 0 8px
      color-mix(
        in srgb,
        var(--semantic-success, var(--semantic-success)) 60%,
        transparent
      );
  }

  .status-label {
    white-space: nowrap;
    font-weight: 500;
  }

  .performance-stats {
    display: flex;
    flex-direction: column;
    gap: var(--space-2026-xs, 6px);
    padding: var(--space-2026-sm, 12px);
    background: rgba(0, 0, 0, 0.2);
    border-radius: var(--radius-2026-sm, 10px);
    font-family: "Courier New", monospace;
    font-size: var(--font-size-compact, 12px);
    line-height: 1.3;
  }

  .stat-row {
    display: flex;
    align-items: center;
    gap: var(--space-2026-xs, 6px);
    justify-content: space-between;
  }

  .stat-label {
    color: var(--theme-text-dim, var(--theme-text-dim));
    font-weight: 500;
  }

  .stat-value {
    color: color-mix(in srgb, var(--theme-text, white) 95%, transparent);
    font-weight: 600;
    min-width: 4ch;
    text-align: right;
  }

  .stat-value.warn {
    color: var(--semantic-warning, var(--semantic-warning));
  }

  .stat-value.error {
    color: var(--semantic-error, var(--semantic-error));
  }

  /* ============================================
	   MOBILE (< 768px)
	   ============================================ */
  @media (max-width: 767px) {
    .status-panel {
      padding: var(--space-2026-xs, 6px);
    }

    .status-label {
      display: none;
    }

    .status-item {
      padding: var(--space-2026-xs, 6px);
      min-width: 32px;
      min-height: 32px;
      justify-content: center;
    }

    .performance-stats {
      display: none;
    }
  }

  /* ============================================
	   DESKTOP (≥ 1024px) - EXPANDED BY DEFAULT
	   ============================================ */
  @media (min-width: 1024px) {
    .status-panel {
      padding: var(--space-2026-md, 20px);
    }

    .status-indicators {
      gap: var(--space-2026-sm, 12px);
    }

    .status-item {
      padding: var(--space-2026-sm, 12px) var(--space-2026-md, 20px);
      font-size: 0.8125rem;
    }

    .status-dot {
      width: 8px;
      height: 8px;
    }

    /* Auto-expand stats on desktop */
    .performance-stats {
      display: flex;
      font-size: 0.75rem;
      padding: var(--space-2026-md, 20px);
      gap: var(--space-2026-sm, 12px);
    }
  }
</style>
