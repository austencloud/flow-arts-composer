<!--
BrowseFilterBar.svelte - Unified filter chip row + active filter chips.
Replaces InlineFilterPanel + ActiveFilterBar + picker's FilterChipRow.
Reads from / writes to a headless BrowseEngine instance.
-->
<script lang="ts">
  import { getHapticFeedback } from "#lib/shared/application/get-haptic-feedback.js";
  import type { HapticFeedback } from "#lib/shared/application/services/haptic-feedback.js";
  import { onMount } from "svelte";
  import { BrowseFilterType } from "#lib/shared/persistence/domain/enums/filtering-enums.js";
  import LevelFilterChip from "#lib/shared/browse/components/filter-chips/LevelFilterChip.svelte";
  import FavoritesFilterChip from "#lib/shared/browse/components/filter-chips/FavoritesFilterChip.svelte";
  import LengthFilterChip from "#lib/shared/browse/components/filter-chips/LengthFilterChip.svelte";
  import MaxTurnIntensityFilterChip from "#lib/shared/browse/components/filter-chips/MaxTurnIntensityFilterChip.svelte";
  import LOOPFilterChip from "#lib/shared/browse/components/filter-chips/LOOPFilterChip.svelte";
  import FilterChipBase from "#lib/shared/browse/components/filter-chips/FilterChipBase.svelte";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import type { BrowseEngine } from "../engine/types";
  import { localizeFilterChip } from "./localize-filter-chip";

  const LOOP_FILTER_COLORS: Record<string, string> = {
    "component:rotated_halved": "#36c3ff",
    "component:rotated_quartered": "#36c3ff",
    "component:mirrored": "#6F2DA8",
    "component:flipped": "#6F2DA8",
    "component:swapped": "#2ecc71",
    "component:inverted": "#eb7d00",
    "component:rewound": "#00bcd4",
  };

  interface Props {
    engine: BrowseEngine;
    /** Bottom-sheet filter pattern: the sheet owns the selectors, this bar
     * shows ONLY applied filters (all dismissible) + Clear all — at every
     * container width. Zero height when nothing is applied. */
    chipsOnly?: boolean;
    /** When provided AND filters are active, shows a "Save as Smart
     * Collection" action beside Clear all. Omitted by picker hosts. */
    onSaveSmart?: () => void;
  }

  let { engine, chipsOnly = false, onSaveSmart }: Props = $props();

  const isHandsMode = $derived(engine.viewMode.subject === "hands");

  let hapticService: HapticFeedback | null = null;

  onMount(() => {
    hapticService = getHapticFeedback() ?? null;
  });

  // Derived state from engine

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

  const activeMaxTurnIntensity = $derived.by(() => {
    const f = engine.activeFilters.get("max_turn_intensity");
    return f && !f.locked ? (f.value as number) : null;
  });

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

  // Handlers

  function handleLevelSelect(level: number | null) {
    hapticService?.trigger("selection");
    if (level == null) engine.removeFilter("difficulty");
    else
      engine.addFilter(
        BrowseFilterType.DIFFICULTY,
        level,
        `Level ${level}`,
        "var(--semantic-info)"
      );
  }

  function handleFavoritesToggle(active: boolean) {
    hapticService?.trigger("selection");
    if (active)
      engine.addFilter(
        BrowseFilterType.FAVORITES,
        true,
        "Favorites",
        "#ec4899"
      );
    else engine.removeFilter("favorites");
  }

  function handleLengthSelect(length: number | null) {
    hapticService?.trigger("selection");
    if (length == null) engine.removeFilter("length");
    else
      engine.addFilter(
        BrowseFilterType.LENGTH,
        length,
        `${length} steps`,
        "#f59e0b"
      );
  }

  function handleMaxTurnIntensitySelect(intensity: number | null) {
    hapticService?.trigger("selection");
    if (intensity == null) engine.removeFilter("max_turn_intensity");
    else
      engine.addFilter(
        BrowseFilterType.MAX_TURN_INTENSITY,
        intensity,
        `≤${intensity} turns`,
        "var(--semantic-success)"
      );
  }

  function handleLoopSelect(value: string | null) {
    hapticService?.trigger("selection");
    // removeFilter("cap_type") clears ALL stacked loop filters (prefix-aware) —
    // the dropdown is single-select, so a new pick replaces the whole stack.
    if (value == null) engine.removeFilter("cap_type");
    else {
      engine.removeFilter("cap_type");
      const label = value.startsWith("component:")
        ? value
            .slice("component:".length)
            .replace(/_/g, " ")
            .replace(/\b\w/g, (c) => c.toUpperCase())
        : value;
      const info = LOOP_FILTER_COLORS[value];
      engine.addFilter(
        BrowseFilterType.LOOP_TYPE,
        value,
        label,
        info ?? "#8b5cf6"
      );
    }
  }

  function handleDismissChip(typeKey: string) {
    hapticService?.trigger("selection");
    engine.removeFilter(typeKey);
  }

  function handleClearAll() {
    hapticService?.trigger("selection");
    engine.clearUserFilters();
    // The search chip lives in this row too — "Clear all" clears it with the rest.
    if (engine.searchQuery.trim()) engine.setSearch("");
  }

  function handleSaveSmart() {
    hapticService?.trigger("selection");
    onSaveSmart?.();
  }

  // Active search renders as a dismissible chip alongside the filters — but
  // only in chipsOnly mode (the bottom-sheet pattern), where the gallery
  // toolbar carries no search input (the drill front door is the search
  // entry). Without this chip a drill-set search would be an invisible,
  // unclearable filter on the grid. Hosts with the toolbar search visible
  // already display the live query there — a chip would duplicate it.
  const activeSearch = $derived(chipsOnly ? engine.searchQuery.trim() : "");

  function handleDismissSearch(e: Event) {
    e.stopPropagation();
    hapticService?.trigger("selection");
    engine.setSearch("");
  }

  // Filter types the selector chips above already display + control. Any other
  // active filter (drill picks: starting letter, position, owner, recent…) and
  // any locked constraint renders as a chip in the SAME row — the old second
  // "active filters" row duplicated the selector chips and cost a whole band
  // on mobile.
  const SELECTOR_TYPES = new Set([
    "difficulty",
    "favorites",
    "length",
    "cap_type",
  ]);
  const extraChips = $derived(
    chipsOnly
      ? engine.allFilterChips
      : engine.allFilterChips.filter(
          (chip) => chip.locked || !SELECTOR_TYPES.has(String(chip.type))
        )
  );
