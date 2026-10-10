<!--
  ResultsScreen.svelte - Post-performance results display

  Shows performance statistics, accuracy, combo stats, and final score.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import TKAWordGlyph from "#lib/shared/choreo-card/components/TKAWordGlyph.svelte";

  interface Props {
    totalSteps: number;
    hits: number;
    misses: number;
    maxCombo: number;
    finalScore: number;
    sequenceName?: string;
    onPlayAgain?: () => void;
    onExit?: () => void;
  }

  let {
    totalSteps = 0,
    hits = 0,
    misses = 0,
    maxCombo = 0,
    finalScore = 0,
    sequenceName = "Sequence",
    onPlayAgain,
    onExit,
  }: Props = $props();

  // Calculate stats
  const accuracy = $derived(totalSteps > 0 ? (hits / totalSteps) * 100 : 0);
  const grade = $derived(
    accuracy >= 95
      ? "S"
      : accuracy >= 85
        ? "A"
        : accuracy >= 75
          ? "B"
          : accuracy >= 65
            ? "C"
            : "D"
  );
  const gradeColor = $derived(
    grade === "S"
      ? "#eab308"
      : grade === "A"
        ? "var(--semantic-success)"
        : grade === "B"
          ? "var(--semantic-info)"
          : grade === "C"
            ? "var(--semantic-warning)"
            : "var(--semantic-error)"
  );

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Escape" && onExit) {
      event.preventDefault();
      onExit();
    }
  }

  onMount(() => {
    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  });
</script>

