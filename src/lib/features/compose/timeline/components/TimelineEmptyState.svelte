<script lang="ts">
  /**
   * TimelineEmptyState - Guidance when timeline has no clips
   *
   * Shows clear instructions for how to add sequences to the timeline.
   * Small, focused component (~60 lines).
   */

  import { t } from "$lib/shared/i18n/i18n.svelte";

  interface Props {
    onBrowseLibrary?: () => void;
  }

  let { onBrowseLibrary }: Props = $props();
</script>

<!-- Stop propagation to prevent clicks triggering playhead movement -->
<div
  class="empty-state"
  onclick={(e) => e.stopPropagation()}
  role="presentation"
>
  <div class="empty-icon">
    <i class="fa-solid fa-film" aria-hidden="true"></i>
  </div>

  <h3 class="empty-title">{t("empty_no_sequences_timeline")}</h3>

  <p class="empty-description">
    Add sequences from your library to start composing your animation.
  </p>

  <div class="empty-actions">
    {#if onBrowseLibrary}
      <button
        class="action-btn primary"
        onclick={(e) => {
          e.stopPropagation();
          onBrowseLibrary();
        }}
      >
        <i class="fa-solid fa-folder-open" aria-hidden="true"></i>
        Browse Library
      </button>
    {/if}
  </div>

  <div class="empty-hints">
    <div class="hint">
      <i class="fa-solid fa-lightbulb" aria-hidden="true"></i>
      <span>Drag sequences from the Library to add them here</span>
    </div>
    <div class="hint">
      <i class="fa-solid fa-keyboard" aria-hidden="true"></i>
      <span>Press <kbd>Space</kbd> to play/pause</span>
    </div>
  </div>
</div>

<style>
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 40px 20px;
    text-align: center;
    min-height: 200px;
  }

  .empty-icon {
    width: 64px;
    height: 64px;
    border-radius: 50%;
    background: var(--theme-card-bg, var(--theme-card-bg));
    border: 1px solid var(--theme-stroke);
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 16px;
  }

  .empty-icon i {
    font-size: var(--font-size-2xl);
    color: var(--theme-text-dim);
  }

  .empty-title {
    margin: 0 0 8px 0;
    font-size: var(--font-size-min);
    font-weight: 600;
    color: var(--theme-text, var(--theme-text));
  }

  .empty-description {
    margin: 0 0 20px 0;
    font-size: var(--font-size-compact);
    color: var(--theme-text-dim, var(--theme-text-dim));
    max-width: 280px;
    line-height: 1.5;
  }

  .empty-actions {
    display: flex;
    gap: 8px;
    margin-bottom: 24px;
  }

  .action-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    min-height: var(--min-touch-target, 48px); /* WCAG AAA touch target */
    padding: 10px 18px;
    border-radius: 8px;
    border: 1px solid var(--theme-accent);
    font-size: var(--font-size-compact);
    font-weight: 600;
    cursor: pointer;
    transition: all var(--duration-normal) ease;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
  }

  .action-btn:focus-visible {
    outline: 2px solid var(--theme-accent, rgba(139, 92, 246, 0.8));
    outline-offset: 2px;
  }

  .action-btn.primary {
    background: var(--theme-accent);
    color: white;
  }

  .action-btn.primary:hover {
    background: var(--theme-accent-strong);
    border-color: var(--theme-accent-strong);
    transform: translateY(-2px);
    box-shadow: none;
  }

  .action-btn.primary:active {
    transform: translateY(0);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.15);
  }

  .empty-hints {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .hint {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: var(--font-size-compact);
    color: var(--theme-text-dim, var(--theme-text-dim));
  }

  .hint i {
    font-size: var(--font-size-compact);
    opacity: 0.7;
  }

  .hint kbd {
    padding: 3px 7px;
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 4px;
    font-family: monospace;
    font-size: var(--font-size-compact);
    font-weight: 600;
  }

  /* Accessibility: Respect user's motion preferences */
  @media (prefers-reduced-motion: reduce) {
    .action-btn {
      transition: none;
    }

    .action-btn.primary:hover {
      transform: none;
    }
  }
</style>
