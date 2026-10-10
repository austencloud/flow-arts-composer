<!--
SelectionToolbar.svelte - Bottom toolbar for multi-select mode

Shows:
- Selection counter (e.g., "5 steps selected")
- Edit button (opens batch edit panel)
- Cancel button (exits multi-select mode)
- Select All button (optional)
-->
<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import { fly } from "svelte/transition";
  import { backOut } from "svelte/easing";

  // Props
  const {
    selectionCount = 0,
    onEdit,
    onCancel,
    onSelectAll,
    totalSteps = 0,
  } = $props<{
    selectionCount: number;
    onEdit: () => void;
    onCancel: () => void;
    onSelectAll?: () => void;
    totalSteps?: number;
  }>();

  const canEdit = $derived(selectionCount > 0);
  const selectionText = $derived(
    selectionCount === 1
      ? "1 step selected"
      : `${selectionCount} steps selected`
  );
</script>

<div
  class="selection-toolbar"
  transition:fly={{ y: 100, duration: 300, easing: backOut }}
  role="toolbar"
  aria-label={t("create_ui_selection_toolbar")}
>
  <!-- Cancel button -->
  <button
    class="toolbar-button cancel-button"
    onclick={onCancel}
    type="button"
    aria-label={t("create_ui_cancel_selection")}
  >
    <i class="fas fa-times" aria-hidden="true"></i>
  </button>

  <!-- Selection counter -->
  <div class="selection-counter">
    {selectionText}
  </div>

  <!-- Actions -->
  <div class="toolbar-actions">
    {#if onSelectAll && selectionCount < totalSteps}
      <button
        class="toolbar-button secondary-button"
        onclick={onSelectAll}
        type="button"
      >
        {t("create_review_select_all")}
      </button>
    {/if}

    <button
      class="toolbar-button edit-button"
      onclick={onEdit}
      disabled={!canEdit}
      type="button"
    >
      <i class="fas fa-edit" aria-hidden="true"></i>
      {t("create_review_edit")}
    </button>
  </div>
</div>

<style>
  .selection-toolbar {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    z-index: var(--z-tooltip);

    display: flex;
    align-items: center;
    gap: var(--spacing-md);
    padding: var(--spacing-md) var(--spacing-lg);

    background: hsl(var(--background));
    border-top: 1px solid hsl(var(--border));
  }

  .toolbar-button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-sm);
    padding: var(--spacing-sm) var(--spacing-md);
    border: none;
    border-radius: 8px;
    font-size: var(--font-size-md);
    font-weight: 500;
    cursor: pointer;
    transition: all var(--duration-normal) ease;
    min-height: var(--min-touch-target); /* Touch target */
  }

  .cancel-button {
    background: transparent;
    color: hsl(var(--muted-foreground));
    padding: var(--spacing-sm);
    min-width: var(--min-touch-target);
  }

  .cancel-button:hover {
    background: hsl(var(--muted) / 0.5);
    color: hsl(var(--foreground));
  }

  .selection-counter {
    flex: 1;
    font-size: var(--font-size-md);
    font-weight: 600;
    color: hsl(var(--foreground));
    text-align: center;
  }

  .toolbar-actions {
    display: flex;
    gap: var(--spacing-sm);
  }

  .secondary-button {
    background: hsl(var(--muted));
    color: hsl(var(--foreground));
  }

  .secondary-button:hover {
    background: hsl(var(--muted) / 0.8);
  }

  .edit-button {
    background: hsl(var(--primary));
    color: hsl(var(--primary-foreground));
  }

  .edit-button:hover:not(:disabled) {
    background: hsl(var(--primary) / 0.9);
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(var(--primary-rgb), 0.4);
  }

  .edit-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .edit-button:active:not(:disabled) {
    transform: translateY(0);
  }

  .toolbar-button:focus-visible {
    outline: 2px solid var(--theme-accent, rgba(139, 92, 246, 0.8));
    outline-offset: 2px;
  }

  /* Accessibility: Respect user's motion preferences */
  @media (prefers-reduced-motion: reduce) {
    .toolbar-button {
      transition: none;
    }

    .edit-button:hover:not(:disabled) {
      transform: none;
    }
  }

  /* Mobile adjustments */
  @media (max-width: 768px) {
    .selection-toolbar {
      padding: var(--spacing-sm) var(--spacing-md);
    }

    .toolbar-button {
      font-size: var(--font-size-sm);
      padding: var(--spacing-xs) var(--spacing-sm);
    }

    .selection-counter {
      font-size: var(--font-size-sm);
    }
  }
</style>
