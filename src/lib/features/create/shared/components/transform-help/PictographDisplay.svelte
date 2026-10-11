<!--
  PictographDisplay.svelte

  Shows the current pictograph with a shuffle button
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import ProgressRing from "#lib/shared/components/loading/ProgressRing.svelte";
  import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
  import PictographContainer from "#lib/shared/pictograph/shared/components/PictographContainer.svelte";

  interface Props {
    pictograph: PictographData | null;
    isLoading?: boolean;
    onShuffle?: () => void;
  }

  let { pictograph, isLoading = false, onShuffle }: Props = $props();
</script>

<div class="pictograph-container">
  <div class="pictograph-display">
    {#if isLoading}
      <div class="loading-state">
        <ProgressRing percent={-1} size={32} strokeWidth={3} />
      </div>
    {:else if pictograph}
      <PictographContainer pictographData={pictograph} />
    {:else}
      <div class="empty-state">
        <i class="fas fa-image" aria-hidden="true"></i>
      </div>
    {/if}
  </div>

  <button
    class="shuffle-btn"
    onclick={onShuffle}
    disabled={isLoading}
    aria-label={t("create_ui_get_a_new_random_pictograph")}
    type="button"
  >
    <i class="fas fa-shuffle" aria-hidden="true"></i>
    <span>{t("create_ui_new_example")}</span>
  </button>
</div>

<style>
  .pictograph-container {
    display: flex;
    flex-direction: column;
    gap: 12px;
    align-items: center;
    flex-shrink: 0;
    width: 100%;
  }

  .pictograph-display {
    width: 100%;
    aspect-ratio: 1;
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid var(--theme-stroke);
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--theme-text-dim);
    overflow: hidden;
  }

  .loading-state,
  .empty-state {
    font-size: var(--font-size-2xl);
  }

  .shuffle-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    background: rgba(139, 92, 246, 0.15);
    border: 1px solid rgba(139, 92, 246, 0.3);
    border-radius: 8px;
    color: rgba(167, 139, 250, 1);
    font-size: var(--font-size-sm);
    font-weight: 500;
    cursor: pointer;
    transition: all var(--duration-normal);
    white-space: nowrap;
  }

  .shuffle-btn:hover:not(:disabled) {
    background: rgba(139, 92, 246, 0.25);
    border-color: rgba(139, 92, 246, 0.5);
  }

  .shuffle-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Mobile: smaller display */
  @media (max-width: 767px) {
    .pictograph-display {
      max-width: 150px;
    }
  }

  /* Desktop: Use full width from parent */
  @media (min-width: 768px) {
    .pictograph-container {
      flex-shrink: 0;
      width: 100%;
      max-width: 280px;
    }

    .pictograph-display {
      width: 100%;
    }
  }

  /* Accessibility: Respect user's motion preferences (WCAG AAA) */
  @media (prefers-reduced-motion: reduce) {
    * {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
    }
  }
</style>