<div class="results-screen">
  <div class="results-container">
    <!-- Scrollable content area -->
    <div class="scrollable-content">
      <!-- Header -->
      <div class="results-header">
        <h1>{t("train_training_complete")}</h1>
        {#if sequenceName}
          <p class="sequence-name"><TKAWordGlyph word={sequenceName} height={16} darkMode /></p>
        {/if}
      </div>

      <!-- Grade Display -->
      <div class="grade-display" style="--grade-color: {gradeColor}">
        <div class="grade-circle">
          <span class="grade-letter">{grade}</span>
        </div>
        <div class="accuracy-text">
          {t("train_accuracy_percent", { value: accuracy.toFixed(1) })}
        </div>
      </div>

      <!-- Stats Grid -->
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-icon score">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path
                d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
              />
            </svg>
          </div>
          <div class="stat-value">{finalScore.toLocaleString()}</div>
          <div class="stat-label">{t("train_score")}</div>
        </div>

        <div class="stat-card">
          <div class="stat-icon hits">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M20 6L9 17l-5-5" />
            </svg>
          </div>
          <div class="stat-value">{hits}</div>
          <div class="stat-label">{t("train_hits")}</div>
        </div>

        <div class="stat-card">
          <div class="stat-icon misses">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </div>
          <div class="stat-value">{misses}</div>
          <div class="stat-label">{t("train_misses")}</div>
        </div>

        <div class="stat-card">
          <div class="stat-icon combo">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
            </svg>
          </div>
          <div class="stat-value">{maxCombo}x</div>
          <div class="stat-label">{t("train_max_combo")}</div>
        </div>
      </div>

      <!-- Detailed Stats -->
      <div class="detailed-stats">
        <div class="detail-row">
          <span class="detail-label">{t("train_total_beats")}</span>
          <span class="detail-value">{totalSteps}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">{t("train_hit_rate")}</span>
          <span class="detail-value">{accuracy.toFixed(1)}%</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">{t("train_perfect_combo")}</span>
          <span class="detail-value"
            >{maxCombo === totalSteps ? t("train_perfect_yes") + " 🎉" : t("common_no")}</span
          >
        </div>
      </div>
    </div>

    <!-- Action buttons - always visible at bottom -->
    <div class="action-buttons">
      {#if onPlayAgain}
        <button class="primary-button" onclick={onPlayAgain}>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M1 4v6h6M23 20v-6h-6" />
            <path
              d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"
            />
          </svg>
          {t("train_play_again")}
        </button>
      {/if}
      {#if onExit}
        <button class="secondary-button" onclick={onExit}>{t("train_exit")}</button>
      {/if}
    </div>
  </div>
</div>

<style>
  .results-screen {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.98);
    z-index: 100;
    animation: fadeIn var(--duration-dramatic) ease-out;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  .results-container {
    max-width: 500px;
    width: 90%;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    animation: slideUp 0.5s ease-out;
  }

  /* Scrollable content area */
  .scrollable-content {
    flex: 1;
    overflow-y: auto;
    padding: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    min-height: 0; /* Allow shrinking in flexbox */
  }

  @media (max-width: 768px) {
    .results-container {
      width: 100%;
      max-height: 100dvh; /* Use dynamic viewport height on mobile */
    }

    .scrollable-content {
      padding: 1rem;
      gap: 0.75rem;
    }
  }

  @keyframes slideUp {
    from {
      transform: translateY(40px);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }

  .results-header {
    text-align: center;
  }

  .results-header h1 {
    font-size: 2.5rem;
    font-weight: 800;
    margin: 0;
    background: linear-gradient(
      135deg,
      var(--semantic-info, var(--semantic-info)),
      var(--theme-accent, var(--theme-accent-strong))
    );
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  @media (max-width: 768px) {
    .results-header h1 {
      font-size: 1.75rem;
    }
  }

  .sequence-name {
    font-size: 1.125rem;
    opacity: 0.7;
    margin: 0.5rem 0 0 0;
  }

  @media (max-width: 768px) {
    .sequence-name {
      font-size: 1rem;
    }
  }

  .grade-display {
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: center;
    gap: 1.5rem;
    padding: 1rem;
    background: var(--theme-card-bg, var(--theme-card-bg));
    border: 2px solid var(--theme-stroke, var(--theme-stroke));
    border-radius: 12px;
  }

  .grade-circle {
    width: 80px;
    height: 80px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: radial-gradient(
      circle,
      var(--grade-color, var(--semantic-info)) 0%,
      transparent 70%
    );
    border: 3px solid var(--grade-color, var(--semantic-info));
    box-shadow: 0 0 20px var(--grade-color, var(--semantic-info));
    flex-shrink: 0;
  }

  @media (max-width: 768px) {
    .grade-circle {
      width: 64px;
      height: 64px;
      border-width: 2px;
    }
  }

  @keyframes pulseGrade {
    0%,
    100% {
      transform: scale(1);
      box-shadow: 0 0 40px var(--grade-color, var(--semantic-info));
    }
    50% {
      transform: scale(1.05);
      box-shadow: 0 0 60px var(--grade-color, var(--semantic-info));
    }
  }

  .grade-letter {
    font-size: 2.5rem;
    font-weight: 900;
    color: var(--grade-color, var(--semantic-info));
    text-shadow: 0 0 10px var(--grade-color, var(--semantic-info));
  }

  @media (max-width: 768px) {
    .grade-letter {
      font-size: 2rem;
    }
  }

  .accuracy-text {
    font-size: 1.25rem;
    font-weight: 700;
    color: var(--theme-text, white);
  }

  @media (max-width: 768px) {
    .accuracy-text {
      font-size: 1.125rem;
    }
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.5rem;
  }

  @media (max-width: 600px) {
    .stats-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  .stat-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
    padding: 0.75rem 0.5rem;
    background: var(--theme-card-bg, var(--theme-card-bg));
    border: 1px solid var(--theme-stroke, var(--theme-stroke));
    border-radius: 8px;
    transition: all var(--duration-emphasis);
  }

  .stat-card:hover {
    background: var(--theme-card-hover-bg);
  }

  .stat-icon {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    padding: 5px;
  }

  .stat-icon.score {
    background: color-mix(in srgb, var(--semantic-warning) 20%, transparent);
    color: var(--semantic-warning);
  }

  .stat-icon.hits {
    background: color-mix(
      in srgb,
      var(--semantic-success, var(--semantic-success)) 20%,
      transparent
    );
    color: var(--semantic-success, var(--semantic-success));
  }

  .stat-icon.misses {
    background: color-mix(
      in srgb,
      var(--semantic-error, var(--semantic-error)) 20%,
      transparent
    );
    color: var(--semantic-error, var(--semantic-error));
  }

  .stat-icon.combo {
    background: color-mix(
      in srgb,
      var(--semantic-info, var(--semantic-info)) 20%,
      transparent
    );
    color: var(--semantic-info, var(--semantic-info));
  }

  .stat-icon svg {
    width: 100%;
    height: 100%;
  }

  .stat-value {
    font-size: 1.25rem;
    font-weight: 700;
    color: var(--theme-text, white);
    font-variant-numeric: tabular-nums;
  }

  .stat-label {
    font-size: var(--font-size-compact, 12px);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--theme-text-dim, var(--theme-text-dim));
    font-weight: 600;
  }

  .detailed-stats {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding: 0.75rem 1rem;
    background: var(--theme-card-bg, var(--theme-card-bg));
    border: 1px solid var(--theme-stroke, var(--theme-stroke));
    border-radius: 8px;
  }

  .detail-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.25rem 0;
    border-bottom: 1px solid
      color-mix(
        in srgb,
        var(--theme-stroke, var(--theme-stroke)) 50%,
        transparent
      );
  }

  .detail-row:last-child {
    border-bottom: none;
  }

  .detail-label {
    font-size: 0.8rem;
    color: var(--theme-text-dim, var(--theme-text-dim));
  }

  .detail-value {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--theme-text, white);
    font-variant-numeric: tabular-nums;
  }

  .action-buttons {
    display: flex;
    gap: 0.75rem;
    justify-content: center;
    padding: 1rem 1.25rem;
    flex-shrink: 0; /* Never shrink - always visible */
    background: rgba(0, 0, 0, 0.8);
    border-top: 1px solid var(--theme-stroke, var(--theme-stroke));
  }

  @media (max-width: 768px) {
    .action-buttons {
      padding: 1rem;
      /* Safe area for phones with home indicator */
      padding-bottom: max(1rem, env(safe-area-inset-bottom));
    }
  }

  .primary-button,
  .secondary-button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    min-height: 44px;
    padding: 0.625rem 1.5rem;
    border-radius: 8px;
    font-size: 0.9rem;
    font-weight: 600;
    cursor: pointer;
    transition: all var(--duration-normal);
  }

  .primary-button {
    background: linear-gradient(
      135deg,
      var(--semantic-info, var(--semantic-info)),
      var(--theme-accent, var(--theme-accent-strong))
    );
    border: none;
    color: var(--theme-text, white);
  }

  .primary-button:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 20px
      color-mix(
        in srgb,
        var(--semantic-info, var(--semantic-info)) 40%,
        transparent
      );
  }

  .primary-button svg {
    width: 20px;
    height: 20px;
  }

  .secondary-button {
    background: transparent;
    border: 1px solid var(--theme-stroke-strong);
    color: var(--theme-text, white);
  }

  .secondary-button:hover {
    background: var(--theme-stroke);
  }

  /* Accessibility: Respect user's motion preferences (WCAG AAA) */
  @media (prefers-reduced-motion: reduce) {
    .results-screen {
      animation: none;
    }
    .results-container {
      animation: none;
    }
  }
</style>
