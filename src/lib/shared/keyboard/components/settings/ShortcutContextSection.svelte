<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import ShortcutRow from "./ShortcutRow.svelte";
  import type { ShortcutWithBinding } from "../../services/types";
  import type { ShortcutContext } from "../../domain/types/keyboard-types";

  let {
    context,
    label,
    shortcuts,
    selectedShortcutId,
    onEditShortcut = () => {},
    onResetShortcut = () => {},
  }: {
    context: ShortcutContext;
    label: string;
    shortcuts: ShortcutWithBinding[];
    selectedShortcutId?: string | null;
    onEditShortcut?: (item: ShortcutWithBinding) => void;
    onResetShortcut?: (item: ShortcutWithBinding) => void;
  } = $props();

  const customizedCount = $derived(
    shortcuts.filter(({ isCustomized }) => isCustomized).length
  );
  const headingId = $derived(`shortcut-context-${context}`);
</script>

<section class="context-section" aria-labelledby={headingId}>
  <header class="section-header">
    <div>
      <h3 id={headingId}>{label}</h3>
      <p>
        {shortcuts.length}
        {shortcuts.length === 1 ? t("keyboard_ui_command") : t("keyboard_ui_commands")}
        {#if customizedCount > 0}
          <span> · {t("keyboard_ui_changed_count", { count: customizedCount })}</span>
        {/if}
      </p>
    </div>
  </header>

  <div class="section-content">
    {#each shortcuts as item (item.shortcut.id)}
      <ShortcutRow
        {item}
        selected={selectedShortcutId === item.shortcut.id}
        onEdit={onEditShortcut}
        onReset={onResetShortcut}
      />
    {/each}
  </div>
</section>

<style>
  /* An unframed group inside the subpage panel: a hairline above every group
     but the first, a quiet heading, and rows split by hairlines. */
  .context-section {
    min-width: 0;
  }

  .context-section + :global(.context-section) {
    border-top: 1px solid var(--theme-stroke);
  }

  .section-header {
    padding: 1em var(--settings-row-inline, 1.15em) 0.4em;
  }

  h3,
  p {
    margin: 0;
  }

  h3 {
    color: var(--theme-text);
    font-size: max(0.9375rem, var(--font-size-base));
    font-weight: 725;
    line-height: 1.25;
  }

  p {
    margin-top: 0.15em;
    color: var(--theme-text-dim);
    font-size: max(0.8125rem, var(--font-size-compact));
    line-height: 1.35;
  }

  p span {
    color: var(--theme-accent-text, var(--theme-accent));
  }

  .section-content {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
  }

  .section-content > :global(.shortcut-row + .shortcut-row) {
    border-top: 1px solid var(--theme-stroke);
  }

  /* Two columns of rows on a wide panel, with a seam between them. */
  @container settings-subpage (min-width: 56rem) {
    .section-content {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .section-content > :global(.shortcut-row:nth-child(2)) {
      border-top: 0;
    }

    .section-content > :global(.shortcut-row:nth-child(odd)) {
      border-right: 1px solid var(--theme-stroke);
    }
  }
</style>
