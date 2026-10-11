<!--
  ExpandableSearchBar - Collapsible search input for sequence filtering

  - Shows as magnifying glass icon when collapsed
  - Expands to search input on click
  - Native keyboard on every device (the TKA virtual keyboard was retired
    from browse search — the gallery drill's plain search input set the
    standard, and the notation keyboard belongs to spelling flows, not
    filtering)
  - Auto-collapses on blur when empty
-->
<script lang="ts">
  import { onMount } from "svelte";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";

  interface Props {
    onSearch: (query: string) => void;
    onClear?: () => void;
    placeholder?: string;
    value?: string;
    /** Stable form-field name for browser tooling and autofill heuristics. */
    name?: string;
    /** Edge that stays fixed while the collapsed control expands. */
    expansionAnchor?: "start" | "end";
  }

  let {
    onSearch,
    onClear,
    placeholder = "Search...",
    value = "",
    name = "search",
    expansionAnchor = "start",
  }: Props = $props();

  // Local state - initialized empty; the $effect below syncs the prop value
  // on mount (and on subsequent changes) to avoid capturing the initial prop
  // value outside a reactive context (svelte state_referenced_locally).
  let isExpanded = $state(false);
  let inputValue = $state("");
  let inputRef: HTMLInputElement | null = $state(null);
  let containerRef: HTMLDivElement | null = $state(null);
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let collapseTimer: ReturnType<typeof setTimeout> | null = null;
  let focusTimer: ReturnType<typeof setTimeout> | null = null;

  // Track the last value received from the parent to avoid reset loops
  let lastSyncedValue = "";

  // Sync internal state with external value prop
  $effect(() => {
    if (value !== lastSyncedValue) {
      inputValue = value;
      lastSyncedValue = value;
      if (value.trim() && !isExpanded) {
        isExpanded = true;
      }
    }
  });

  const SEARCH_DEBOUNCE_MS = 250;
  const COLLAPSE_DELAY_MS = 150;

  // Expand and focus input
  function handleExpand(event: MouseEvent) {
    event.stopPropagation();
    isExpanded = true;
    if (focusTimer) clearTimeout(focusTimer);
    focusTimer = setTimeout(() => inputRef?.focus(), 0);
  }

  function handleCollapse() {
    if (collapseTimer) clearTimeout(collapseTimer);
    collapseTimer = setTimeout(() => {
      if (!inputValue.trim()) {
        isExpanded = false;
      }
    }, COLLAPSE_DELAY_MS);
  }

  function handleInput() {
    // When typing manually, we update lastSyncedValue to prevent the effect from resetting us
    lastSyncedValue = inputValue;
    triggerSearch();
  }

  function triggerSearch() {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(() => {
      onSearch(inputValue.trim());
    }, SEARCH_DEBOUNCE_MS);
  }

  function handleClear() {
    inputValue = "";
    lastSyncedValue = "";
    onSearch("");
    onClear?.();
    inputRef?.blur();
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      handleClear();
      isExpanded = false;
    } else if (event.key === "Enter") {
      inputRef?.blur();
    }
  }

  function handlePointerDownOutside(event: PointerEvent) {
    if (
      containerRef &&
      !containerRef.contains(event.target as Node) &&
      !inputValue.trim()
    ) {
      isExpanded = false;
    }
  }

  onMount(() => {
    document.addEventListener("pointerdown", handlePointerDownOutside, true);
    return () => {
      document.removeEventListener(
        "pointerdown",
        handlePointerDownOutside,
        true
      );
      if (debounceTimer) clearTimeout(debounceTimer);
      if (collapseTimer) clearTimeout(collapseTimer);
      if (focusTimer) clearTimeout(focusTimer);
    };
  });
</script>

<div
  class="search-container"
  class:expanded={isExpanded}
  class:anchor-end={expansionAnchor === "end"}
  bind:this={containerRef}
  role="search"
