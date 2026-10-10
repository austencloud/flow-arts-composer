<!--
  Shared selection-mode toolbar for gallery surfaces.

  Replaces the gallery's ordinary toolbar without changing the band height.
  Hosts provide the primary batch action while this primitive owns count,
  select-all, clear, and exit behavior.
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  type PrimaryTone = "accent" | "danger";

  interface Props {
    selectedCount: number;
    totalCount: number;
    primaryLabel: string;
    primaryIcon: string;
    onPrimaryAction: () => void;
    primaryTone?: PrimaryTone;
    secondaryLabel?: string;
    secondaryIcon?: string;
    onSecondaryAction?: () => void;
    secondaryDisabledWhenEmpty?: boolean;
    dangerLabel?: string;
    dangerIcon?: string;
    onDangerAction?: () => void;
    onSelectAll: () => void;
    selectAllDisabled?: boolean;
    onExitSelection: () => void;
    showExitAction?: boolean;
    onClearSelection?: () => void;
    showClearAction?: boolean;
    primaryBusy?: boolean;
    actionsDisabled?: boolean;
  }

  let {
    selectedCount,
    totalCount,
    selectAllDisabled = false,
    primaryLabel,
    primaryIcon,
    onPrimaryAction,
    primaryTone = "accent",
    secondaryLabel,
    secondaryIcon,
    onSecondaryAction,
    secondaryDisabledWhenEmpty = true,
    dangerLabel,
    dangerIcon,
    onDangerAction,
    onSelectAll,
    onExitSelection,
    showExitAction = true,
    onClearSelection,
    showClearAction = true,
    primaryBusy = false,
    actionsDisabled = false,
  }: Props = $props();

  const allSelected = $derived(selectedCount === totalCount && totalCount > 0);
  const hasSecondary = $derived(
    !!secondaryLabel && !!secondaryIcon && !!onSecondaryAction
  );
</script>

<div
  class="selection-toolbar"
  class:has-secondary={hasSecondary}
  class:destructive-primary={primaryTone === "danger"}
  role="toolbar"
  aria-label={t("shared_controls_selection_actions")}
