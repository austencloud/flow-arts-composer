<!--
	CompositionDetailActions.svelte

	Horizontal action bar at the bottom of the detail view.
	Play, Edit, Favorite, Duplicate, Delete actions with icon + label.
-->
<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import type { CompositionBrowseItem } from "../state/composition-browse-state.svelte";

  const {
    composition,
    onPlay,
    onEdit,
    onFavorite,
    onDuplicate,
    onDelete,
  }: {
    composition: CompositionBrowseItem;
    onPlay: () => void;
    onEdit: () => void;
    onFavorite: () => void;
    onDuplicate: () => void;
    onDelete: () => void;
  } = $props();
</script>

<div class="actions-bar">
  <button type="button" class="action-btn primary" onclick={onPlay}>
    <i class="fas fa-play" aria-hidden="true"></i>
    <span>{t("learn_play")}</span>
  </button>

  <button type="button" class="action-btn" onclick={onEdit}>
    <i class="fas fa-pen" aria-hidden="true"></i>
    <span>{t("viewer_edit")}</span>
  </button>

  <button
    type="button"
    class="action-btn"
    class:favorited={composition.isFavorite}
    onclick={onFavorite}
  >
    <i class="fas fa-heart" aria-hidden="true"></i>
    <span>{composition.isFavorite ? "Unfave" : "Fave"}</span>
  </button>

  <button type="button" class="action-btn" onclick={onDuplicate}>
    <i class="fas fa-copy" aria-hidden="true"></i>
    <span>{t("browse_copy")}</span>
  </button>

  <button type="button" class="action-btn danger" onclick={onDelete}>
    <i class="fas fa-trash" aria-hidden="true"></i>
    <span>{t("action_delete")}</span>
  </button>
</div>

<style>
  .actions-bar {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 16px;
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
  }

  .action-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 10px 16px;
    min-width: var(--min-touch-target);
    min-height: var(--min-touch-target);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    border-radius: 10px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    cursor: pointer;
    transition:
      color var(--duration-fast, 100ms) ease,
      background var(--duration-fast, 100ms) ease,
      border-color var(--duration-fast, 100ms) ease;
  }

  .action-btn i {
    font-size: var(--font-size-min, 14px);
  }

  .action-btn span {
    font-size: var(--font-size-compact, 12px);
    font-weight: 500;
  }

  .action-btn:hover {
    color: var(--theme-text, #fff);
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
  }

  .action-btn:active {
    transform: scale(var(--active-scale, 0.98));
  }

  .action-btn:focus-visible {
    outline: 2px solid var(--theme-accent, #6366f1);
    outline-offset: 2px;
  }

  /* Primary (Play) */
  .action-btn.primary {
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--theme-accent, #6366f1) 20%, transparent),
      color-mix(in srgb, var(--theme-accent, #6366f1) 10%, transparent)
    );
    border-color: color-mix(
      in srgb,
      var(--theme-accent, #6366f1) 40%,
      transparent
    );
    color: var(--theme-text, #fff);
  }

  .action-btn.primary:hover {
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--theme-accent, #6366f1) 30%, transparent),
      color-mix(in srgb, var(--theme-accent, #6366f1) 15%, transparent)
    );
  }

  /* Favorited */
  .action-btn.favorited {
    color: var(--semantic-error, #ef4444);
  }

  /* Danger (Delete) */
  .action-btn.danger:hover {
    color: var(--semantic-error, #ef4444);
    border-color: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 30%,
      transparent
    );
    background: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 8%,
      transparent
    );
  }

  @media (prefers-reduced-motion: reduce) {
    .action-btn:active {
      transform: none;
    }
  }
</style>
