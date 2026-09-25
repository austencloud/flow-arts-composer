<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
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
      <h2 id={headingId}>{label}</h2>
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
  .context-section {
    min-width: 0;
    border: 1px solid var(--theme-stroke);
    border-radius: 1rem;
    background: var(--theme-panel-bg);
    overflow: hidden;
  }

  .section-header {
    padding: 0.85rem 1rem 0.7rem;
    border-bottom: 1px solid var(--theme-stroke);
    background: color-mix(in srgb, var(--theme-card-bg) 70%, transparent);
  }

  h2,
  p {
    margin: 0;
  }

  h2 {
    color: var(--theme-text);
    font-size: var(--font-size-base);
    font-weight: 650;
  }

  p {
    margin-top: 0.15rem;
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact);
  }

  p span {
    color: var(--theme-accent);
  }

  .section-content {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 0.4rem;
    padding: 0.55rem;
  }

  @container (min-width: 100rem) {
    .section-content {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>