>
  <button
    class="search-button"
    onclick={handleExpand}
    type="button"
    aria-label={t("browse_open_search")}
    aria-expanded={isExpanded}
    aria-hidden={isExpanded}
    tabindex={isExpanded ? -1 : 0}
  >
    <i class="fas fa-search" aria-hidden="true"></i>
  </button>

  <div class="search-input-wrapper" aria-hidden={!isExpanded}>
    <i class="fas fa-search search-icon" aria-hidden="true"></i>
    <input
      type="text"
      {name}
      class="search-input"
      bind:this={inputRef}
      bind:value={inputValue}
      oninput={handleInput}
      onkeydown={handleKeydown}
      onblur={handleCollapse}
      {placeholder}
      aria-label={t("browse_search_sequences")}
      tabindex={isExpanded ? 0 : -1}
    />
    {#if inputValue}
      <button
        class="clear-button"
        onclick={handleClear}
        type="button"
        aria-label={t("browse_clear_search")}
        tabindex={isExpanded ? 0 : -1}
      >
        <i class="fas fa-times" aria-hidden="true"></i>
      </button>
    {/if}
  </div>
</div>

<style>
  .search-container {
    --control-height: var(--min-touch-target);
    position: relative;
    display: flex;
    align-items: center;
    height: var(--control-height);
    width: var(--control-height);
    overflow: visible;
    flex-shrink: 0;
    z-index: 10;
  }

  .search-container.expanded {
    z-index: var(--z-dropdown);
  }

  .search-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--control-height);
    height: var(--control-height);
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 12px;
    color: var(--theme-text-dim);
    font-size: var(--font-size-base);
    cursor: pointer;
    transition:
      opacity var(--transition-fast),
      transform var(--transition-spring),
      background var(--transition-fast),
      color var(--transition-fast),
      border-color var(--transition-fast);
    flex-shrink: 0;
  }

  .search-container.expanded .search-button {
    opacity: 0;
    transform: scale(0.82);
    pointer-events: none;
  }

  .search-button:hover {
    background: var(--theme-card-hover-bg);
    color: var(--theme-text);
  }

  .search-button:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  .search-input-wrapper {
    position: absolute;
    inset-inline-start: 0;
    display: flex;
    align-items: center;
    width: clamp(200px, 40vw, 400px);
    height: var(--control-height);
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 12px;
    padding: 0 12px;
    gap: 8px;
    opacity: 0;
    transform: translateX(-0.75rem) scale(0.94);
    transform-origin: left center;
    pointer-events: none;
    transition:
      opacity var(--transition-fast),
      transform var(--transition-spring),
      border-color var(--transition-fast);
  }

  .search-container.expanded .search-input-wrapper {
    opacity: 1;
    transform: translateX(0) scale(1);
    pointer-events: auto;
  }

  .search-container.anchor-end .search-input-wrapper {
    inset-inline-start: auto;
    inset-inline-end: 0;
    transform: translateX(0.75rem) scale(0.94);
    transform-origin: right center;
  }

  .search-container.anchor-end.expanded .search-input-wrapper {
    transform: translateX(0) scale(1);
  }

  .search-input-wrapper:focus-within {
    border-color: var(--theme-accent);
  }

  .search-icon {
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact);
    flex-shrink: 0;
  }

  .search-input {
    flex: 1;
    min-width: 0;
    height: 100%;
    background: transparent;
    border: none;
    outline: none;
    color: var(--theme-text);
    font-size: var(--font-size-min, 14px);
    font-family: inherit;
  }

  .search-input::placeholder {
    color: var(--theme-text-dim);
    opacity: 0.7;
  }

  .clear-button {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    background: transparent;
    border: none;
    border-radius: 50%;
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact);
    cursor: pointer;
    transition:
      background var(--transition-fast),
      color var(--transition-fast),
      transform var(--transition-spring);
    flex-shrink: 0;
  }

  .clear-button::after {
    content: "";
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    min-width: var(--min-touch-target);
    min-height: var(--min-touch-target);
  }

  .clear-button:hover {
    background: color-mix(in srgb, var(--theme-text) 10%, transparent);
    color: var(--theme-text);
  }

  .clear-button:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 1px;
  }

  @media (max-width: 640px) {
    .search-input-wrapper {
      width: clamp(160px, 50vw, 300px);
    }

    .search-input-wrapper {
      padding: 0 10px;
      gap: 6px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .search-button,
    .search-input-wrapper,
    .clear-button {
      transition: none;
    }

    .search-container.expanded .search-button,
    .search-container.expanded .search-input-wrapper {
      transform: none;
    }
  }
</style>
