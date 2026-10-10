<!--
  AsyncSuggestionCombobox — the owner for "type a few letters, wait, pick one"
  inputs.

  Everything generic lives here: the debounce, the stale-response guard, the
  arrow/Enter/Escape keyboard model, the fixed-position dropdown math, the
  combobox/listbox ARIA wiring, and the live region. Callers supply a data
  source and a row, and get the interaction for free.

  What a caller owns:
    search / getKey / getLabel / onSelect  — the data
    row / empty                            — how a suggestion looks
    ariaLabel / listLabel / announceCount  — what it is called

  What this component owns and callers must not re-implement: request
  sequencing, focus and blur timing, the active-option model, and the input
  chrome (icon, spinner, clear button).

  Home and End are deliberately left to the browser. The ARIA APG lists them as
  optional for an editable combobox, and hijacking them would take working
  text-editing keys away from every user to add a redundant way to reach the
  first and last option.
-->
<script lang="ts" generics="T">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { getHapticFeedback } from "#lib/shared/application/get-haptic-feedback.js";
  import { onDestroy, type Snippet } from "svelte";

  interface RowState {
    index: number;
    active: boolean;
    selected: boolean;
  }

  interface Props {
    /** Runs after the debounce, once the query clears `minQueryLength`. */
    search: (query: string) => Promise<T[]>;
    /** Stable key for the `{#each}` and the option element ids. */
    getKey: (item: T) => string;
    /** Text written into the input when this item is chosen. */
    getLabel: (item: T) => string;
    onSelect: (item: T) => void;
    /** One suggestion row, rendered inside the option button. */
    row: Snippet<[T, RowState]>;
    /** Names the input for assistive tech. Required — there is no sane default. */
    ariaLabel: string;
    /** Marks an item as the current selection (check mark, `aria-selected`). */
    isSelected?: (item: T) => boolean;
    /** Fired when the clear button empties the input. */
    onClear?: () => void;
    /**
     * Replaces the default "nothing found" block. Receives the last search
     * error, or null when the search succeeded and simply matched nothing, so
     * a caller can tell "no such city" apart from "Places is unreachable".
     */
    empty?: Snippet<[unknown]>;
    /**
     * Rendered inside the results panel, below the scrolling list and outside
     * the listbox. Exists for marks that must accompany the data they describe
     * — a data provider's required attribution is hidden by the panel if it
     * lives in the caller's own layout, because the panel is drawn over it.
     */
    listFooter?: Snippet;
    emptyMessage?: string;
    /** Announced and shown when the search itself failed. */
    errorMessage?: string;
    /** Live-region text once results land. */
    announceCount?: (count: number) => string;
    listLabel?: string;
    name?: string;
    placeholder?: string;
    /** Pre-fills the input, until the user clears it by hand. */
    selectedLabel?: string;
    disabled?: boolean;
    useFixedPosition?: boolean;
    inlineResults?: boolean;
    autofocus?: boolean;
    minQueryLength?: number;
    debounceMs?: number;
  }

  let {
    search,
    getKey,
    getLabel,
    onSelect,
    row,
    ariaLabel,
    isSelected = () => false,
    onClear,
    empty,
    listFooter,
    emptyMessage = "No results found",
    errorMessage = "Search failed. Try again.",
    announceCount = (count: number) =>
      `${count} result${count === 1 ? "" : "s"} found`,
    listLabel = "Search results",
    name = "combobox-query",
    placeholder = "Search...",
    selectedLabel = "",
    disabled = false,
    useFixedPosition = false,
    inlineResults = false,
    autofocus = false,
    minQueryLength = 2,
    debounceMs = 300,
  }: Props = $props();

  let inputElement: HTMLInputElement | undefined = $state();
  let dropdownStyle = $state("");
  const componentId = $props.id();
  const resultsId = `${componentId}-results`;

  let searchQuery = $state("");
  let searchResults = $state<T[]>([]);
  let isSearching = $state(false);
  let showResults = $state(false);
  let activeIndex = $state(-1);
  let searchTimeout: number | null = null;
  let searchRequestId = 0;
  let wasCleared = $state(false);
  // The last search's failure, or null. Rendering a failed search as "nothing
  // found" tells the user their query matched nothing when in fact nobody
  // looked, which sends them off editing a query that was never the problem.
  let searchError = $state<unknown>(null);
  // Held while an IME is mid-composition. `event.isComposing` covers the input
  // events, but a keystroke that ends composition can arrive without it.
  let isComposing = $state(false);

  const activeResultId = $derived(
    showResults && activeIndex >= 0
      ? `${resultsId}-option-${activeIndex}`
      : undefined
  );

  const hapticService = getHapticFeedback();

  $effect(() => {
    if (autofocus && inputElement && !disabled) {
      // Small delay to ensure DOM is ready after transitions
      requestAnimationFrame(() => {
        inputElement?.focus();
      });
    }
  });

  // Pre-fill from the caller's current selection, unless the user cleared it.
  $effect(() => {
    if (selectedLabel && !searchQuery && !wasCleared) {
      searchQuery = selectedLabel;
    }
  });

  function runSearch() {
    const requestId = ++searchRequestId;
    if (searchTimeout) {
      clearTimeout(searchTimeout);
      searchTimeout = null;
    }

    if (wasCleared && searchQuery) {
      wasCleared = false;
    }

    const q = searchQuery.trim();

    if (!q || q.length < minQueryLength) {
      searchResults = [];
      searchError = null;
      showResults = false;
      activeIndex = -1;
      isSearching = false;
      return;
    }

    searchTimeout = window.setTimeout(async () => {
      isSearching = true;
      try {
        const results = await search(q);
        if (requestId !== searchRequestId) return;
        searchError = null;
        searchResults = results;
        showResults = true;
        activeIndex = -1;
        if (!inlineResults) {
          updateDropdownPosition();
        }
      } catch (error) {
        if (requestId !== searchRequestId) return;
        console.error("Suggestion search failed:", error);
        searchError = error;
        searchResults = [];
        showResults = true;
        activeIndex = -1;
        if (!inlineResults) {
          updateDropdownPosition();
        }
      } finally {
        if (requestId === searchRequestId) {
          isSearching = false;
          searchTimeout = null;
        }
      }
    }, debounceMs);
  }

  function handleSearchInput(event: Event & { currentTarget: HTMLInputElement }) {
    // Half-composed text is not a query. Searching "ｋ" on the way to "京都"
    // burns a request per keystroke and shows results for a syllable the user
    // never asked about. `compositionend` runs the search once the word exists.
    if ((event as InputEvent).isComposing || isComposing) return;
    runSearch();
  }

  function handleCompositionStart() {
    isComposing = true;
  }

  function handleCompositionEnd() {
    isComposing = false;
    runSearch();
  }

  function handleSelect(item: T) {
    searchRequestId++;
    if (searchTimeout) clearTimeout(searchTimeout);
    hapticService?.trigger("selection");
    searchQuery = getLabel(item);
    showResults = false;
    searchResults = [];
    activeIndex = -1;
    isSearching = false;
    onSelect(item);
  }

  function setActiveIndex(index: number): void {
    if (searchResults.length === 0) {
      activeIndex = -1;
      return;
    }

    activeIndex = (index + searchResults.length) % searchResults.length;
    requestAnimationFrame(() => {
      document
        .getElementById(`${resultsId}-option-${activeIndex}`)
        ?.scrollIntoView({ block: "nearest" });
    });
  }

  function handleInputKeydown(event: KeyboardEvent): void {
    // A keystroke that commits an IME composition must not also move the
    // active option or submit one.
    if (event.isComposing || isComposing) return;

    if (
      !showResults &&
      (event.key === "ArrowDown" || event.key === "ArrowUp") &&
      searchResults.length > 0
    ) {
      showResults = true;
    }

    if (!showResults) return;

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActiveIndex(activeIndex + 1);
        break;
      case "ArrowUp":
        event.preventDefault();
        setActiveIndex(
          activeIndex <= 0 ? searchResults.length - 1 : activeIndex - 1
        );
        break;
      case "Enter": {
        const activeResult = searchResults[activeIndex];
        if (!activeResult) return;
        event.preventDefault();
        handleSelect(activeResult);
        break;
      }
      case "Escape":
        event.preventDefault();
        event.stopPropagation();
        showResults = false;
        activeIndex = -1;
        break;
    }
  }

  function updateDropdownPosition() {
    if (!useFixedPosition || !inputElement) {
      dropdownStyle = "";
      return;
    }
    // Physical `left`/`width` are correct in both writing directions here: the
    // panel spans the input exactly, so there is no inline-start offset to
    // mirror. The panel's own contents lay out with logical properties.
    const rect = inputElement.getBoundingClientRect();
    dropdownStyle = `position: fixed; top: ${rect.bottom + 8}px; left: ${rect.left}px; width: ${rect.width}px;`;
  }

  function handleFocus() {
    if (searchResults.length > 0) {
      showResults = true;
      if (!inlineResults) {
        updateDropdownPosition();
      }
    }
  }

  function handleBlur() {
    if (inlineResults) {
      return;
    }
    setTimeout(() => {
      showResults = false;
      activeIndex = -1;
    }, 200);
  }

  function clearSelection() {
    searchRequestId++;
    if (searchTimeout) clearTimeout(searchTimeout);
    hapticService?.trigger("selection");
    wasCleared = true;
    searchQuery = "";
    searchResults = [];
    showResults = false;
    activeIndex = -1;
    isSearching = false;
    onClear?.();
  }

  onDestroy(() => {
    searchRequestId++;
    if (searchTimeout) clearTimeout(searchTimeout);
  });
