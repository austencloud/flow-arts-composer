<!--
  BrowseToolbar - Unified sort dropdown + search + result count + optional source toggle.
  Replaces both SequenceTopBarControls (gallery) and PickerToolbar (picker).

  Layout (left to right):
  1. Source toggle (if showSourceToggle && engine.canSwitchSource)
  2. Sort dropdown — trigger chip + popover with 4 options
  3. ExpandableSearchBar
  4. Result count (right-aligned, tabular-nums)
-->
<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import type { BrowseEngine } from "../engine/types";
  import { BrowseSortMethod } from "$lib/shared/browse/domain/enums/browse-enums";
  import ExpandableSearchBar from "$lib/shared/browse/components/ExpandableSearchBar.svelte";
  import LevelFilterChip from "$lib/shared/browse/components/filter-chips/LevelFilterChip.svelte";
  import FavoritesFilterChip from "$lib/shared/browse/components/filter-chips/FavoritesFilterChip.svelte";
  import LengthFilterChip from "$lib/shared/browse/components/filter-chips/LengthFilterChip.svelte";
  import LOOPFilterChip from "$lib/shared/browse/components/filter-chips/LOOPFilterChip.svelte";
  import FilterChipBase from "$lib/shared/browse/components/filter-chips/FilterChipBase.svelte";
  import { BrowseFilterType } from "$lib/shared/persistence/domain/enums/filtering-enums";
  import type { SequenceSource } from "../engine/types";
  // Every mutation below changes the visible result set. Routed through the one
  // morph seam so the grid rearranges instead of blinking wherever a host has
  // declared a live results grid (the gallery split pane today); inert
  // everywhere else — see shared/transitions/results-morph.
  import { withResultsMorph } from "$lib/shared/transitions/results-morph";

  interface Props {
    engine: BrowseEngine;
    showSourceToggle?: boolean;
    /** Renders a leading back pill (e.g. "← Start here") inside the toolbar —
     * keeps the back affordance without spending a whole band on it. */
    onBack?: () => void;
    backLabel?: string;
    /** Hide the inline search (host provides its own entry point, e.g. the
     * drill front door's search field). */
    hideSearch?: boolean;
    /** Bottom-sheet filter pattern: renders a Filters pill (with active-count
     * badge) and hides the inline selector chips — the sheet owns them. */
    onOpenFilters?: () => void;
    /** The host already owns a complete filter surface (the gallery split
     * pane's left column), so the inline selector chips would be a second,
     * contradicting copy of it. Sort, zoom and the count stay. */
    hideFilterChips?: boolean;
    /** Enters multi-selection mode. Kept host-owned because only personal
     * library surfaces can file a selection into collections. */
    onEnterSelection?: () => void;
    /** Names the host pool's own order and offers it as a sort option (e.g.
     * "Collection order"). Omit and no Curated option appears. */
    curatedSortLabel?: string;
    /** Panel is the original self-contained strip. Embedded lets a host page
     * supply the surrounding surface while this component keeps the controls. */
    variant?: "panel" | "embedded";
    /** Host-visible total for contextual counts such as "10 of 15 shown". */
    resultTotal?: number;
  }

  let {
    engine,
    showSourceToggle = false,
    onBack,
    backLabel = "Start here",
    hideSearch = false,
    onOpenFilters,
    hideFilterChips = false,
    onEnterSelection,
    curatedSortLabel,
    variant = "panel",
    resultTotal,
  }: Props = $props();

  const activeUserFilterCount = $derived(
    engine.allFilterChips.filter((c) => !c.locked).length
  );

  // Sort dropdown state

  interface SortOption {
    id: BrowseSortMethod;
    label: string;
    shortLabel: string;
    icon: string;
  }

  const SORT_OPTIONS: SortOption[] = [
    {
      id: BrowseSortMethod.ALPHABETICAL,
      label: "A-Z",
      shortLabel: "A-Z",
      icon: "fa-font",
    },
    {
      id: BrowseSortMethod.DATE_ADDED,
      label: "Recent",
      shortLabel: "Recent",
      icon: "fa-clock",
    },
    {
      id: BrowseSortMethod.DIFFICULTY_LEVEL,
      label: "Level",
      shortLabel: "Level",
      icon: "fa-signal",
    },
    {
      id: BrowseSortMethod.SEQUENCE_LENGTH,
      label: "Length",
      shortLabel: "Length",
      icon: "fa-ruler",
    },
  ];

  let sortOpen = $state(false);
  let sortVisible = $state(false);
  let sortTriggerEl: HTMLButtonElement | null = $state(null);
  let sortPopoverEl: HTMLDivElement | null = $state(null);
  let focusedIndex = $state(-1);

  const EXIT_ANIMATION_MS = 180;

  const isHandsMode = $derived(engine.viewMode.subject === "hands");

  const visibleSortOptions = $derived.by(() => {
    const base = isHandsMode
      ? SORT_OPTIONS.filter((o) => o.id !== BrowseSortMethod.DIFFICULTY_LEVEL)
      : SORT_OPTIONS;
    // A host-provided pool can carry its own meaningful order (a collection's
    // curated one). Only that host offers it, and it leads — it is the default.
    return curatedSortLabel
      ? [
          {
            id: BrowseSortMethod.CURATED,
            label: curatedSortLabel,
            shortLabel: curatedSortLabel,
            icon: "fa-list-ol",
          },
          ...base,
        ]
      : base;
  });

  const currentSortOption = $derived.by((): SortOption => {
    return (
      visibleSortOptions.find((o) => o.id === engine.sortMethod) ??
      visibleSortOptions[0]!
    );
  });

  function openSort() {
    sortOpen = true;
    focusedIndex = visibleSortOptions.findIndex(
      (o) => o.id === engine.sortMethod
    );
    if (focusedIndex < 0) focusedIndex = 0;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        sortVisible = true;
        focusSortOptionAt(focusedIndex);
      });
    });
  }

  function closeSort() {
    sortVisible = false;
    focusedIndex = -1;
    setTimeout(() => {
      sortOpen = false;
    }, EXIT_ANIMATION_MS);
  }

  function focusSortOptionAt(index: number) {
    if (!sortPopoverEl) return;
    const options =
      sortPopoverEl.querySelectorAll<HTMLButtonElement>('[role="option"]');
    options[index]?.focus();
  }

  function handleSortToggle() {
    if (sortOpen) closeSort();
    else openSort();
  }

  function handleSortSelect(method: BrowseSortMethod) {
    withResultsMorph(() => engine.setSort(method, engine.sortDirection));
    closeSort();
  }

  function handleSortKeydown(event: KeyboardEvent) {
    if (!sortOpen) return;
    switch (event.key) {
      case "Escape":
        event.stopPropagation();
        closeSort();
        sortTriggerEl?.focus();
        break;
      case "ArrowDown": {
        event.preventDefault();
        const next = (focusedIndex + 1) % visibleSortOptions.length;
        focusedIndex = next;
        focusSortOptionAt(next);
        break;
      }
      case "ArrowUp": {
        event.preventDefault();
        const prev =
          (focusedIndex - 1 + visibleSortOptions.length) %
          visibleSortOptions.length;
        focusedIndex = prev;
        focusSortOptionAt(prev);
        break;
      }
      case "Home":
        event.preventDefault();
        focusedIndex = 0;
        focusSortOptionAt(0);
        break;
      case "End":
        event.preventDefault();
        focusedIndex = visibleSortOptions.length - 1;
        focusSortOptionAt(focusedIndex);
        break;
      case "Enter":
      case " ": {
        const focused = visibleSortOptions[focusedIndex];
        if (focused) {
          event.preventDefault();
          handleSortSelect(focused.id);
        }
        break;
      }
    }
  }

  function handlePointerDownOutside(event: PointerEvent) {
    if (!sortOpen) return;
    const target = event.target as Node;
    if (sortTriggerEl?.contains(target) || sortPopoverEl?.contains(target))
      return;
    closeSort();
  }

  // Inline filter state (wide screens only — mirrors BrowseFilterBar)

  const activeLevel = $derived.by(() => {
    const f = engine.activeFilters.get("difficulty");
    return f ? (f.value as number) : null;
  });

  const isFavoritesActive = $derived(engine.activeFilters.has("favorites"));

  const activeLength = $derived.by(() => {
    const f = engine.activeFilters.get("length");
    return f && !f.locked ? (f.value as number) : null;
  });

  const hasLengthConstraint = $derived.by(() => {
    const f = engine.activeFilters.get("length");
    return f?.locked ?? false;
  });

  function handleLevelSelect(level: number | null) {
    withResultsMorph(() => {
      if (level == null) engine.removeFilter("difficulty");
      else
        engine.addFilter(
          BrowseFilterType.DIFFICULTY,
          level,
          `Level ${level}`,
          "var(--semantic-info)"
        );
    });
  }

  function handleFavoritesToggle(active: boolean) {
    withResultsMorph(() => {
      if (active)
        engine.addFilter(
          BrowseFilterType.FAVORITES,
          true,
          "Favorites",
          "#ec4899"
        );
      else engine.removeFilter("favorites");
    });
  }

  function handleLengthSelect(length: number | null) {
    withResultsMorph(() => {
      if (length == null) engine.removeFilter("length");
      else
        engine.addFilter(
          BrowseFilterType.LENGTH,
          length,
          `${length} steps`,
          "#f59e0b"
        );
    });
  }

  // Loop filters live under composite keys ("cap_type:<value>") so several can
  // stack — find by type, not by key. The dropdown shows the first (its
  // single-select semantics replace all loop filters on change).
  const activeLoopComponent = $derived.by(() => {
    for (const f of engine.activeFilters.values()) {
      if (f.type === BrowseFilterType.LOOP_TYPE && !f.locked)
        return f.value as string;
    }
    return null;
  });

  const LOOP_FILTER_COLORS: Record<string, string> = {
    "component:rotated_halved": "#36c3ff",
    "component:rotated_quartered": "#36c3ff",
    "component:mirrored": "#6F2DA8",
    "component:flipped": "#6F2DA8",
    "component:swapped": "#2ecc71",
    "component:inverted": "#eb7d00",
    "component:rewound": "#00bcd4",
  };

  function handleLoopSelect(value: string | null) {
    // removeFilter("cap_type") clears ALL stacked loop filters (prefix-aware) —
    // the dropdown is single-select, so a new pick replaces the whole stack.
    withResultsMorph(() => {
      if (value == null) engine.removeFilter("cap_type");
      else {
        engine.removeFilter("cap_type");
        const label = value.startsWith("component:")
          ? value
              .slice("component:".length)
              .replace(/_/g, " ")
              .replace(/\b\w/g, (c) => c.toUpperCase())
          : value;
        engine.addFilter(
          BrowseFilterType.LOOP_TYPE,
          value,
          label,
          LOOP_FILTER_COLORS[value] ?? "#8b5cf6"
        );
      }
    });
  }

  // Active filters the selector chips don't cover (drill picks: letter,
  // position, owner, recent…) plus locked constraints — rendered as
  // dismissible chips inline, mirroring BrowseFilterBar's merged row.
  const SELECTOR_TYPES = new Set([
    "difficulty",
    "favorites",
    "length",
    "cap_type",
  ]);
  const extraChips = $derived(
    engine.allFilterChips.filter(
      (chip) => chip.locked || !SELECTOR_TYPES.has(String(chip.type))
    )
  );

  function handleDismissChip(typeKey: string) {
    withResultsMorph(() => engine.removeFilter(typeKey));
  }

  function handleClearAll() {
    withResultsMorph(() => engine.clearUserFilters());
  }

  // ---------------------------------------------------------------------------
  // Source toggle
  // ---------------------------------------------------------------------------

  async function handleSourceChange(source: SequenceSource) {
    await engine.setSource(source);
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  onMount(() => {
    document.addEventListener("pointerdown", handlePointerDownOutside, true);
  });

  onDestroy(() => {
    document.removeEventListener("pointerdown", handlePointerDownOutside, true);
  });
</script>

<div class="browse-toolbar" class:embedded={variant === "embedded"}>
  <!-- 0. Leading back pill -->
  {#if onBack}
    <button
      type="button"
      class="back-pill"
      onclick={onBack}
      aria-label={backLabel}
    >
      <i class="fas fa-arrow-left" aria-hidden="true"></i>
      <span class="back-pill-label">{backLabel}</span>
    </button>
  {/if}

  <!-- 1. Source toggle -->
  {#if showSourceToggle && engine.canSwitchSource}
    <div class="source-toggle" role="group" aria-label="Sequence source">
      <button
        type="button"
        class="source-btn"
        class:active={engine.source === "community"}
        onclick={() => handleSourceChange("community")}
        aria-pressed={engine.source === "community"}
      >
        Community
      </button>
      <button
        type="button"
        class="source-btn"
        class:active={engine.source === "my-library"}
        onclick={() => handleSourceChange("my-library")}
        aria-pressed={engine.source === "my-library"}
      >
        My Library
      </button>
    </div>
  {/if}

  <!-- 3. Sort dropdown -->
  <div class="sort-dropdown-wrapper">
    <button
      type="button"
      class="sort-trigger"
      class:open={sortOpen}
      bind:this={sortTriggerEl}
      onclick={handleSortToggle}
      onkeydown={handleSortKeydown}
      aria-haspopup="listbox"
      aria-expanded={sortOpen}
      aria-label="Sort by {currentSortOption.label}"
    >
      <i
        class="fas fa-arrow-down-short-wide sort-trigger-icon"
        aria-hidden="true"
      ></i>
      <span class="sort-trigger-label">{currentSortOption.shortLabel}</span>
      <i
        class="fas fa-chevron-down sort-chevron"
        class:rotated={sortOpen}
        aria-hidden="true"
      ></i>
    </button>

    {#if sortOpen}
      <div
        class="sort-popover"
        class:visible={sortVisible}
        bind:this={sortPopoverEl}
        role="listbox"
        aria-label="Sort options"
        aria-activedescendant={focusedIndex >= 0
          ? `sort-opt-${focusedIndex}`
          : undefined}
        onkeydown={handleSortKeydown}
        tabindex="-1"
      >
        {#each visibleSortOptions as option, i}
          <button
            id="sort-opt-{i}"
            type="button"
            class="sort-option"
            class:selected={engine.sortMethod === option.id}
            class:focused={focusedIndex === i}
            onclick={() => handleSortSelect(option.id)}
            role="option"
            aria-selected={engine.sortMethod === option.id}
            tabindex={focusedIndex === i ? 0 : -1}
            style="transition-delay: {sortVisible ? i * 30 : 0}ms"
          >
            <i class="fas {option.icon} option-icon" aria-hidden="true"></i>
            <span class="option-label">{option.label}</span>
            {#if engine.sortMethod === option.id}
              <i class="fas fa-check check-icon" aria-hidden="true"></i>
            {/if}
          </button>
        {/each}
      </div>
    {/if}
  </div>

  <!-- 3b. Filters pill (bottom-sheet pattern). The result count lives IN the
       pill — a bare number floating at the toolbar's edge read as noise
       (Austen, 2026-07-02); on the button it says "482 behind this filter
       set, tap to tune". Badge = active filter count, number = results. -->
  {#if onOpenFilters}
    <button
      type="button"
      class="filters-pill"
      onclick={onOpenFilters}
      aria-label="Filters — {engine.resultCount}
        {engine.resultCount === 1
        ? 'sequence'
        : 'sequences'}{activeUserFilterCount > 0
        ? `, ${activeUserFilterCount} active`
        : ''}"
    >
      <i class="fas fa-sliders" aria-hidden="true"></i>
      <span class="filters-pill-count">
        {engine.resultCount}<span class="result-count-word"
          >&nbsp;{engine.resultCount === 1 ? "sequence" : "sequences"}</span
        >
      </span>
      {#if activeUserFilterCount > 0}
        <span class="filters-badge">{activeUserFilterCount}</span>
      {/if}
    </button>
    <span class="sr-only" aria-live="polite" aria-atomic="true">
      {engine.resultCount}
      {engine.resultCount === 1 ? "sequence" : "sequences"}
    </span>
  {/if}

  <!-- 4. Inline filter chips (wide screens only; sheet pattern replaces them) -->
  {#if !onOpenFilters && !hideFilterChips}
    <span class="toolbar-divider" aria-hidden="true"></span>
    <div class="inline-filters" role="toolbar" aria-label="Filter options">
      {#if !isHandsMode}
        <LevelFilterChip
          {activeLevel}
          onSelect={handleLevelSelect}
          getFilteredCount={engine.getFilteredCount.bind(engine)}
        />
      {/if}
      <FavoritesFilterChip
        active={isFavoritesActive}
        onToggle={handleFavoritesToggle}
      />
      {#if !hasLengthConstraint}
        <LengthFilterChip
          {activeLength}
          availableLengths={engine.availableLengths as number[]}
          onSelect={handleLengthSelect}
          getFilteredCount={engine.getFilteredCount.bind(engine)}
        />
      {/if}
      <LOOPFilterChip
        activeValue={activeLoopComponent}
        loopTypeCounts={engine.loopTypeCounts}
        onSelect={handleLoopSelect}
      />

      <!-- Keyed by map key, not type — stacked loop filters share a type. -->
      {#each extraChips as chip (chip.key)}
        <span class="active-chip" style="--chip-color: {chip.chipColor};">
          {#if chip.locked}
            <i class="fas fa-lock chip-lock" aria-hidden="true"></i>
          {/if}
          <span class="chip-label">{chip.label}</span>
          {#if !chip.locked}
            <button
              class="chip-dismiss"
              type="button"
              aria-label="Remove filter {chip.label}"
              onclick={(e) => {
                e.stopPropagation();
                handleDismissChip(chip.key);
              }}
            >
              <i class="fas fa-times" aria-hidden="true"></i>
            </button>
          {/if}
        </span>
      {/each}

      {#if engine.hasActiveFilters}
        <button
          class="clear-all-btn"
          type="button"
          onclick={(e) => {
            e.stopPropagation();
            handleClearAll();
          }}
        >
          Clear all
        </button>
      {/if}
    </div>
  {/if}

  {#if onEnterSelection}
    <FilterChipBase
      label="Select"
      icon="fas fa-circle-check"
      mode="action"
      size="sm"
      onclick={onEnterSelection}
    />
  {/if}

  <!-- 4b. Grid zoom (fine pointers only — touch users pinch). Makes the
       hidden Ctrl+scroll density control discoverable on desktop. -->
  <div
    class="zoom-control"
    role="group"
    aria-label="Grid density"
    title="Grid density (Ctrl+scroll also works)"
  >
    <button
      type="button"
      class="zoom-btn"
      onclick={() => engine.zoomIn()}
      disabled={!engine.canZoomIn}
      aria-label="Zoom out: smaller cards, more columns"
    >
      <i class="fas fa-magnifying-glass-minus" aria-hidden="true"></i>
    </button>
    <button
      type="button"
      class="zoom-btn"
      onclick={() => engine.zoomOut()}
      disabled={!engine.canZoomOut}
      aria-label="Zoom in: larger cards, fewer columns"
    >
      <i class="fas fa-magnifying-glass-plus" aria-hidden="true"></i>
    </button>
  </div>

  <!-- 5. ExpandableSearchBar -->
  {#if !hideSearch}
    <div class="search-slot">
      <ExpandableSearchBar
        onSearch={(q) => withResultsMorph(() => engine.setSearch(q))}
        value={engine.searchQuery}
        placeholder="Search sequences..."
        expansionAnchor="end"
      />
    </div>
  {/if}

  <!-- 6. Result count (word drops on narrow screens, number stays).
       Sheet-pattern hosts carry the count inside the Filters pill instead. -->
  {#if !onOpenFilters}
    <span class="result-count" aria-live="polite" aria-atomic="true">
      {#if resultTotal !== undefined && resultTotal !== engine.resultCount}
        {engine.resultCount} of {resultTotal}<span class="result-count-word"
          >&nbsp;shown</span
        >
      {:else}
        {engine.resultCount}<span class="result-count-word"
          >&nbsp;{engine.resultCount === 1 ? "sequence" : "sequences"}</span
        >
      {/if}
    </span>
  {/if}
</div>

<style>
  .browse-toolbar {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm, 8px);
    padding: var(--spacing-sm, 8px) var(--spacing-md, 16px);
    background: var(--theme-panel-bg);
    width: 100%;
    min-height: var(--min-touch-target, 48px);
  }

  /* Collection details already provide the page surface. Leaving the toolbar
     transparent keeps it in the title/grid rhythm instead of drawing a dark
     rectangle across the entire canvas. The controls remain real card
     surfaces, and the divider is the only boundary the row needs. */
  .browse-toolbar.embedded {
    padding: var(--spacing-sm, 8px) var(--spacing-lg, 24px)
      var(--spacing-md, 16px);
    background: transparent;
    border-bottom: 1px solid
      color-mix(in srgb, var(--theme-stroke) 72%, transparent);
  }

  .browse-toolbar.embedded .search-slot {
    flex: 0 0 auto;
  }

  .browse-toolbar.embedded .result-count {
    margin-left: 0;
    padding-inline: var(--spacing-xs, 4px);
    font-weight: 600;
  }

  .back-pill {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 12px;
    min-height: var(--min-touch-target, 48px);
    background: transparent;
    border: 1px solid var(--theme-stroke);
    border-radius: 999px;
    color: var(--theme-text);
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
    transition:
      border-color var(--duration-fast, 150ms) ease,
      background var(--duration-fast, 150ms) ease;
  }

  .back-pill:hover {
    border-color: var(--theme-accent);
    background: color-mix(in srgb, var(--theme-accent) 8%, transparent);
  }

  .back-pill:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  /* ---- Source toggle ---- */
  .source-toggle {
    display: flex;
    align-items: center;
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: var(--border-radius-md, 10px);
    padding: 2px;
    gap: 2px;
    flex-shrink: 0;
  }

  .source-btn {
    padding: 0 var(--spacing-sm, 8px);
    height: calc(var(--min-touch-target, 48px) - 8px);
    min-height: 32px;
    background: transparent;
    border: none;
    border-radius: var(--border-radius-sm, 6px);
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 12px);
    font-weight: 500;
    cursor: pointer;
    white-space: nowrap;
    transition:
      background var(--duration-fast, 150ms) ease,
      color var(--duration-fast, 150ms) ease;
  }

  /* Touch screens get the full target. The 36px button is a mouse size; on a
     phone it sat under the 44px floor while every neighbour met it. */
  @media (pointer: coarse) {
    .source-btn {
      height: var(--min-touch-target, 44px);
    }
  }

  .source-btn:hover {
    color: var(--theme-text);
  }

  .source-btn.active {
    background: var(--theme-accent);
    color: #fff;
  }

  .source-btn:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 1px;
  }

  .sort-dropdown-wrapper {
    position: relative;
    flex-shrink: 0;
  }

  .sort-trigger {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 12px;
    min-height: var(--min-touch-target, 48px);
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: var(--border-radius-md, 10px);
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 12px);
    font-weight: 500;
    cursor: pointer;
    white-space: nowrap;
    transition:
      background var(--duration-fast, 150ms) ease,
      border-color var(--duration-fast, 150ms) ease,
      color var(--duration-fast, 150ms) ease,
      transform var(--duration-fast, 150ms) ease;
  }

  .sort-trigger:hover {
    background: color-mix(in srgb, var(--theme-text) 6%, var(--theme-card-bg));
    color: var(--theme-text);
    border-color: color-mix(
      in srgb,
      var(--theme-stroke) 80%,
      var(--theme-text)
    );
  }

  .sort-trigger:active {
    transform: scale(0.97);
  }

  .sort-trigger.open {
    background: color-mix(
      in srgb,
      var(--theme-accent) 12%,
      var(--theme-card-bg)
    );
    border-color: var(--theme-accent);
    color: var(--theme-text);
  }

  .sort-trigger:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  .sort-trigger-icon {
    font-size: var(--font-size-compact, 12px);
    opacity: 0.7;
  }

  .sort-trigger-label {
    font-weight: 600;
  }

  .sort-chevron {
    font-size: 10px;
    opacity: 0.5;
    transition: transform var(--duration-fast, 150ms)
      cubic-bezier(0.34, 1.2, 0.64, 1);
  }

  .sort-chevron.rotated {
    transform: rotate(180deg);
  }

  .sort-popover {
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    min-width: 160px;
    padding: 4px;
    background: var(--theme-panel-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: var(--border-radius-md, 10px);
    box-shadow:
      0 8px 32px rgba(0, 0, 0, 0.3),
      0 2px 8px rgba(0, 0, 0, 0.2);
    z-index: 100;

    opacity: 0;
    transform: scale(0.92) translateY(-4px);
    transform-origin: top left;
    transition:
      opacity 180ms ease,
      transform 250ms cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  .sort-popover.visible {
    opacity: 1;
    transform: scale(1) translateY(0);
  }

  .sort-option {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 0 14px;
    min-height: var(--min-touch-target, 48px);
    background: transparent;
    border: none;
    border-radius: var(--border-radius-sm, 6px);
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 12px);
    font-weight: 500;
    cursor: pointer;
    text-align: left;

    opacity: 0;
    transform: translateY(-4px);
    transition:
      background var(--duration-fast, 150ms) ease,
      color var(--duration-fast, 150ms) ease,
      transform var(--duration-fast, 150ms) ease;
  }

  .sort-popover.visible .sort-option {
    opacity: 1;
    transform: translateY(0);
    transition:
      background var(--duration-fast, 150ms) ease,
      color var(--duration-fast, 150ms) ease,
      transform var(--duration-fast, 150ms) ease,
      opacity 150ms ease;
  }

  .sort-option:hover,
  .sort-option.focused {
    background: color-mix(in srgb, var(--theme-text) 8%, transparent);
    color: var(--theme-text);
  }

  .sort-option:active {
    transform: scale(0.98);
  }

  .sort-option.selected {
    color: var(--theme-accent);
  }

  .sort-option:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: -2px;
  }

  .option-icon {
    width: 16px;
    text-align: center;
    font-size: var(--font-size-compact, 12px);
    opacity: 0.7;
    flex-shrink: 0;
  }

  .sort-option.selected .option-icon {
    opacity: 1;
  }

  .option-label {
    flex: 1;
  }

  .check-icon {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-accent);
    animation: checkPop 250ms cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  @keyframes checkPop {
    0% {
      transform: scale(0);
      opacity: 0;
    }
    60% {
      transform: scale(1.2);
    }
    100% {
      transform: scale(1);
      opacity: 1;
    }
  }

  /* ---- Inline filters (wide only) ---- */
  .inline-filters {
    display: none;
    align-items: center;
    gap: var(--spacing-sm, 8px);
    flex-shrink: 1;
    min-width: 0;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .inline-filters::-webkit-scrollbar {
    display: none;
  }

  .inline-filters :global(button),
  .inline-filters :global(.filter-chip) {
    flex-shrink: 0;
  }

  .toolbar-divider {
    display: none;
    width: 1px;
    height: 24px;
    background: color-mix(in srgb, var(--theme-text) 15%, transparent);
    flex-shrink: 0;
  }

  /* ---- Filters pill (bottom-sheet pattern) ---- */
  .filters-pill {
    position: relative;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 12px;
    min-height: var(--min-touch-target, 48px);
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: var(--border-radius-md, 10px);
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
    transition:
      border-color var(--duration-fast, 150ms) ease,
      color var(--duration-fast, 150ms) ease;
  }

  .filters-pill:hover {
    color: var(--theme-text);
    border-color: color-mix(
      in srgb,
      var(--theme-stroke) 80%,
      var(--theme-text)
    );
  }

  .filters-pill:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  .filters-pill-count {
    color: var(--theme-text);
    font-weight: 700;
    /* Changing number must not jitter the pill width (no-layout-shift). */
    font-variant-numeric: tabular-nums;
  }

  .filters-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    border-radius: 9px;
    background: var(--theme-accent);
    color: #fff;
    font-size: 11px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  /* Inline active chips — same visual language as BrowseFilterBar's chips */
  .active-chip {
    display: inline-flex;
    align-items: center;
    gap: var(--spacing-sm, 8px);
    padding: 4px 8px 4px 12px;
    min-height: 28px;
    background: color-mix(in srgb, var(--chip-color) 12%, transparent);
    border: 1px solid color-mix(in srgb, var(--chip-color) 30%, transparent);
    border-radius: 100px;
    color: var(--theme-text);
    font-size: var(--font-size-compact, 12px);
    font-weight: 500;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .chip-lock {
    font-size: 9px;
    opacity: 0.5;
    flex-shrink: 0;
  }

  .chip-label {
    line-height: 1;
  }

  .chip-dismiss {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    /* Beat the global 44px button floor — the WCAG target lives on the
       ::before hit zone, not the visible glyph. */
    min-width: 16px;
    min-height: 16px;
    padding: 0;
    background: color-mix(in srgb, var(--theme-text, white) 15%, transparent);
    border: none;
    border-radius: 50%;
    color: var(--theme-text);
    font-size: 9px;
    cursor: pointer;
    position: relative;
    flex-shrink: 0;
  }

  .chip-dismiss::before {
    content: "";
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    min-width: 44px;
    min-height: 44px;
  }

  .chip-dismiss:hover {
    background: color-mix(in srgb, var(--theme-text, white) 25%, transparent);
  }

  .clear-all-btn {
    padding: 4px var(--spacing-md, 12px);
    min-height: 28px;
    background: transparent;
    border: 1px solid var(--theme-stroke);
    border-radius: 100px;
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 12px);
    font-weight: 500;
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .clear-all-btn:hover {
    color: var(--semantic-error);
    border-color: color-mix(in srgb, var(--semantic-error) 30%, transparent);
  }

  @container gallery (min-width: 900px) {
    .inline-filters {
      display: flex;
    }
    .toolbar-divider {
      display: block;
    }
  }

  /* ---- Grid zoom (fine pointers only) ---- */
  .zoom-control {
    display: none;
    align-items: center;
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: var(--border-radius-md, 10px);
    padding: 2px;
    gap: 2px;
    flex-shrink: 0;
  }

  @media (hover: hover) and (pointer: fine) {
    .zoom-control {
      display: flex;
    }

    .browse-toolbar.embedded .zoom-control {
      margin-left: auto;
    }
  }

  .zoom-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--min-touch-target, 44px);
    height: var(--min-touch-target, 44px);
    min-height: var(--min-touch-target, 44px);
    background: transparent;
    border: none;
    border-radius: var(--border-radius-sm, 6px);
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 12px);
    cursor: pointer;
    transition:
      background var(--duration-fast, 150ms) ease,
      color var(--duration-fast, 150ms) ease;
  }

  .zoom-btn:hover:not(:disabled) {
    background: color-mix(in srgb, var(--theme-text) 8%, transparent);
    color: var(--theme-text);
  }

  .zoom-btn:disabled {
    opacity: 0.35;
    cursor: default;
  }

  .zoom-btn:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 1px;
  }

  .search-slot {
    flex: 1;
    /* Never narrower than the 44px button it holds: with `min-width: 0` a
       375px phone shrank the slot to 35px and the button ran into the result
       count beside it. */
    min-width: var(--min-touch-target, 44px);
    display: flex;
    align-items: center;
  }

  .result-count {
    flex-shrink: 0;
    margin-left: auto;
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  /* ---- Mobile (max-width: 520px) ---- */
  @media (max-width: 520px) {
    /* Back, source toggle, sort, search and count total 384px at 8px gaps and
       8px button padding, 9px more than an iPhone SE. Two points off each gap
       and each toggle label pays for the search slot's floor above. */
    .browse-toolbar {
      gap: 6px;
    }

    .source-btn {
      padding: 0 6px;
    }

    .sort-trigger-label {
      display: none;
    }

    .back-pill-label {
      display: none;
    }

    .result-count-word {
      display: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .sort-trigger,
    .sort-chevron,
    .sort-popover,
    .sort-option,
    .check-icon,
    .source-btn {
      transition: none !important;
      animation: none !important;
    }

    .sort-popover {
      transform: none;
    }

    .sort-popover .sort-option {
      opacity: 1;
      transform: none;
    }
  }
</style>