>
  <div class="toolbar-status">
    {#if showExitAction}
      <button
        type="button"
        class="toolbar-button icon-button exit-button"
        onclick={onExitSelection}
        aria-label={t("shared_controls_exit_selection")}
      >
        <i class="fas fa-times" aria-hidden="true"></i>
      </button>
    {/if}

    <span class="selected-count" aria-live="polite" aria-atomic="true">
      <span class="count-sizer" aria-hidden="true"
        >{t("shared_controls_selected_count", { count: totalCount })}</span
      >
      <span class="count-live"
        >{t("shared_controls_selected_count", { count: selectedCount })}</span
      >
    </span>
  </div>

  <div class="toolbar-actions">
    <button
      type="button"
      class="toolbar-button select-all-button"
      onclick={allSelected && onClearSelection ? onClearSelection : onSelectAll}
      disabled={selectAllDisabled}
      title={selectAllDisabled
        ? "Wait for saved sequences to finish loading"
        : undefined}
      aria-label={allSelected && onClearSelection
        ? t("shared_controls_deselect_all")
        : t("shared_controls_select_all")}
    >
      <i
        class="fas {allSelected && onClearSelection
          ? 'fa-square-minus'
          : 'fa-check-double'}"
        aria-hidden="true"
      ></i>
      <span class="button-label">
        {allSelected && onClearSelection
          ? t("shared_controls_deselect_all")
          : t("shared_controls_select_all")}
      </span>
    </button>

    {#if showClearAction && onClearSelection && !allSelected}
      <button
        type="button"
        class="toolbar-button clear-button"
        onclick={onClearSelection}
        disabled={selectedCount === 0}
        aria-label={t("shared_controls_clear_selection")}
      >
        <i class="fas fa-eraser" aria-hidden="true"></i>
        <span class="button-label">{t("shared_controls_clear")}</span>
      </button>
    {/if}

    <button
      type="button"
      class="toolbar-button primary-button"
      class:danger-primary={primaryTone === "danger"}
      onclick={onPrimaryAction}
      disabled={selectedCount === 0 || actionsDisabled}
      aria-label={primaryLabel}
      aria-busy={primaryBusy || undefined}
    >
      <i
        class="fas {primaryBusy ? 'fa-circle-notch fa-spin' : primaryIcon}"
        aria-hidden="true"
      ></i>
      <span>{primaryLabel}</span>
    </button>

    {#if hasSecondary}
      <button
        type="button"
        class="toolbar-button secondary-button"
        onclick={onSecondaryAction}
        disabled={(secondaryDisabledWhenEmpty && selectedCount === 0) ||
          actionsDisabled}
        aria-label={secondaryLabel}
      >
        <i class="fas {secondaryIcon}" aria-hidden="true"></i>
        <span>{secondaryLabel}</span>
      </button>
    {/if}

    {#if onDangerAction && dangerLabel && dangerIcon}
      <button
        type="button"
        class="toolbar-button danger-button"
        onclick={onDangerAction}
        disabled={selectedCount === 0 || actionsDisabled}
        aria-label={dangerLabel}
      >
        <i class="fas {dangerIcon}" aria-hidden="true"></i>
        <span>{dangerLabel}</span>
      </button>
    {/if}
  </div>
</div>

<style>
  .selection-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--spacing-sm, 8px);
    width: 100%;
    min-height: calc(var(--min-touch-target, 48px) + 16px);
    padding: var(--spacing-sm, 8px) var(--spacing-md, 16px);
    background: color-mix(
      in srgb,
      var(--theme-accent, #6366f1) 12%,
      var(--theme-panel-bg, #0f0f14)
    );
    border-bottom: 1px solid
      color-mix(in srgb, var(--theme-accent, #6366f1) 32%, transparent);
  }

  .toolbar-status,
  .toolbar-actions {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm, 8px);
    min-width: 0;
  }

  .toolbar-actions {
    justify-content: flex-end;
  }

  .selected-count {
    display: inline-grid;
    flex: 0 0 auto;
    color: var(--theme-text, #fff);
    font-size: var(--font-size-sm, 14px);
    font-weight: 650;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .count-sizer,
  .count-live {
    grid-area: 1 / 1;
  }

  .count-sizer {
    visibility: hidden;
  }

  .toolbar-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    min-height: var(--min-touch-target, 48px);
    padding: 0 14px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: var(--border-radius-md, 10px);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.05));
    color: var(--theme-text, #fff);
    font: inherit;
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    white-space: nowrap;
    cursor: pointer;
    transition:
      background var(--duration-fast, 150ms) ease,
      border-color var(--duration-fast, 150ms) ease,
      transform var(--duration-fast, 150ms) ease;
  }

  .toolbar-button > i {
    width: 1em;
    flex: 0 0 1em;
    text-align: center;
  }

  .icon-button {
    width: var(--min-touch-target, 48px);
    padding: 0;
    border-radius: 50%;
    flex: 0 0 auto;
  }

  .primary-button {
    background: var(--theme-accent, #6366f1);
    border-color: var(--theme-accent, #6366f1);
    color: var(--theme-text-on-accent, #fff);
  }

  .danger-button {
    background: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 12%,
      transparent
    );
    border-color: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 42%,
      transparent
    );
    color: var(--semantic-error, #ef4444);
  }

  .primary-button.danger-primary {
    background: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 14%,
      transparent
    );
    border-color: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 52%,
      transparent
    );
    color: var(--semantic-error, #ef4444);
  }

  /* When removal is the main action, permanent deletion carries the stronger
     fill so the two red controls still communicate different consequences. */
  .selection-toolbar.destructive-primary .danger-button {
    background: var(--semantic-error, #ef4444);
    border-color: var(--semantic-error, #ef4444);
    color: var(--theme-text-on-accent, #fff);
  }

  .toolbar-button:hover:not(:disabled) {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.1));
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.24));
  }

  .primary-button:hover:not(:disabled) {
    background: color-mix(in srgb, var(--theme-accent, #6366f1) 86%, white);
    border-color: color-mix(in srgb, var(--theme-accent, #6366f1) 86%, white);
  }

  .danger-button:hover:not(:disabled) {
    background: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 20%,
      transparent
    );
    border-color: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 64%,
      transparent
    );
  }

  .primary-button.danger-primary:hover:not(:disabled) {
    background: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 24%,
      transparent
    );
    border-color: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 68%,
      transparent
    );
  }

  .selection-toolbar.destructive-primary .danger-button:hover:not(:disabled) {
    background: color-mix(in srgb, var(--semantic-error, #ef4444) 86%, black);
    border-color: color-mix(in srgb, var(--semantic-error, #ef4444) 86%, black);
  }

  .toolbar-button:active:not(:disabled) {
    transform: scale(0.97);
  }

  .toolbar-button:disabled {
    opacity: 0.42;
    cursor: not-allowed;
  }

  .toolbar-button:focus-visible {
    outline: 2px solid var(--theme-accent, #6366f1);
    outline-offset: 2px;
  }

  .danger-primary:focus-visible,
  .danger-button:focus-visible {
    outline-color: var(--semantic-error, #ef4444);
  }

  @container gallery (max-width: 520px) {
    .selection-toolbar {
      padding-inline: var(--spacing-sm, 8px);
    }

    .toolbar-status,
    .toolbar-actions {
      gap: 6px;
    }

    .select-all-button,
    .clear-button,
    .primary-button,
    .secondary-button,
    .danger-button {
      width: var(--min-touch-target, 48px);
      padding: 0;
    }

    .select-all-button .button-label,
    .clear-button .button-label,
    .primary-button span,
    .secondary-button span,
    .danger-button span {
      display: none;
    }
  }

  @container gallery (max-width: 900px) {
    .selection-toolbar.has-secondary .select-all-button,
    .selection-toolbar.has-secondary .clear-button,
    .selection-toolbar.has-secondary .primary-button,
    .selection-toolbar.has-secondary .secondary-button,
    .selection-toolbar.has-secondary .danger-button {
      width: var(--min-touch-target, 48px);
      padding: 0;
    }

    .selection-toolbar.has-secondary .select-all-button .button-label,
    .selection-toolbar.has-secondary .clear-button .button-label,
    .selection-toolbar.has-secondary .primary-button span,
    .selection-toolbar.has-secondary .secondary-button span,
    .selection-toolbar.has-secondary .danger-button span {
      display: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .toolbar-button {
      transition: none;
    }

    .toolbar-button:active:not(:disabled) {
      transform: none;
    }
  }
</style>
