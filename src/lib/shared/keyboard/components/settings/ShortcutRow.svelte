<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import KeyboardKeyDisplay from "./KeyboardKeyDisplay.svelte";
  import type { ShortcutWithBinding } from "../../services/types";

  let {
    item,
    selected = false,
    onEdit = () => {},
    onReset = () => {},
  }: {
    item: ShortcutWithBinding;
    selected?: boolean;
    onEdit?: (item: ShortcutWithBinding) => void;
    onReset?: (item: ShortcutWithBinding) => void;
  } = $props();
</script>

<div
  class="shortcut-row"
  class:selected
  class:customized={item.isCustomized}
  class:disabled={item.isDisabled}
>
  <button
    type="button"
    class="edit-button"
    onclick={() => onEdit(item)}
    aria-current={selected ? "true" : undefined}
  >
    <span class="sr-only">{t("keyboard_ui_edit")}</span>
    <span class="shortcut-copy">
      <span class="label">{item.shortcut.label}</span>
      {#if item.shortcut.description}
        <span class="description">{item.shortcut.description}</span>
      {/if}
    </span>

    <span class="binding" class:muted={item.isDisabled}>
      <KeyboardKeyDisplay parsed={item.effectiveBinding} size="small" />
    </span>

    <span class="status" aria-hidden="true">
      {#if item.isDisabled}
        <span class="status-badge">{t("keyboard_ui_off")}</span>
      {:else if item.isCustomized}
        <span class="status-badge">{t("keyboard_ui_changed")}</span>
      {/if}
      <i class="fas fa-chevron-right"></i>
    </span>
  </button>

  {#if item.isCustomized}
    <button
      type="button"
      class="reset-button"
      onclick={() => onReset(item)}
      aria-label={t("keyboard_ui_reset_named", { name: item.shortcut.label })}
      title={t("keyboard_ui_reset_to_default")}
    >
      <i class="fas fa-undo" aria-hidden="true"></i>
    </button>
  {/if}
</div>

<style>
  .shortcut-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: stretch;
    min-height: 3.5rem;
    border: 1px solid transparent;
    border-radius: 0.75rem;
    background: var(--theme-card-bg);
    overflow: hidden;
    transition:
      background var(--duration-fast) ease,
      border-color var(--duration-fast) ease;
  }

  .shortcut-row:hover,
  .shortcut-row.selected {
    border-color: color-mix(
      in srgb,
      var(--theme-accent) 45%,
      var(--theme-stroke)
    );
    background: var(--theme-card-hover-bg);
  }

  .shortcut-row.customized {
    border-left: 3px solid var(--theme-accent);
  }

  .shortcut-row.disabled .shortcut-copy,
  .binding.muted {
    opacity: 0.52;
  }

  .edit-button {
    display: grid;
    grid-template-columns: minmax(8rem, 1fr) auto auto;
    align-items: center;
    gap: 0.75rem;
    min-width: 0;
    min-height: var(--min-touch-target);
    padding: 0.55rem 0.75rem;
    border: 0;
    background: transparent;
    color: var(--theme-text);
    text-align: left;
    cursor: pointer;
  }

  .shortcut-copy {
    display: flex;
    flex-direction: column;
    min-width: 0;
    gap: 0.1rem;
  }

  .label,
  .description {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .label {
    font-size: var(--font-size-sm);
    font-weight: 600;
  }

  .description {
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact);
  }

  .binding,
  .status {
    display: flex;
    align-items: center;
    flex-shrink: 0;
  }

  .status {
    gap: 0.45rem;
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact);
  }

  .status-badge {
    padding: 0.15rem 0.4rem;
    border-radius: 999px;
    background: color-mix(in srgb, var(--theme-accent) 14%, transparent);
    color: var(--theme-accent);
    font-weight: 650;
  }

  .reset-button {
    width: var(--min-touch-target);
    min-height: var(--min-touch-target);
    padding: 0;
    border: 0;
    border-left: 1px solid var(--theme-stroke);
    background: transparent;
    color: var(--theme-text-dim);
    cursor: pointer;
  }

  .reset-button:hover {
    background: color-mix(in srgb, var(--semantic-error) 12%, transparent);
    color: var(--semantic-error);
  }

  .edit-button:focus-visible,
  .reset-button:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: -3px;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    padding: 0;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
    border: 0;
  }

  @container (max-width: 36rem) {
    .edit-button {
      grid-template-columns: minmax(0, 1fr) auto;
    }

    .description,
    .status-badge {
      display: none;
    }

    .status {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip: rect(0 0 0 0);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .shortcut-row {
      transition: none;
    }
  }
</style>
