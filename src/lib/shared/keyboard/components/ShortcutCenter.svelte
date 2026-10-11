<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { onMount, tick } from "svelte";
  import ConfirmDialog from "#lib/shared/foundation/ui/ConfirmDialog.svelte";
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import SettingsSubpage from "#lib/shared/settings/components/SettingsSubpage.svelte";
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

  let {
    backLabel,
    onBack,
  }: {
    /** Label of the settings tab the back control returns to. */
    backLabel?: string;
    onBack?: () => void;
  } = $props();

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

{#snippet resetAction()}
  <PanelButton
    variant="quiet"
    onclick={() => (showResetConfirmation = true)}
    ariaLabel={t("keyboard_ui_reset_all")}
  >
    <i class="fas fa-undo" aria-hidden="true"></i>
    <span>{t("keyboard_ui_reset_all")}</span>
  </PanelButton>
{/snippet}

{#snippet searchTools()}
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
  </div>

  <p class="result-summary" aria-live="polite">
    <span>{t(visibleCount === 1 ? "keyboard_ui_one_shortcut" : "keyboard_ui_shortcuts_count", { count: visibleCount })}</span>
    {#if view === "current"}
      <span>{t("keyboard_ui_for_context", { context: getShortcutContextLabel(currentContext) })}</span>
    {/if}
  </p>
{/snippet}

<SettingsSubpage
  icon="fas fa-keyboard"
  title={t("keyboard_ui_title")}
  description={t("keyboard_ui_subtitle")}
  headingId="shortcut-center-title"
  {backLabel}
  {onBack}
  action={changedCount > 0 ? resetAction : undefined}
  toolbar={searchTools}
>
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
</SettingsSubpage>

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
  /* Search and the view filter share one line when there's room. */
  .toolbar {
    display: grid;
    grid-template-columns: minmax(12rem, 1fr) minmax(17rem, 28rem);
    align-items: center;
    gap: 0.75rem;
  }

  :global(.subpage-toolbar .panel-search) {
    padding: 0;
  }

  :global(.subpage-toolbar .panel-search__icon) {
    left: 0.8rem;
  }

  .view-picker {
    min-width: 0;
  }

  .result-summary {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    margin: 0.55rem 0 0;
    color: var(--theme-text-dim);
    font-size: max(0.8125rem, var(--font-size-compact));
  }

  /* The one scroller on the page: the editor sits above the list while a
     shortcut is being changed. Positioned so the rows' visually hidden labels
     stay inside it instead of stretching the page. */
  .workspace {
    position: relative;
    display: flex;
    flex: 1 1 0;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  .list-pane {
    flex: none;
    min-width: 0;
  }

  .editor-pane {
    flex: none;
    order: -1;
    min-width: 0;
    padding: 0.85rem var(--settings-row-inline);
    border-bottom: 1px solid var(--theme-stroke);
  }

  .empty-state {
    display: flex;
    min-height: 15rem;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    padding: 2rem var(--settings-row-inline);
    color: var(--theme-text-dim);
    text-align: center;
  }

  .empty-state i {
    font-size: 2rem;
    color: var(--theme-accent-text, var(--theme-accent));
  }

  .empty-state h3,
  .empty-state p {
    margin: 0;
  }

  .empty-state h3 {
    color: var(--theme-text);
    font-size: var(--font-size-base);
  }

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

  .empty-state button:hover {
    background: var(--theme-card-hover-bg);
  }

  .empty-state button:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
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

  @container settings-subpage (max-width: 44rem) {
    .toolbar {
      grid-template-columns: minmax(0, 1fr);
      gap: 0.5rem;
    }
  }

  @media (max-height: 520px) {
    .result-summary {
      margin-top: 0.3rem;
    }
  }
</style>
