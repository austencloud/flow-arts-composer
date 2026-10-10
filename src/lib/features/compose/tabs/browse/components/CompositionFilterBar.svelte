<!--
	CompositionFilterBar.svelte

	Unified search + morph chip filter bar for the composition browse tab.
	Search input on the left, mode/sort morph chips and favorites toggle on the right.
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import MorphChipGroup from "#lib/shared/foundation/ui/morph-chip/MorphChipGroup.svelte";
  import MorphChip from "#lib/shared/foundation/ui/morph-chip/MorphChip.svelte";
  import { ALL_MODES } from "../../../shared/domain/compose-mode-config";
  import { COMPOSE_MODE_CONFIG } from "#lib/features/compose/shared/domain/compose-mode-config.js";
  import type { AnimationMode } from "../../../shared/domain/animation-mode";
  import type {
    CompositionFilter,
    CompositionSortMethod,
    SortDirection,
  } from "../state/composition-browse-state.svelte";

  const {
    filter,
    sortMethod,
    sortDirection,
    onFilterChange,
    onSortChange,
  }: {
    filter: CompositionFilter;
    sortMethod: CompositionSortMethod;
    sortDirection: SortDirection;
    onFilterChange: (filter: CompositionFilter) => void;
    onSortChange: (
      method: CompositionSortMethod,
      direction: SortDirection
    ) => void;
  } = $props();

  // Local search state (debounced)
  let searchInput = $state("");
  let searchTimeout: ReturnType<typeof setTimeout> | undefined;

  function handleSearchInput(e: Event) {
    const value = (e.target as HTMLInputElement).value;
    searchInput = value;

    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      onFilterChange({ ...filter, searchQuery: value || undefined });
    }, 200);
  }

  function clearSearch() {
    searchInput = "";
    onFilterChange({ ...filter, searchQuery: undefined });
  }

  // Mode chip
  const modeOptions = [
    { value: "all" as const, label: "All" },
    ...ALL_MODES.map((m) => ({
      value: m,
      label: COMPOSE_MODE_CONFIG[m].label,
    })),
  ];

  let modeValue = $state<string>("all");

  function handleModeChange(value: string) {
    modeValue = value;
    const mode = value === "all" ? undefined : (value as AnimationMode);
    onFilterChange({ ...filter, mode });
  }

  // Sort chip
  const sortOptions = [
    { value: "date" as const, label: "Recent" },
    { value: "name" as const, label: "Name" },
    { value: "cellCount" as const, label: "Size" },
  ];

  let sortValue = $state<CompositionSortMethod>("date");

  function handleSortChange(value: CompositionSortMethod) {
    sortValue = value;
    onSortChange(value, sortDirection);
  }

  // Favorites toggle
  let favoritesActive = $state(false);

  function toggleFavorites() {
    favoritesActive = !favoritesActive;
    onFilterChange({ ...filter, favorites: favoritesActive || undefined });
  }

  // Sync from props (runs immediately on mount and on any prop change)
  $effect(() => {
    searchInput = filter.searchQuery ?? "";
    modeValue = filter.mode ?? "all";
    favoritesActive = filter.favorites ?? false;
    sortValue = sortMethod;
  });
</script>

<div class="filter-bar">
  <!-- Search -->
  <div class="search-wrapper">
    <i class="fas fa-search search-icon" aria-hidden="true"></i>
    <input
      type="search"
      class="search-input"
      placeholder={t("browse_ui_search_compositions_title")}
      value={searchInput}
      oninput={handleSearchInput}
      aria-label={t("browse_ui_search_compositions")}
    />
    {#if searchInput}
      <button
        type="button"
        class="clear-btn"
        onclick={clearSearch}
        aria-label={t("search_clear")}
      >
        <i class="fas fa-times" aria-hidden="true"></i>
      </button>
    {/if}
  </div>

  <!-- Chips row -->
  <div class="chips-row">
    <MorphChipGroup gap={6}>
      {#snippet children()}
        <MorphChip
          id="mode"
          label="Layout"
          value={modeValue}
          options={modeOptions}
          onchange={handleModeChange}
          collapseDelay={150}
        />
        <MorphChip
          id="sort"
          label="Sort"
          value={sortValue}
          options={sortOptions}
          onchange={handleSortChange}
          collapseDelay={150}
        />
      {/snippet}
    </MorphChipGroup>

    <!-- Favorites toggle (standalone pill, not a morph chip) -->
    <button
      type="button"
      class="favorites-pill"
      class:active={favoritesActive}
      onclick={toggleFavorites}
      title={favoritesActive ? "Show all" : "Show favorites only"}
      aria-label={favoritesActive
        ? "Show all compositions"
        : "Show favorites only"}
      aria-pressed={favoritesActive}
    >
      <i class="fas fa-heart" aria-hidden="true"></i>
    </button>
  </div>
</div>

<style>
  .filter-bar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 12px;
    flex-shrink: 0;
  }

  /* Search */
  .search-wrapper {
    position: relative;
    flex: 1;
    min-width: 0;
    max-width: 280px;
  }

  .search-icon {
    position: absolute;
    left: 12px;
    top: 50%;
    transform: translateY(-50%);
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.4));
    pointer-events: none;
  }

  .search-input {
    width: 100%;
    padding: 8px 12px 8px 34px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 8px;
    color: var(--theme-text, #fff);
    font-size: var(--font-size-sm, 14px);
    outline: none;
    transition: border-color var(--duration-fast, 100ms) ease;
  }

  .search-input::placeholder {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.35));
  }

  .search-input:focus {
    border-color: var(--theme-accent, #6366f1);
  }

  /* Remove native search clear button (we have our own) */
  .search-input::-webkit-search-cancel-button {
    display: none;
  }

  .clear-btn {
    position: absolute;
    right: 4px;
    top: 50%;
    transform: translateY(-50%);
    width: 28px;
    height: 28px;
    min-width: var(--min-touch-target);
    min-height: var(--min-touch-target);
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.4));
    cursor: pointer;
    padding: 0;
    font-size: var(--font-size-compact, 12px);
  }

  .clear-btn:hover {
    color: var(--theme-text, #fff);
  }

  /* Chips row */
  .chips-row {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }

  /* Favorites pill */
  .favorites-pill {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    min-width: var(--min-touch-target);
    min-height: var(--min-touch-target);
    border-radius: 50%;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.4));
    cursor: pointer;
    font-size: var(--font-size-sm, 14px);
    padding: 0;
    transition:
      color var(--duration-fast, 100ms) ease,
      border-color var(--duration-fast, 100ms) ease,
      background var(--duration-fast, 100ms) ease;
  }

  .favorites-pill.active {
    color: var(--semantic-error, #ef4444);
    border-color: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 40%,
      transparent
    );
    background: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 10%,
      transparent
    );
  }

  .favorites-pill:hover {
    color: var(--semantic-error, #ef4444);
  }

  .favorites-pill:focus-visible {
    outline: 2px solid var(--theme-accent, #6366f1);
    outline-offset: 2px;
  }

  /* Responsive: stack on narrow */
  @container (max-width: 500px) {
    .filter-bar {
      flex-wrap: wrap;
    }

    .search-wrapper {
      max-width: none;
      flex-basis: 100%;
    }
  }
</style>