</script>

<div class="browse-filter-bar" class:chips-only={chipsOnly}>
  <!-- AT announcement for filter changes — the old two-row bar carried
       role="status" on its chips row; the merged row is a toolbar, so the
       live region lives here instead. -->
  <span class="sr-only" role="status">
    {[
      activeSearch
        ? t("browse_audit_chip_search", { query: activeSearch })
        : "",
      extraChips.length > 0
        ? t("browse_audit_chip_active_filters", {
            filters: extraChips.map(localizeFilterChip).join(", "),
          })
        : "",
    ]
      .filter(Boolean)
      .join(". ")}
  </span>
  <!-- Chip row: level, favorites, length selectors -->
  <div
    class="filter-chip-row"
    role="toolbar"
    aria-label={t("browse_filter_options")}
  >
    {#if !chipsOnly}
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

      {#if !isHandsMode}
        <MaxTurnIntensityFilterChip
          activeIntensity={activeMaxTurnIntensity}
          availableIntensities={engine.availableMaxTurnIntensities as number[]}
          onSelect={handleMaxTurnIntensitySelect}
          getFilteredCount={engine.getFilteredCount.bind(engine)}
        />
      {/if}

      <LOOPFilterChip
        activeValue={activeLoopComponent}
        loopTypeCounts={engine.loopTypeCounts}
        onSelect={handleLoopSelect}
      />
    {/if}

    <!-- Active search — same dismissible-chip treatment as applied filters -->
    {#if activeSearch}
      <span class="active-chip" style="--chip-color: #6aa0ff;">
        <i class="fas fa-magnifying-glass chip-search-icon" aria-hidden="true"
        ></i>
        <span class="chip-label">{activeSearch}</span>
        <button
          class="chip-dismiss"
          type="button"
          aria-label={t("browse_remove_filter", { type: activeSearch })}
          onclick={handleDismissSearch}
        >
          <i class="fas fa-times" aria-hidden="true"></i>
        </button>
      </span>
    {/if}

    <!-- Active filters the selectors don't cover (drill picks, locked constraints) -->
    <!-- Keyed by map key, not type — stacked loop filters share a type. -->
    {#each extraChips as chip (chip.key)}
      <span class="active-chip" style="--chip-color: {chip.chipColor};">
        {#if chip.locked}
          <i class="fas fa-lock chip-lock" aria-hidden="true"></i>
        {/if}
        <span class="chip-label">{localizeFilterChip(chip)}</span>
        {#if !chip.locked}
          <button
            class="chip-dismiss"
            type="button"
            aria-label={t("browse_remove_filter", {
              type: localizeFilterChip(chip),
            })}
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

    {#if engine.hasActiveFilters || activeSearch}
      <FilterChipBase
        label={t("browse_clear_all")}
        icon="fas fa-xmark"
        mode="action"
        size="sm"
        chipColor="var(--semantic-error)"
        onclick={handleClearAll}
      />
    {/if}

    {#if onSaveSmart && engine.hasActiveFilters}
      <FilterChipBase
        label={t("browse_audit_save_smart_collection")}
        icon="fas fa-wand-magic-sparkles"
        mode="action"
        size="sm"
        chipColor="var(--theme-accent)"
        active
        onclick={handleSaveSmart}
      />
    {/if}
  </div>
</div>

<style>
  .browse-filter-bar {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs, 4px);
  }

  .filter-chip-row {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm, 8px);
    overflow-x: auto;
    padding: 0 var(--spacing-xs, 4px);
    scrollbar-width: none;
    -webkit-overflow-scrolling: touch;
  }

  .filter-chip-row::-webkit-scrollbar {
    display: none;
  }

  /* --- Active filter chips (inline with the selector row) --- */

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
    animation: chipIn var(--duration-fast, 150ms) ease;
  }

  @keyframes chipIn {
    from {
      opacity: 0;
      transform: scale(0.9);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  .chip-lock {
    font-size: 9px;
    opacity: 0.5;
    flex-shrink: 0;
  }

  .chip-search-icon {
    font-size: 9px;
    opacity: 0.7;
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
       ::before hit zone below, not the visible glyph. Without these the
       whole chip inflates to 48px tall. */
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
    transition:
      background var(--duration-fast, 150ms) ease,
      transform var(--duration-fast, 150ms) ease;
  }

  /* Expanded touch target — 44px WCAG floor without growing the visual chip */
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
    transform: scale(1.1);
  }

  .chip-dismiss:active {
    transform: scale(0.9);
  }

  @container gallery (min-width: 900px) {
    .browse-filter-bar {
      display: none;
    }
    /* chips-only shows APPLIED filters — those must stay visible at every
       width (the wide-container toolbar only carries selector chips). */
    .browse-filter-bar.chips-only {
      display: flex;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .active-chip,
    .chip-dismiss {
      animation: none;
      transition: none;
    }
  }
</style>
