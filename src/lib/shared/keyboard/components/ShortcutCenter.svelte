<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { onMount, tick } from "svelte";
  import ConfirmDialog from "#lib/shared/foundation/ui/ConfirmDialog.svelte";
  import PanelSearch from "#lib/shared/components/panel/PanelSearch.svelte";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import ShortcutBindingEditor from "./ShortcutBindingEditor.svelte";
  import ShortcutContextSection from "./settings/ShortcutContextSection.svelte";
  import { keyboardShortcutState } from "../state/keyboard-shortcut-state.svelte";
  import { getShortcutRegistry } from "../get-shortcut-registry";
  import { getShortcutCustomizer } from "../get-shortcut-customizer";
  import type { ShortcutRegistry } from "../services/shortcut-registry";
  import type { ShortcutCustomizer } from "../services/shortcut-customizer";
  import type { ShortcutWithBinding } from "../services/types";
  import type { ShortcutContext } from "../domain/types/keyboard-types";
  import {
    buildShortcutCatalog,
    getShortcutContextLabel,
    type ShortcutCenterView,
  } from "../domain/shortcut-center-catalog";
  import { localizeShortcut, localizeShortcutLabel } from "../domain/shortcut-presentation";
  import { getLocale } from "#lib/shared/i18n/i18n.svelte.js";

  let registry: ShortcutRegistry | null = null;
  let customizer = $state<ShortcutCustomizer | null>(null);
  let registryVersion = $state(0);
  let query = $state("");
  let view = $state<ShortcutCenterView>("current");
  let selectedShortcutId = $state<string | null>(null);
  let showResetConfirmation = $state(false);
  let announcement = $state("");
  let searchInput = $state<HTMLInputElement | null>(null);
  let workspaceElement = $state<HTMLDivElement | null>(null);
  let appliedHelpLaunchVersion = -1;

  const allItems = $derived.by(() => {
    registryVersion;
    keyboardShortcutState.settings;
    getLocale();
    return (customizer?.getAllShortcutsWithBindings() ?? []).map(localizeShortcut);
  });
  const currentContext = $derived(keyboardShortcutState.context);
  const currentItems = $derived(
    buildShortcutCatalog(allItems, "current", currentContext, "").flatMap(
      ({ items }) => items
    )
  );
  const changedCount = $derived(
    allItems.filter(({ isCustomized }) => isCustomized).length
  );
  const viewOptions = $derived([
    {
      value: "current" as const,
      label: t("keyboard_ui_this_area"),
      count: currentItems.length,
      ariaLabel: t("keyboard_ui_view_count", { view: t("keyboard_ui_this_area"), count: currentItems.length }),
    },
    {
      value: "all" as const,
      label: t("keyboard_ui_all"),
      count: allItems.length,
      ariaLabel: t("keyboard_ui_view_count", { view: t("keyboard_ui_all"), count: allItems.length }),
    },
    {
      value: "changed" as const,
      label: t("keyboard_ui_changed"),
      count: changedCount,
      ariaLabel: t("keyboard_ui_view_count", { view: t("keyboard_ui_changed"), count: changedCount }),
    },
  ]);
  const groups = $derived(
    buildShortcutCatalog(allItems, view, currentContext, query)
  );
  const visibleCount = $derived(
    groups.reduce((total, group) => total + group.items.length, 0)
  );
  const selectedItem = $derived(
    allItems.find(({ shortcut }) => shortcut.id === selectedShortcutId) ?? null
  );
  const selectedContextLabel = $derived(
    selectedItem ? describeContexts(selectedItem) : ""
  );

  onMount(() => {
    registry = getShortcutRegistry();
    customizer = getShortcutCustomizer();
    registryVersion += 1;
    focusSearch();
    return registry.subscribe(() => (registryVersion += 1));
  });

  $effect(() => {
    if (appliedHelpLaunchVersion === keyboardShortcutState.helpLaunchVersion)
      return;

    view = keyboardShortcutState.helpLaunch.view;
    query = keyboardShortcutState.helpLaunch.query;
    appliedHelpLaunchVersion = keyboardShortcutState.helpLaunchVersion;
  });

  function focusSearch(): void {
    requestAnimationFrame(() => searchInput?.focus());
  }

  function describeContexts(item: ShortcutWithBinding): string {
    const contexts = Array.isArray(item.shortcut.context)
      ? item.shortcut.context
      : [item.shortcut.context ?? "global"];
    return contexts.map(getShortcutContextLabel).join(" · ");
  }

  async function editShortcut(item: ShortcutWithBinding): Promise<void> {
    selectedShortcutId = item.shortcut.id;
    await tick();
    if (workspaceElement && workspaceElement.clientWidth < 1024) {
      workspaceElement.scrollTop = 0;
    }
  }

  function resetShortcut(item: ShortcutWithBinding): void {
    customizer?.resetBinding(item.shortcut.id);
    announcement = t("keyboard_ui_restored_announcement", { name: item.shortcut.label });
  }

  function saveShortcut(item: ShortcutWithBinding, keyCombo: string): void {
    customizer?.setCustomBinding(item.shortcut.id, keyCombo);
    announcement = t("keyboard_ui_saved_announcement", { name: item.shortcut.label });
  }

  function replaceShortcut(item: ShortcutWithBinding, keyCombo: string): void {
    const replaced =
      customizer?.replaceBinding(item.shortcut.id, keyCombo) ?? [];
    const firstReplacement = replaced[0];
    const suffix =
      replaced.length === 1 && firstReplacement
        ? ` ${t("keyboard_ui_conflict_turned_off", { name: localizeShortcutLabel(firstReplacement.existingShortcutId, firstReplacement.existingShortcutLabel) })}`
        : replaced.length > 1
          ? ` ${t("keyboard_ui_conflicts_turned_off", { count: replaced.length })}`
          : "";
    announcement = t("keyboard_ui_saved_announcement", { name: item.shortcut.label }) + suffix;
  }

  function swapShortcut(
    item: ShortcutWithBinding,
    conflictId: string
  ): boolean {
    const conflict = customizer?.swapBindings(item.shortcut.id, conflictId);
    if (conflict) {
      announcement = t("keyboard_ui_swap_conflict", { name: localizeShortcutLabel(conflict.existingShortcutId, conflict.existingShortcutLabel) });
      return false;
    }

    announcement = t("keyboard_ui_swapped_announcement", { name: item.shortcut.label });
    return true;
  }

  function disableShortcut(item: ShortcutWithBinding): void {
    customizer?.disableShortcut(item.shortcut.id);
    announcement = t("keyboard_ui_turned_off_announcement", { name: item.shortcut.label });
  }

  function enableShortcut(item: ShortcutWithBinding): void {
    customizer?.enableShortcut(item.shortcut.id);
    announcement = t("keyboard_ui_turned_on_announcement", { name: item.shortcut.label });
  }

  function resetAll(): void {
    customizer?.resetAllBindings();
    selectedShortcutId = null;
    announcement = t("keyboard_ui_all_restored");
  }

  function getEmptyMessage(): string {
    if (query) return t("keyboard_ui_no_match", { query });
    if (view === "changed")
      return t("keyboard_ui_no_changes");
    if (view === "current") return t("keyboard_ui_none_in_area");
    return t("keyboard_ui_none_registered");
  }