</script>

{#snippet resultsPanel()}
  <div
    class="search-results"
    class:fixed-position={useFixedPosition}
    class:inline={inlineResults}
    style={inlineResults ? "" : dropdownStyle}
  >
  <div id={resultsId} class="results-list" role="listbox" aria-label={listLabel}>
    {#if searchResults.length > 0}
      {#each searchResults as item, index (getKey(item))}
        <button
          id="{resultsId}-option-{index}"
          type="button"
          class="result-item"
          class:selected={isSelected(item)}
          class:active={index === activeIndex}
          role="option"
          aria-selected={isSelected(item)}
          tabindex="-1"
          onclick={() => handleSelect(item)}
          onmouseenter={() => {
            activeIndex = index;
          }}
        >
          {@render row(item, {
            index,
            active: index === activeIndex,
            selected: isSelected(item),
          })}
        </button>
      {/each}
    {:else}
      <div class="no-results">
        {#if empty}
          {@render empty(searchError)}
        {:else if searchError}
          <i class="fas fa-triangle-exclamation" aria-hidden="true"></i>
          {errorMessage}
        {:else}
          <i class="fas fa-magnifying-glass" aria-hidden="true"></i>
          {emptyMessage}
        {/if}
      </div>
    {/if}
  </div>
    {#if listFooter}
      <!-- Outside the listbox: a listbox's children are options, and a mark
           announced as one would be selectable. -->
      <div class="results-footer">{@render listFooter()}</div>
    {/if}
  </div>
{/snippet}

<div class="suggestion-combobox" role="search">
  <div class="search-input-wrapper">
    <i class="fas fa-search search-icon" aria-hidden="true"></i>
    <input
      type="search"
      class="search-input"
      {name}
      bind:this={inputElement}
      bind:value={searchQuery}
      oninput={handleSearchInput}
      onkeydown={handleInputKeydown}
      oncompositionstart={handleCompositionStart}
      oncompositionend={handleCompositionEnd}
      onfocus={handleFocus}
      onblur={handleBlur}
      {placeholder}
      {disabled}
      autocomplete="off"
      role="combobox"
      aria-autocomplete="list"
      aria-expanded={showResults}
      aria-controls={showResults ? resultsId : undefined}
      aria-activedescendant={activeResultId}
      aria-label={ariaLabel}
      data-1p-ignore
      data-lpignore="true"
      data-form-type="other"
    />
    {#if isSearching}
      <i class="fas fa-spinner fa-spin loading-icon" aria-hidden="true"></i>
    {:else if searchQuery && !disabled}
      <button
        type="button"
        class="clear-btn"
        onclick={clearSelection}
        aria-label="{t('browse_clear_search')}"
      >
        <i class="fas fa-times" aria-hidden="true"></i>
      </button>
    {/if}
  </div>

  <!-- Screen reader status announcement -->
  <div class="sr-only" role="status" aria-live="polite" aria-atomic="true">
    {#if isSearching}
      {t('search_searching')}
    {:else if showResults && searchResults.length > 0}
      {announceCount(searchResults.length)}
    {:else if showResults && searchResults.length === 0 && searchQuery.length >= minQueryLength}
      {searchError ? errorMessage : emptyMessage}
    {/if}
  </div>

  {#if showResults && (searchResults.length > 0 || (searchQuery.length >= minQueryLength && !isSearching))}
    {@render resultsPanel()}
  {/if}
</div>

<style>
  /* Screen reader only - visually hidden but accessible */
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  .suggestion-combobox {
    position: relative;
    width: 100%;
  }

  .search-input-wrapper {
    position: relative;
    display: flex;
    align-items: center;
  }

  .search-icon {
    position: absolute;
    inset-inline-start: 16px;
    color: rgba(255, 255, 255, 0.75);
    font-size: var(--font-size-sm);
    pointer-events: none;
  }

  .loading-icon {
    position: absolute;
    inset-inline-end: 16px;
    color: var(--theme-text-dim);
    font-size: var(--font-size-sm);
  }

  .clear-btn {
    position: absolute;
    inset-inline-end: 0;
    width: var(--min-touch-target);
    height: var(--min-touch-target);
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    border-radius: 50%;
    color: var(--theme-text-dim);
    cursor: pointer;
    transition: all var(--duration-fast) ease;
    z-index: 2;
  }

  .clear-btn::before {
    content: "";
    position: absolute;
    width: 28px;
    height: 28px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 50%;
    transition: all var(--duration-fast) ease;
  }

  .clear-btn:hover::before {
    background: rgba(255, 255, 255, 0.2);
  }

  .clear-btn:hover {
    color: white;
  }

  .clear-btn i {
    position: relative;
    z-index: 1;
  }

  .search-input {
    width: 100%;
    min-height: var(--min-touch-target);
    padding: 0 48px;
    background: var(
      --theme-card-bg,
      linear-gradient(135deg, #2d2d3a 0%, #25252f 100%)
    );
    border: 2px solid var(--theme-stroke, var(--theme-stroke-strong));
    border-radius: 12px;
    color: var(--theme-text);
    font-size: var(--font-size-sm);
    transition: all var(--duration-normal) ease;
    box-shadow: var(--theme-shadow, none);
  }

  .search-input:focus {
    outline: none;
    border-color: var(--theme-accent, var(--theme-accent));
    box-shadow: 0 0 0 3px
      color-mix(in srgb, var(--theme-accent) 20%, transparent);
  }

  .search-input::placeholder {
    color: rgba(255, 255, 255, 0.75);
  }

  .search-input::-webkit-search-cancel-button {
    display: none;
    appearance: none;
  }

  .search-input:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Search Results */
  .search-results {
    position: absolute;
    top: calc(100% + 8px);
    inset-inline: 0;
    display: flex;
    flex-direction: column;
    background: var(
      --theme-panel-bg,
      linear-gradient(135deg, #2d2d3a 0%, #25252f 100%)
    );
    border: 2px solid var(--theme-stroke, var(--theme-stroke-strong));
    border-radius: 12px;
    overflow: hidden;
    z-index: 100;
    box-shadow: var(--theme-shadow, 0 8px 24px rgba(0, 0, 0, 0.5));
  }

  /* The scroll lives on the list, not the panel, so a footer stays put while
     the options move under it. */
  .results-list {
    max-height: 320px;
    overflow-y: auto;
  }

  .search-results:not(.inline) .results-list {
    scrollbar-width: thin;
    scrollbar-color: var(--scrollbar-thumb) var(--scrollbar-track);
  }

  .search-results:not(.inline) .results-list::-webkit-scrollbar {
    width: 8px;
  }

  .search-results:not(.inline) .results-list::-webkit-scrollbar-track {
    background: var(--scrollbar-track, transparent);
  }

  .search-results:not(.inline) .results-list::-webkit-scrollbar-thumb {
    background: var(--scrollbar-thumb, rgba(255, 255, 255, 0.2));
    border-radius: 4px;
  }

  .search-results:not(.inline) .results-list::-webkit-scrollbar-thumb:hover {
    background: var(--scrollbar-thumb-hover, rgba(255, 255, 255, 0.35));
  }

  .results-footer {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
    padding: 8px 16px;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(0, 0, 0, 0.15);
  }

  .search-results.fixed-position {
    z-index: var(--z-dropdown);
  }

  .search-results.inline {
    position: relative;
    top: auto;
    inset-inline: auto;
    margin-top: 12px;
  }

  .result-item {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: var(--min-touch-target);
    padding: 10px 16px;
    background: transparent;
    border: none;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    cursor: pointer;
    transition: all var(--duration-fast) ease;
    text-align: start;
  }

  .result-item:last-child {
    border-bottom: none;
  }

  .result-item:hover,
  .result-item.active {
    background: color-mix(in srgb, var(--theme-accent) 15%, transparent);
  }

  .result-item.selected {
    background: color-mix(in srgb, var(--theme-accent) 20%, transparent);
  }

  .no-results {
    padding: 32px 16px;
    text-align: center;
    color: rgba(255, 255, 255, 0.75);
    font-size: var(--font-size-sm);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
  }

  /* The icon comes from the caller's `empty` snippet, so it is out of this
     component's scope and needs :global — bounded to .no-results. */
  .no-results :global(i) {
    font-size: var(--font-size-3xl);
    opacity: 0.5;
  }
</style>
