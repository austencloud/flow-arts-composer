<!--
ProgressOverlay.svelte

Progress indicators for AnimatorCanvas.
Shows pre-render progress and perfect playback badge.
-->
<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import type { PreRenderProgress } from "$lib/shared/animation-engine/services/sequence-frame-pre-renderer";
  import ProgressRing from "$lib/shared/components/loading/ProgressRing.svelte";

  let {
    isPreRendering = false,
    preRenderProgress = null,
    preRenderedFramesReady = false,
  }: {
    isPreRendering?: boolean;
    preRenderProgress?: PreRenderProgress | null;
    preRenderedFramesReady?: boolean;
  } = $props();
</script>

<!-- Pre-render progress indicator -->
{#if isPreRendering && preRenderProgress}
  <div
    class="pre-render-badge"
    role="status"
    aria-live="polite"
    aria-busy="true"
  >
    <div class="badge-content">
      <ProgressRing percent={-1} size={24} strokeWidth={2} />
      <span>{t("animation_optimizing")} {Math.round(preRenderProgress.percent)}%</span>
    </div>
    <div class="progress-bar">
      <div
        class="progress-fill"
        style="width: {preRenderProgress.percent}%"
      ></div>
    </div>
  </div>
{/if}

<!-- Perfect playback indicator (brief flash when ready) -->
{#if preRenderedFramesReady}
  <div class="perfect-mode-badge">✨ {t("animation_perfect_playback")}</div>
{/if}

<style>
  .pre-render-badge {
    position: absolute;
    top: 12px;
    right: 12px;
    background: var(--theme-panel-bg, rgba(0, 0, 0, 0.9));
    color: white;
    padding: 8px 12px;
    border-radius: 8px;
    font-size: var(--font-size-compact); /* Supplementary status text */
    font-weight: 500;
    z-index: 10;
    box-shadow: 0 2px 8px var(--theme-shadow);
    min-width: 140px;
  }

  .badge-content {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
  }

  .progress-bar {
    width: 100%;
    height: 3px;
    background: var(--theme-stroke);
    border-radius: 2px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #4ade80, var(--semantic-success));
    transition: width var(--duration-emphasis) ease;
  }

  .perfect-mode-badge {
    position: absolute;
    top: 12px;
    right: 12px;
    background: linear-gradient(135deg, var(--semantic-success), #16a34a);
    color: white;
    padding: 6px 12px;
    border-radius: 6px;
    font-size: var(--font-size-compact); /* Supplementary badge text */
    font-weight: 600;
    z-index: 10;
    box-shadow: 0 2px 8px color-mix(in srgb, var(--semantic-success) 40%, transparent);
    animation: fadeInOut 3s ease forwards;
  }

  @keyframes fadeInOut {
    0% {
      opacity: 0;
      transform: translateY(-10px);
    }
    10% {
      opacity: 1;
      transform: translateY(0);
    }
    90% {
      opacity: 1;
      transform: translateY(0);
    }
    100% {
      opacity: 0;
      transform: translateY(-10px);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .perfect-mode-badge {
      animation: none;
    }
  }
</style>