</script>

<section class="shortcut-settings" aria-labelledby="shortcut-center-title">
  <header class="shortcut-settings-header">
    <span class="shortcut-settings-icon" aria-hidden="true">
      <i class="fas fa-keyboard"></i>
    </span>
    <span>
      <h1 id="shortcut-center-title">{t("keyboard_ui_title")}</h1>
      <p>{t("keyboard_ui_subtitle")}</p>
    </span>
  </header>

  <div class="shortcut-center">
    <div class="toolbar">
      <PanelSearch
        bind:value={query}
        bind:inputRef={searchInput}
        maxWidth="none"
        placeholder={t("keyboard_ui_search_placeholder")}
        ariaLabel={t("keyboard_ui_search_label")}
        autofocus={true}
      />

      <div class="view-picker">
        <SegmentedControl
          options={viewOptions}
          value={view}
          onchange={(nextView) => (view = nextView)}
          color="accent"
          size="sm"
          density="compact"
          semantics="radiogroup"
          ariaLabel={t("keyboard_ui_view_label")}
        />
      </div>

      {#if changedCount > 0}
        <button
          type="button"
          class="reset-all-button"
          onclick={() => (showResetConfirmation = true)}
        >
          {t("keyboard_ui_reset_all")}
        </button>
      {/if}
    </div>

    <div class="result-summary" aria-live="polite">
      <span>{t(visibleCount === 1 ? "keyboard_ui_one_shortcut" : "keyboard_ui_shortcuts_count", { count: visibleCount })}</span
      >
      {#if view === "current"}
        <span>{t("keyboard_ui_for_context", { context: getShortcutContextLabel(currentContext) })}</span>
      {/if}
    </div>

    <div
      bind:this={workspaceElement}
      class="workspace"
      class:editing={selectedItem !== null}
    >
      <div class="list-pane">
        {#if groups.length > 0}
          <div class="groups">
            {#each groups as group (group.context)}
              <ShortcutContextSection
                context={group.context}
                label={group.label}
                shortcuts={group.items}
                {selectedShortcutId}
                onEditShortcut={editShortcut}
                onResetShortcut={resetShortcut}
              />
            {/each}
          </div>
        {:else}
          <div class="empty-state">
            <i class="fas fa-keyboard" aria-hidden="true"></i>
            <h3>{getEmptyMessage()}</h3>
            {#if query}
              <button type="button" onclick={() => (query = "")}
                >{t("keyboard_ui_clear_search")}</button
              >
            {:else if view === "changed"}
              <p>{t("keyboard_ui_choose_from_all")}</p>
            {/if}
          </div>
        {/if}
      </div>

      {#if selectedItem && customizer}
        <div class="editor-pane">
          <ShortcutBindingEditor
            item={selectedItem}
            contextLabel={selectedContextLabel}
            detectConflicts={(keyCombo) =>
              customizer?.detectConflicts(selectedItem.shortcut.id, keyCombo) ??
              []}
            onSave={(keyCombo) => saveShortcut(selectedItem, keyCombo)}
            onReplace={(keyCombo) => replaceShortcut(selectedItem, keyCombo)}
            onSwap={(_, conflictId) => swapShortcut(selectedItem, conflictId)}
            onReset={() => resetShortcut(selectedItem)}
            onDisable={() => disableShortcut(selectedItem)}
            onEnable={() => enableShortcut(selectedItem)}
            onClose={() => (selectedShortcutId = null)}
          />
        </div>
      {/if}
    </div>

    <p class="sr-only" aria-live="assertive">{announcement}</p>
  </div>
</section>

<ConfirmDialog
  bind:isOpen={showResetConfirmation}
  title={t("keyboard_ui_reset_all_title")}
  message={t("keyboard_ui_reset_all_message")}
  confirmText={t("keyboard_ui_reset_all")}
  cancelText={t("keyboard_ui_keep_changes")}
  variant="danger"
  onConfirm={resetAll}
  onCancel={() => (showResetConfirmation = false)}
/>

<style>
  .shortcut-settings {
    width: min(100%, 72rem);
    min-height: 100%;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    color: var(--theme-text);
  }

  .shortcut-settings-header {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: clamp(0.75rem, 2vw, 1.35rem) clamp(0.25rem, 1vw, 0.75rem);
  }

  .shortcut-settings-icon {
    width: clamp(2.75rem, 4vw, 3.5rem);
    height: clamp(2.75rem, 4vw, 3.5rem);
    flex: none;
    display: grid;
    place-items: center;
    border-radius: 0.9rem;
    background: color-mix(in srgb, var(--theme-accent) 14%, transparent);
    color: var(--theme-accent);
    font-size: var(--font-size-lg);
  }

  .shortcut-settings-header h1,
  .shortcut-settings-header p {
    margin: 0;
  }

  .shortcut-settings-header h1 {
    font-size: clamp(var(--font-size-xl), 2.5vw, var(--font-size-2xl));
    line-height: 1.15;
  }

  .shortcut-settings-header p {
    margin-top: 0.25rem;
    color: var(--theme-text-dim);
    font-size: var(--font-size-sm);
  }

  .shortcut-center {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    border-top: 1px solid var(--theme-stroke);
  }

  .toolbar {
    display: grid;
    grid-template-columns: minmax(15rem, 1fr) minmax(19rem, 30rem) auto;
    align-items: center;
    gap: 0.75rem;
    padding: 0.8rem 1rem 0.55rem;
    border-bottom: 1px solid var(--theme-stroke);
  }

  :global(.shortcut-center .panel-search) {
    padding: 0;
  }

  :global(.shortcut-center .panel-search__icon) {
    left: 0.8rem;
  }

  .view-picker {
    min-width: 0;
  }

  .reset-all-button,
  .empty-state button {
    min-height: var(--min-touch-target);
    padding: 0 0.85rem;
    border: 1px solid var(--theme-stroke);
    border-radius: 0.65rem;
    background: var(--theme-card-bg);
    color: var(--theme-text);
    font-size: var(--font-size-sm);
    font-weight: 600;
    cursor: pointer;
  }

  .reset-all-button:hover,
  .empty-state button:hover {
    background: var(--theme-card-hover-bg);
  }

  .reset-all-button:focus-visible,
  .empty-state button:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  .result-summary {
    display: flex;
    gap: 0.35rem;
    padding: 0.45rem 1rem;
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact);
  }

  .workspace {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 0.75rem;
    min-width: 0;
    min-height: 0;
    padding: 0 1rem 1rem;
    overflow-y: auto;
  }

  .list-pane {
    flex: none;
    min-width: 0;
  }

  .groups {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 0.75rem;
  }

  .editor-pane {
    flex: none;
    order: -1;
    min-width: 0;
    min-height: 0;
  }

  .empty-state {
    display: flex;
    min-height: 15rem;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    padding: 2rem;
    border: 1px dashed var(--theme-stroke-strong);
    border-radius: 1rem;
    color: var(--theme-text-dim);
    text-align: center;
  }

  .empty-state i {
    font-size: 2rem;
    color: var(--theme-accent);
  }

  .empty-state h3,
  .empty-state p {
    margin: 0;
  }

  .empty-state h3 {
    color: var(--theme-text);
    font-size: var(--font-size-base);
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

  @media (max-width: 800px) {
    .toolbar {
      grid-template-columns: minmax(0, 1fr);
      padding-inline: 0.75rem;
    }

    .reset-all-button {
      justify-self: stretch;
    }

    .result-summary {
      padding-inline: 0.75rem;
    }

    .workspace {
      padding: 0 0.75rem 0.75rem;
    }
  }

  @media (max-width: 520px) {
    .shortcut-settings-header {
      padding-inline: 0.25rem;
    }

    .toolbar {
      gap: 0.45rem;
      padding-block: 0.55rem;
    }

    .result-summary {
      padding-block: 0.35rem;
    }
  }

  @media (max-height: 520px) {
    .shortcut-settings-header {
      padding-block: 0.5rem;
    }

    .toolbar {
      padding-block: 0.45rem;
    }

    .result-summary {
      padding-block: 0.25rem;
    }
  }
</style>
