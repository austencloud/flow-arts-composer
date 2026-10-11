<script lang="ts">
  import { getLocale, t } from "#lib/shared/i18n/i18n.svelte.js";
  import { onMount, tick } from "svelte";
  import BaseModal from "#lib/shared/foundation/ui/modal/BaseModal.svelte";
  import ModalHeader from "#lib/shared/foundation/ui/modal/ModalHeader.svelte";
  import PanelSearch from "#lib/shared/components/panel/PanelSearch.svelte";
  import KeyboardKeyDisplay from "./settings/KeyboardKeyDisplay.svelte";
  import { getCommandPalette } from "../get-command-palette";
  import type { CommandPalette } from "#lib/shared/keyboard/services/command-palette.js";
  import { commandPaletteState } from "../state/command-palette-state.svelte";
  import { keyboardShortcutState } from "../state/keyboard-shortcut-state.svelte";
  import type { CommandPaletteItem } from "../domain/types/keyboard-types";
  import { navigationState } from "#lib/shared/navigation/state/navigation-state.svelte.js";
  import { buildNavigationDestinationId } from "#lib/shared/navigation/domain/navigation-visit.js";
  import { getErrorHandler } from "#lib/shared/application/get-error-handler.js";

  let paletteService = $state<CommandPalette | null>(null);
  let inputElement = $state<HTMLInputElement | null>(null);

  const commandPaletteKey = $derived(
    keyboardShortcutState.isMac ? "Meta+K" : "Ctrl+K"
  );
  const selectedOptionId = $derived(
    commandPaletteState.selectedItem
      ? optionId(commandPaletteState.selectedItem.id)
      : undefined
  );
  const currentDestinationId = $derived(
    buildNavigationDestinationId(
      navigationState.currentModule,
      navigationState.activeTab || undefined
    )
  );
  const resultsLabel = $derived(
    commandPaletteState.query ? t("keyboard_palette_results") : t("keyboard_palette_suggestions")
  );

  onMount(() => {
    try {
      paletteService = getCommandPalette();
    } catch (error) {
      console.error("Failed to resolve command palette:", error);
      const failure = error instanceof Error ? error : new Error(String(error));
      getErrorHandler().showUserError({
        message: t("keyboard_palette_open_failed"),
        technicalDetails: failure.message,
        error: failure,
        context: { module: "keyboard", tab: "jump-to", action: "initialize" },
      });
    }
  });

  $effect(() => {
    getLocale();
    const query = commandPaletteState.query;
    const service = paletteService;

    if (commandPaletteState.isOpen && service) {
      performSearch(service, query, currentDestinationId);
    }
  });

  function performSearch(
    service: CommandPalette,
    query: string,
    activeDestinationId: string
  ) {
    commandPaletteState.setLoading(true);

    try {
      commandPaletteState.setResults(
        service.search(query, activeDestinationId)
      );
    } catch (error) {
      console.error("Command search failed:", error);
      commandPaletteState.setResults([]);
    } finally {
      commandPaletteState.setLoading(false);
    }
  }

  async function moveSelection(direction: "next" | "previous") {
    if (direction === "next") {
      commandPaletteState.selectNext();
    } else {
      commandPaletteState.selectPrevious();
    }

    await tick();
    if (selectedOptionId) {
      document.getElementById(selectedOptionId)?.scrollIntoView({
        block: "nearest",
      });
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        void moveSelection("next");
        break;
      case "ArrowUp":
        event.preventDefault();
        void moveSelection("previous");
        break;
      case "Enter":
        event.preventDefault();
        void executeSelected();
        break;
      case "Escape":
        event.preventDefault();
        close();
        break;
    }
  }

  function handleItemClick(item: CommandPaletteItem) {
    commandPaletteState.selectByIndex(
      commandPaletteState.results.indexOf(item)
    );
    void executeItem(item);
  }

  function handleItemHover(item: CommandPaletteItem) {
    commandPaletteState.selectByIndex(
      commandPaletteState.results.indexOf(item)
    );
  }

  async function executeSelected() {
    const selected = commandPaletteState.selectedItem;
    if (selected) await executeItem(selected);
  }

  async function executeItem(item: CommandPaletteItem) {
    if (!paletteService) return;

    try {
      await paletteService.executeCommand(item.id);
      close();
    } catch (error) {
      const failure = error instanceof Error ? error : new Error(String(error));
      getErrorHandler().showUserError({
        message: t("keyboard_palette_destination_failed"),
        technicalDetails: failure.message,
        error: failure,
        context: { module: "keyboard", tab: "jump-to", action: item.id },
      });
    }
  }

  function close() {
    commandPaletteState.close();
    keyboardShortcutState.closeCommandPalette();
  }

  function focusSearch() {
    inputElement?.focus();
  }

  function optionId(commandId: string): string {
    return `command-option-${commandId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
  }

  function categoryId(category: string): string {
    return `command-category-${category.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  }

  function translateCategory(category: string): string {
    switch (category) {
      case "Places": return t("keyboard_palette_places");
      case "Actions": return t("keyboard_palette_actions");
      case "Help": return t("keyboard_palette_help");
      case "Recent": return t("keyboard_palette_recent");
      case "Often used": return t("keyboard_palette_often_used");
      case "Actions here": return t("keyboard_palette_actions_here");
      case "Other": return t("keyboard_palette_other");
      default: return category;
    }
  }

  const groupedResults = $derived.by(() => {
    const groups = new Map<string, CommandPaletteItem[]>();

    for (const item of commandPaletteState.results) {
      const category = item.category || "Other";
      const group = groups.get(category) ?? [];
      group.push(item);
      groups.set(category, group);
    }

    return Array.from(groups.entries());
  });
</script>

<BaseModal
  open={commandPaletteState.isOpen}
  size="lg"
  position="center"
  animation="pop"
  class="command-palette-modal"
  labelledBy="command-palette-title"
  onclose={close}
  onopened={focusSearch}
>
  {#snippet header()}
    <ModalHeader
      id="command-palette-title"
      title={t("keyboard_palette_title")}
      subtitle={t("keyboard_palette_subtitle")}
      icon="fa-magnifying-glass"
      onClose={close}
    />
  {/snippet}

  {#snippet footer()}
    <div class="command-palette__footer" aria-hidden="true">
      <span><kbd>↑</kbd><kbd>↓</kbd> {t("keyboard_palette_move")}</span>
      <span><kbd>Enter</kbd> {t("keyboard_palette_open")}</span>
      <span><kbd>Esc</kbd> {t("keyboard_palette_close")}</span>
    </div>
  {/snippet}

  <div class="command-palette">
    <div class="command-search">
      <PanelSearch
        value={commandPaletteState.query}
        oninput={(query) => commandPaletteState.setQuery(query)}
        onkeydown={handleKeydown}
        bind:inputRef={inputElement}
        id="command-palette-search"
        name="command-palette-search"
        maxWidth="none"
        placeholder={t("keyboard_palette_search")}
        ariaLabel={t("keyboard_palette_search")}
        role="combobox"
        ariaControls="command-palette-results"
        ariaExpanded={commandPaletteState.isOpen}
        ariaActiveDescendant={selectedOptionId}
      >
        {#snippet trailing()}
          <KeyboardKeyDisplay keyCombo={commandPaletteKey} size="small" />
        {/snippet}
      </PanelSearch>
    </div>

    <div
      id="command-palette-results"
      class="command-palette__results"
      role="listbox"
      aria-label={resultsLabel}
    >
      {#if commandPaletteState.isLoading}
        <div class="command-palette__status">{t("keyboard_palette_searching")}</div>
      {:else if commandPaletteState.results.length === 0}
        <div class="command-palette__empty">
          <span class="command-palette__empty-icon">
            <i class="fas fa-magnifying-glass" aria-hidden="true"></i>
          </span>
          <strong>
            {commandPaletteState.query
              ? t("keyboard_palette_no_matches", { query: commandPaletteState.query })
              : t("keyboard_palette_search_app")}
          </strong>
          {#if commandPaletteState.query}
            <span>{t("keyboard_palette_try_search")}</span>
          {:else}
            <span>{t("keyboard_palette_empty_help")}</span>
          {/if}
        </div>
      {:else}
        {#each groupedResults as [category, items] (category)}
          <section
            class="command-palette__category"
            role="group"
            aria-labelledby={categoryId(category)}
          >
            <h3
              id={categoryId(category)}
              class="command-palette__category-label"
            >
              {translateCategory(category)}
            </h3>
            <div class="command-palette__category-items">
              {#each items as item (item.id)}
                {@const globalIndex = commandPaletteState.results.indexOf(item)}
                {@const isSelected =
                  globalIndex === commandPaletteState.selectedIndex}
                <button
                  id={optionId(item.id)}
                  class="command-palette__item"
                  class:command-palette__item--selected={isSelected}
                  onclick={() => handleItemClick(item)}
                  onmouseenter={() => handleItemHover(item)}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  tabindex="-1"
                >
                  <span class="command-palette__item-icon">
                    <i class="fas {item.icon || 'fa-bolt'}" aria-hidden="true"
                    ></i>
                  </span>
                  <span class="command-palette__item-content">
                    <strong class="command-palette__item-label">
                      {#if item.parentLabel}
                        <span class="command-palette__item-parent">
                          {item.parentLabel}
                        </span>
                        <i
                          class="fas fa-chevron-right command-palette__item-separator"
                          aria-hidden="true"
                        ></i>
                      {/if}
                      <span>{item.label}</span>
                    </strong>
                    {#if item.description}
                      <span class="command-palette__item-description">
                        {item.description}
                      </span>
                    {/if}
                  </span>
                  {#if item.shortcut}
                    <span class="command-palette__item-shortcut">
                      <KeyboardKeyDisplay
                        keyCombo={item.shortcut}
                        size="small"
                      />
                    </span>
                  {/if}
                  <i
                    class="fas fa-arrow-right command-palette__item-arrow"
                    aria-hidden="true"
                  ></i>
                </button>
              {/each}
            </div>
          </section>
        {/each}
      {/if}
    </div>
  </div>
</BaseModal>

<style>
  :global(dialog.command-palette-modal[data-size="lg"]) {
    width: min(50rem, calc(100vw - 2rem));
    height: min(68dvh, 42rem);
    max-height: calc(100dvh - 2rem);
    border: 1px solid var(--theme-stroke-strong);
    background: var(--theme-panel-bg);
  }

  :global(dialog.command-palette-modal .modal-body) {
    overflow: hidden;
  }

  @media (min-width: 1680px) {
    :global(dialog.command-palette-modal[data-size="lg"]) {
      width: min(54rem, calc(100vw - 3rem));
      height: min(66dvh, 46rem);
    }
  }

  .command-palette {
    height: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
    background: var(--theme-panel-bg);
  }

  .command-search {
    flex-shrink: 0;
    padding: 1rem 0.25rem 0.75rem;
  }

  .command-search :global(.panel-search) {
    padding: 0 16px;
  }

  .command-search :global(.panel-search__input) {
    min-height: 56px;
    padding-left: 46px;
    background: var(--theme-card-bg);
    border-color: var(--theme-stroke-strong);
    border-radius: 14px;
    font-size: var(--font-size-base);
  }

  .command-search :global(.panel-search__input:focus) {
    background: var(--theme-card-hover-bg);
    border-color: color-mix(in srgb, var(--theme-accent) 68%, white);
    box-shadow: 0 0 0 4px
      color-mix(in srgb, var(--theme-accent) 16%, transparent);
  }

  .command-search :global(.panel-search__icon) {
    left: 34px;
    color: var(--theme-accent-strong, var(--theme-accent));
    font-size: var(--font-size-base);
  }

  .command-search :global(.panel-search__trailing) {
    right: 30px;
  }

  .command-palette__results {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 0 0.75rem 1rem;
    scrollbar-width: thin;
    scrollbar-color: var(--scrollbar-thumb) var(--scrollbar-track);
  }

  .command-palette__category + .command-palette__category {
    margin-top: 16px;
  }

  .command-palette__category-label {
    margin: 0;
    padding: 8px 10px;
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 12px);
    font-weight: 700;
    letter-spacing: 0.06em;
    line-height: 1.2;
    text-transform: uppercase;
  }

  .command-palette__category-items {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .command-palette__item {
    width: 100%;
    min-height: 62px;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 9px 12px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 12px;
    color: var(--theme-text);
    cursor: pointer;
    text-align: left;
    transition:
      background var(--duration-fast) ease,
      border-color var(--duration-fast) ease;
  }

  .command-palette__item:hover,
  .command-palette__item--selected {
    background: color-mix(
      in srgb,
      var(--theme-accent) 10%,
      var(--theme-card-bg)
    );
    border-color: color-mix(
      in srgb,
      var(--theme-accent) 34%,
      var(--theme-stroke)
    );
  }

  .command-palette__item-icon {
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    border-radius: 11px;
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    color: var(--theme-accent-strong, var(--theme-accent));
    font-size: var(--font-size-base);
  }

  .command-palette__item--selected .command-palette__item-icon {
    background: color-mix(
      in srgb,
      var(--theme-accent) 18%,
      var(--theme-card-bg)
    );
    border-color: color-mix(
      in srgb,
      var(--theme-accent) 42%,
      var(--theme-stroke)
    );
  }

  .command-palette__item-content {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .command-palette__item-label {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 0.4rem;
    overflow: hidden;
    color: var(--theme-text);
    font-size: var(--font-size-min, 14px);
    font-weight: 650;
    line-height: 1.25;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .command-palette__item-parent {
    overflow: hidden;
    flex-shrink: 1;
    color: var(--theme-text-dim);
    font-weight: 550;
    text-overflow: ellipsis;
  }

  .command-palette__item-separator {
    flex-shrink: 0;
    color: var(--theme-text-dim);
    font-size: 0.625rem;
    opacity: 0.72;
  }

  .command-palette__item-label > span:last-child {
    overflow: hidden;
    min-width: 0;
    flex-shrink: 1;
    text-overflow: ellipsis;
  }

  .command-palette__item-description {
    overflow: hidden;
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 12px);
    line-height: 1.3;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .command-palette__item-shortcut {
    min-width: 4.5rem;
    display: flex;
    justify-content: flex-end;
    flex-shrink: 0;
  }

  .command-palette__item-arrow {
    width: 18px;
    flex-shrink: 0;
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 12px);
    opacity: 0;
    transition: opacity var(--duration-fast) ease;
  }

  .command-palette__item:hover .command-palette__item-arrow,
  .command-palette__item--selected .command-palette__item-arrow {
    opacity: 1;
  }

  .command-palette__status,
  .command-palette__empty {
    min-height: 220px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--theme-text-dim);
    font-size: var(--font-size-min, 14px);
    text-align: center;
  }

  .command-palette__empty {
    flex-direction: column;
    gap: 10px;
    padding: 24px;
  }

  .command-palette__empty-icon {
    width: 48px;
    height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--theme-stroke);
    border-radius: 14px;
    background: var(--theme-card-bg);
    color: var(--theme-text-dim);
    font-size: var(--font-size-lg);
  }

  .command-palette__empty strong {
    color: var(--theme-text);
    font-size: var(--font-size-base);
  }

  .command-palette__footer {
    min-height: 50px;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 20px;
    padding: 8px 18px;
    border-top: 1px solid var(--theme-stroke);
    background: color-mix(
      in srgb,
      var(--theme-card-bg) 72%,
      var(--theme-panel-bg)
    );
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 12px);
  }

  .command-palette__footer span {
    display: flex;
    align-items: center;
    gap: 5px;
  }

  .command-palette__footer kbd {
    min-width: 24px;
    min-height: 24px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0 6px;
    border: 1px solid var(--theme-stroke-strong);
    border-bottom-width: 2px;
    border-radius: 6px;
    background: var(--theme-card-bg);
    color: var(--theme-text);
    font-family: ui-monospace, "SFMono-Regular", "Cascadia Code", monospace;
    font-size: var(--font-size-compact, 12px);
  }

  @media (min-width: 2600px) {
    :global(dialog.command-palette-modal[data-size="lg"]) {
      width: min(72rem, calc(100vw - 4rem));
      height: min(64dvh, 64rem);
    }

    :global(dialog.command-palette-modal .header-title) {
      font-size: 1.75rem;
    }

    :global(dialog.command-palette-modal .header-subtitle),
    .command-search :global(.panel-search__input),
    .command-palette__item-label {
      font-size: 1.25rem;
    }

    .command-palette__item-description {
      font-size: 1rem;
    }

    .command-search :global(.panel-search__input) {
      min-height: 4.25rem;
    }

    .command-palette__category-label,
    .command-palette__footer,
    .command-palette__footer kbd {
      font-size: 1rem;
    }

    .command-palette__item {
      min-height: 5.125rem;
      padding: 0.875rem 1.125rem;
    }

    .command-palette__item-icon {
      width: 3.25rem;
      height: 3.25rem;
      font-size: 1.25rem;
    }
  }

  @media (max-width: 640px) {
    .command-palette__footer {
      display: none;
    }

    .command-search {
      padding: 12px 0 8px;
    }

    .command-search :global(.panel-search) {
      padding: 0 12px;
    }

    .command-search :global(.panel-search__icon) {
      left: 28px;
    }

    .command-search :global(.panel-search__trailing) {
      display: none;
    }

    .command-search :global(.panel-search__input) {
      min-height: 52px;
      padding-right: 12px;
    }

    .command-palette__results {
      padding-inline: 8px;
      padding-bottom: calc(16px + env(safe-area-inset-bottom, 0px));
    }

    .command-palette__item {
      min-height: 64px;
      gap: 10px;
      padding: 10px;
    }

    .command-palette__item-description {
      display: -webkit-box;
      overflow: hidden;
      white-space: normal;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
    }

    .command-palette__item-shortcut,
    .command-palette__item-arrow {
      display: none;
    }
  }

  @media (max-width: 520px) {
    :global(dialog.command-palette-modal[data-size="lg"]) {
      width: 100%;
      height: var(--viewport-height, 100dvh);
      max-height: var(--viewport-height, 100dvh);
      margin: 0;
      border: none;
      border-radius: 0;
    }

    :global(dialog.command-palette-modal .close-btn) {
      width: 44px;
      height: 44px;
      min-width: 44px;
      min-height: 44px;
    }
  }

  @media (max-height: 520px) and (min-width: 521px) {
    :global(dialog.command-palette-modal[data-size="lg"]) {
      width: min(46rem, calc(100vw - 1rem));
      height: calc(100dvh - 1rem);
      max-height: calc(100dvh - 1rem);
      margin: auto;
    }

    :global(dialog.command-palette-modal .modal-header) {
      gap: 10px;
      padding: 8px 14px;
    }

    :global(dialog.command-palette-modal .header-icon) {
      width: 36px;
      height: 36px;
      min-width: 36px;
      min-height: 36px;
    }

    :global(dialog.command-palette-modal .close-btn) {
      width: 44px;
      height: 44px;
      min-width: 44px;
      min-height: 44px;
    }

    :global(dialog.command-palette-modal .header-subtitle),
    .command-palette__footer {
      display: none;
    }

    .command-search {
      padding-block: 8px 4px;
    }

    .command-search :global(.panel-search__input) {
      min-height: 44px;
    }

    .command-palette__item {
      min-height: 48px;
      padding-block: 5px;
    }

    .command-palette__item-icon {
      width: 34px;
      height: 34px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .command-palette__item,
    .command-palette__item-arrow {
      transition: none;
    }
  }
</style>
