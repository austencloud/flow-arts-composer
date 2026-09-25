<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import type { ShortcutConflict } from "../../domain/types/keyboard-types";
  import { localizeShortcutLabel } from "../../domain/shortcut-presentation";

  let {
    conflicts,
    onReplace,
    onSwap,
  }: {
    conflicts: ShortcutConflict[];
    onReplace?: () => void;
    onSwap?: () => void;
  } = $props();

  const errorConflicts = $derived(
    conflicts.filter(({ severity }) => severity === "error")
  );
  const hasErrors = $derived(errorConflicts.length > 0);
</script>

<div
  class="conflict-warning"
  class:error={hasErrors}
  class:warning={!hasErrors}
  role="alert"
>
  <i class="fas fa-exclamation-triangle conflict-icon" aria-hidden="true"></i>
  <div class="conflict-info">
    <strong
      >{hasErrors
        ? t("keyboard_ui_conflict_in_use")
        : t("keyboard_ui_context_overlap")}</strong
    >
    <ul>
      {#each conflicts as conflict (conflict.existingShortcutId)}
        <li>
          {localizeShortcutLabel(conflict.existingShortcutId, conflict.existingShortcutLabel)}
          {#if conflict.severity === "warning"}
            <span>{t("keyboard_ui_also_active")}</span>
          {/if}
        </li>
      {/each}
    </ul>
    {#if hasErrors}
      <p>
        {t("keyboard_ui_conflict_help")}
      </p>
    {/if}
  </div>

  {#if hasErrors && (onReplace || onSwap)}
    <div class="conflict-actions">
      {#if onSwap && errorConflicts.length === 1}
        <button class="conflict-button" type="button" onclick={onSwap}
          >{t("keyboard_ui_swap")}</button
        >
      {/if}
      {#if onReplace}
        <button class="conflict-button danger" type="button" onclick={onReplace}
          >{t("keyboard_ui_replace")}</button
        >
      {/if}
    </div>
  {/if}
</div>

<style>
  .conflict-warning {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 0.75rem;
    padding: 0.875rem;
    border: 1px solid
      color-mix(in srgb, var(--semantic-warning) 35%, transparent);
    border-radius: 0.75rem;
    background: color-mix(in srgb, var(--semantic-warning) 10%, transparent);
    color: var(--theme-text);
  }

  .conflict-warning.error {
    border-color: color-mix(in srgb, var(--semantic-error) 38%, transparent);
    background: color-mix(in srgb, var(--semantic-error) 10%, transparent);
  }

  .conflict-icon {
    margin-top: 0.15rem;
    color: var(--semantic-warning);
  }

  .error .conflict-icon {
    color: var(--semantic-error);
  }

  .conflict-info {
    min-width: 0;
    font-size: var(--font-size-compact);
    line-height: 1.4;
  }

  .conflict-info strong {
    font-size: var(--font-size-sm);
  }

  ul {
    margin: 0.35rem 0 0;
    padding-left: 1.1rem;
  }

  li span,
  p {
    color: var(--theme-text-dim);
  }

  p {
    margin: 0.5rem 0 0;
  }

  .conflict-actions {
    grid-column: 2;
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .conflict-button {
    min-height: var(--min-touch-target);
    padding: 0 0.9rem;
    border: 1px solid var(--theme-stroke-strong);
    border-radius: 0.55rem;
    background: var(--theme-card-bg);
    color: var(--theme-text);
    font-weight: 600;
    cursor: pointer;
  }

  .conflict-button.danger {
    border-color: color-mix(in srgb, var(--semantic-error) 55%, transparent);
    background: color-mix(in srgb, var(--semantic-error) 18%, transparent);
  }

  .conflict-button:hover {
    background: var(--theme-card-hover-bg);
  }

  .conflict-button:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }
</style>
