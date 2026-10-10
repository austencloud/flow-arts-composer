<!--
  PerformanceFeedbackPanel.svelte - Performance feedback panel for Practice tab

  Shows current score and combo during training sessions.
  Displays last hit feedback (hit/miss) with points.
  Hidden on mobile (shown in camera overlay), visible on desktop in top bar.
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";

  interface Props {
    currentScore?: number;
    currentCombo?: number;
    lastHitResult?: boolean | null;
    lastHitPoints?: number;
    isPerforming?: boolean;
  }

  let {
    currentScore = 0,
    currentCombo = 0,
    lastHitResult = null,
    lastHitPoints = 0,
    isPerforming = false,
  }: Props = $props();
</script>

{#if isPerforming}
  <div class="performance-feedback-panel">
    <!-- Score Display -->
    <div class="metric">
      <span class="metric-label">{t('train_score_label')}</span>
      <span class="metric-value score">{currentScore.toLocaleString()}</span>
    </div>

    <!-- Combo Display (only when active) -->
    {#if currentCombo > 0}
      <div class="metric combo-metric">
        <span class="metric-label">{t('train_combo_label')}</span>
        <span class="metric-value combo">{currentCombo}x</span>
      </div>
    {/if}

    <!-- Last Hit Feedback -->
    {#if lastHitResult !== null}
      <div
        class="hit-feedback"
        class:hit={lastHitResult}
        class:miss={!lastHitResult}
      >
        {lastHitResult ? `+${lastHitPoints}` : t('train_miss')}
      </div>
    {/if}
  </div>
{:else}
  <div class="performance-feedback-panel empty">
    <span class="empty-text">{t('train_ready')}</span>
  </div>
{/if}

<style>
  /* ============================================
	   PERFORMANCE FEEDBACK PANEL - 2026 Design
	   Hidden on mobile, visible on desktop top bar
	   ============================================ */
  .performance-feedback-panel {
    display: none; /* Hidden on mobile (shown in camera overlay instead) */
    align-items: center;
    gap: var(--space-2026-lg, 28px);
    padding: var(--space-2026-md, 20px) var(--space-2026-lg, 28px);
    background: var(--theme-panel-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: var(--radius-2026-md, 14px);
    box-shadow: var(--shadow-2026-md, 0 2px 8px rgba(0, 0, 0, 0.08));
    min-height: 72px;
  }

  .performance-feedback-panel.empty {
    justify-content: center;
  }

  .empty-text {
    font-size: 0.875rem;
    color: color-mix(in srgb, var(--theme-text, white) 40%, transparent);
    font-weight: 500;
  }

  .metric {
    display: flex;
    flex-direction: column;
    gap: var(--space-2026-xs, 6px);
  }

  .metric-label {
    font-size: 0.75rem;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--theme-text-dim, var(--theme-text-dim));
  }

  .metric-value {
    font-size: 1.5rem;
    font-weight: 700;
    line-height: 1;
  }

  .metric-value.score {
    color: var(--semantic-info, var(--semantic-info));
    text-shadow: 0 0 20px
      color-mix(
        in srgb,
        var(--semantic-info, var(--semantic-info)) 30%,
        transparent
      );
  }

  .metric-value.combo {
    color: var(--semantic-warning, var(--semantic-warning));
    text-shadow: 0 0 20px
      color-mix(
        in srgb,
        var(--semantic-warning, var(--semantic-warning)) 30%,
        transparent
      );
  }

  .combo-metric {
    padding: var(--space-2026-sm, 12px) var(--space-2026-md, 20px);
    background: linear-gradient(
      135deg,
      color-mix(
          in srgb,
          var(--semantic-warning, var(--semantic-warning)) 12%,
          transparent
        )
        0%,
      color-mix(
          in srgb,
          var(--semantic-warning, var(--semantic-warning)) 8%,
          transparent
        )
        100%
    );
    border-radius: var(--radius-2026-sm, 10px);
    border: 1px solid
      color-mix(
        in srgb,
        var(--semantic-warning, var(--semantic-warning)) 20%,
        transparent
      );
  }

  .hit-feedback {
    padding: var(--space-2026-sm, 12px) var(--space-2026-md, 20px);
    border-radius: var(--radius-2026-sm, 10px);
    font-weight: 700;
    font-size: 1.125rem;
    animation: fadeInOut 0.8s ease-out forwards;
    border: 1px solid;
  }

  .hit-feedback.hit {
    background: linear-gradient(
      135deg,
      color-mix(
          in srgb,
          var(--semantic-success, var(--semantic-success)) 15%,
          transparent
        )
        0%,
      color-mix(
          in srgb,
          var(--semantic-success, var(--semantic-success)) 10%,
          transparent
        )
        100%
    );
    border-color: color-mix(
      in srgb,
      var(--semantic-success, var(--semantic-success)) 30%,
      transparent
    );
    color: var(--semantic-success);
    text-shadow: 0 0 20px
      color-mix(
        in srgb,
        var(--semantic-success, var(--semantic-success)) 40%,
        transparent
      );
  }

  .hit-feedback.miss {
    background: linear-gradient(
      135deg,
      color-mix(
          in srgb,
          var(--semantic-error, var(--semantic-error)) 15%,
          transparent
        )
        0%,
      color-mix(
          in srgb,
          var(--semantic-error, var(--semantic-error)) 10%,
          transparent
        )
        100%
    );
    border-color: color-mix(
      in srgb,
      var(--semantic-error, var(--semantic-error)) 30%,
      transparent
    );
    color: var(--semantic-error, var(--semantic-error));
    text-shadow: 0 0 20px
      color-mix(
        in srgb,
        var(--semantic-error, var(--semantic-error)) 40%,
        transparent
      );
  }

  @keyframes fadeInOut {
    0% {
      opacity: 0;
      transform: scale(0.9);
    }
    15% {
      opacity: 1;
      transform: scale(1.05);
    }
    75% {
      opacity: 1;
      transform: scale(1);
    }
    100% {
      opacity: 0;
      transform: scale(0.95);
    }
  }

  /* ============================================
	   DESKTOP (≥ 1024px) - SHOW IN TOP BAR
	   ============================================ */
  @media (min-width: 1024px) {
    .performance-feedback-panel {
      display: flex;
    }
  }

  /* Accessibility: Respect user's motion preferences (WCAG AAA) */
  @media (prefers-reduced-motion: reduce) {
    .hit-feedback {
      animation: none;
    }
  }
</style>
