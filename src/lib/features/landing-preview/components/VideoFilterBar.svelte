<script lang="ts">
  /**
   * VideoFilterBar
   *
   * Search bar, action buttons, and filter chips for the video curator.
   */
  import type { VideoCategory } from "../types";
  import FilterChipBase from "#lib/shared/browse/components/filter-chips/FilterChipBase.svelte";

  interface Performer {
    id: string;
    name: string;
  }

  interface Props {
    searchQuery: string;
    filterCategory: string;
    filterPerformer: string;
    filterHasWord: string;
    filterFeatured: boolean | null;
    categories: VideoCategory[];
    performers: Performer[];
    loading: boolean;
    uncuratedCount: number;
    unlinkableCount: number;
    unnamedCount: number;
    filteredCount: number;
    totalCount: number;
    showAddCategory: boolean;
    newCategoryLabel: string;
    newCategoryColor: string;
    onSearchChange: (query: string) => void;
    onCategoryChange: (category: string) => void;
    onPerformerChange: (performerId: string) => void;
    onHasWordChange: (value: string) => void;
    onFeaturedChange: (value: boolean | null) => void;
    onRefresh: () => void;
    onEnterCurationMode: () => void;
    onEnterLinkingMode: () => void;
    onEnterRenameMode: () => void;
    onToggleAddCategory: (show: boolean) => void;
    onAddCategory: () => void;
    onUpdateCategoryLabel: (label: string) => void;
    onUpdateCategoryColor: (color: string) => void;
    onClearFilters: () => void;
  }

  let {
    searchQuery,
    filterCategory,
    filterPerformer,
    filterHasWord,
    filterFeatured,
    categories,
    performers,
    loading,
    uncuratedCount,
    unlinkableCount,
    unnamedCount,
    filteredCount,
    totalCount,
    showAddCategory,
    newCategoryLabel,
    newCategoryColor,
    onSearchChange,
    onCategoryChange,
    onPerformerChange,
    onHasWordChange,
    onFeaturedChange,
    onRefresh,
    onEnterCurationMode,
    onEnterLinkingMode,
    onEnterRenameMode,
    onToggleAddCategory,
    onAddCategory,
    onUpdateCategoryLabel,
    onUpdateCategoryColor,
    onClearFilters,
  }: Props = $props();

  const hasActiveFilters = $derived(
    filterCategory !== "all" ||
    filterPerformer !== "all" ||
    filterHasWord !== "all" ||
    filterFeatured !== null ||
    searchQuery.trim() !== ""
  );
</script>

<!-- Modern Filter Bar -->
<div class="modern-filters">
  <!-- Search -->
  <div class="search-container">
    <i class="fas fa-search search-icon" aria-hidden="true"></i>
    <input
      type="search"
      placeholder="Search videos..."
      value={searchQuery}
      oninput={(e) => onSearchChange((e.target as HTMLInputElement).value)}
      class="search-input"
    />
    {#if searchQuery}
      <button class="clear-search" onclick={() => onSearchChange("")} aria-label="Clear search">
        <i class="fas fa-times" aria-hidden="true"></i>
      </button>
    {/if}
  </div>

  <!-- Action buttons -->
  <div class="action-buttons-row">
    <button class="icon-btn" onclick={onRefresh} disabled={loading} title="Refresh" aria-label="Refresh videos">
      <i class="fas fa-sync-alt" class:fa-spin={loading} aria-hidden="true"></i>
    </button>

    {#if uncuratedCount > 0}
      <button class="action-pill curate" onclick={onEnterCurationMode}>
        <i class="fas fa-magic" aria-hidden="true"></i>
        <span>Curate</span>
        <span class="count">{uncuratedCount}</span>
      </button>
    {/if}

    {#if unlinkableCount > 0}
      <button class="action-pill link" onclick={onEnterLinkingMode}>
        <i class="fas fa-link" aria-hidden="true"></i>
        <span>Link</span>
        <span class="count">{unlinkableCount}</span>
      </button>
    {/if}

    {#if unnamedCount > 0}
      <button class="action-pill rename" onclick={onEnterRenameMode}>
        <i class="fas fa-pen" aria-hidden="true"></i>
        <span>Rename</span>
        <span class="count">{unnamedCount}</span>
      </button>
    {/if}
  </div>
</div>

<!-- Filter chips -->
<!--
  Keep-Separate (chip-primitives.md): the Category and Performer bars below stay
  hand-built. They carry per-option colors (`--chip-color: {cat.color}`), render
  dynamic runtime lists, and host an inline add-action (the dashed add-chip).
  SegmentedControl can't express per-option colors or a dynamic/add-able set, so
  this is the legitimate exception. The pure boolean toggles (Has Word / Featured)
  below DO use the FilterChipBase primitive.
-->
<div class="filter-chips-container">
  <!-- Category chips (hand-built per Keep-Separate above: per-color + dynamic + add-action) -->
  <div class="chip-group">
    <span class="chip-label">Category</span>
    <div class="chips">
      <button
        class="chip"
        class:active={filterCategory === "all"}
        onclick={() => onCategoryChange("all")}
      >
        All
      </button>
      <button
        class="chip"
        class:active={filterCategory === ""}
        onclick={() => onCategoryChange("")}
      >
        <i class="fas fa-question-circle" aria-hidden="true"></i>
        None
      </button>
      {#each categories as cat}
        <button
          class="chip"
          class:active={filterCategory === cat.id}
          style="--chip-color: {cat.color}"
          onclick={() => onCategoryChange(cat.id)}
        >
          {cat.label}
        </button>
      {/each}
      <button
        class="chip add-chip"
        onclick={() => onToggleAddCategory(!showAddCategory)}
        title="Add category"
        aria-label="Add category"
      >
        <i class="fas fa-plus" aria-hidden="true"></i>
      </button>
    </div>
  </div>

  <!-- Performer chips -->
  <div class="chip-group">
    <span class="chip-label">Performer</span>
    <div class="chips">
      <button
        class="chip"
        class:active={filterPerformer === "all"}
        onclick={() => onPerformerChange("all")}
      >
        All
      </button>
      <button
        class="chip"
        class:active={filterPerformer === ""}
        onclick={() => onPerformerChange("")}
      >
        <i class="fas fa-user-slash" aria-hidden="true"></i>
        Unassigned
      </button>
      {#each performers as p}
        <button
          class="chip performer-chip"
          class:active={filterPerformer === p.id}
          onclick={() => onPerformerChange(p.id)}
        >
          {p.name}
        </button>
      {/each}
    </div>
  </div>

  <!-- Toggle chips row -->
  <div class="chip-group toggles">
    <div class="chips">
      <!-- TKA Word filter -->
      <FilterChipBase
        mode="toggle"
        size="sm"
        label="Has Word"
        icon="fas fa-font"
        chipColor="#6366f1"
        active={filterHasWord === "yes"}
        onclick={() => onHasWordChange(filterHasWord === "yes" ? "all" : "yes")}
      />
      <FilterChipBase
        mode="toggle"
        size="sm"
        label="No Word"
        icon="fas fa-font"
        chipColor="#6366f1"
        active={filterHasWord === "no"}
        onclick={() => onHasWordChange(filterHasWord === "no" ? "all" : "no")}
      />

      <!-- Featured filter -->
      <FilterChipBase
        mode="toggle"
        size="sm"
        label="Featured"
        icon="fas fa-star"
        chipColor="#f59e0b"
        active={filterFeatured === true}
        onclick={() => onFeaturedChange(filterFeatured === true ? null : true)}
      />
      <FilterChipBase
        mode="toggle"
        size="sm"
        label="Not Featured"
        icon="far fa-star"
        chipColor="#6366f1"
        active={filterFeatured === false}
        onclick={() => onFeaturedChange(filterFeatured === false ? null : false)}
      />
    </div>
  </div>

  <!-- Active filter summary -->
  {#if hasActiveFilters}
    <div class="active-filters">
      <span class="filter-count">{filteredCount} of {totalCount}</span>
      <button class="clear-all" onclick={onClearFilters}>
        <i class="fas fa-times" aria-hidden="true"></i>
        Clear filters
      </button>
    </div>
  {/if}
</div>

<!-- Add category popup -->
{#if showAddCategory}
  <div class="add-category-popup">
    <input
      type="text"
      placeholder="Category name..."
      value={newCategoryLabel}
      oninput={(e) => onUpdateCategoryLabel((e.target as HTMLInputElement).value)}
      onkeydown={(e) => e.key === "Enter" && onAddCategory()}
    />
    <input
      type="color"
      value={newCategoryColor}
      oninput={(e) => onUpdateCategoryColor((e.target as HTMLInputElement).value)}
      title="Category color"
    />
    <button class="save-btn" onclick={onAddCategory} disabled={!newCategoryLabel.trim()}>
      Add
    </button>
    <button class="cancel-btn" onclick={() => onToggleAddCategory(false)}>
      Cancel
    </button>
  </div>
{/if}

<style>
  /* Modern Filters */
  .modern-filters {
    display: flex;
    gap: 16px;
    margin-bottom: 16px;
    align-items: center;
  }

  .search-container {
    flex: 1;
    max-width: 400px;
    position: relative;
  }

  .search-icon {
    position: absolute;
    left: 14px;
    top: 50%;
    transform: translateY(-50%);
    color: var(--theme-text-dim);
    font-size: 14px;
    pointer-events: none;
  }

  .search-input {
    width: 100%;
    padding: 12px 40px 12px 42px;
    border-radius: 12px;
    border: 1px solid var(--theme-stroke);
    background: var(--theme-card-bg);
    color: var(--theme-text);
    font-size: 14px;
    transition: all 0.2s;
  }

  .search-input:focus {
    outline: none;
    border-color: var(--theme-accent);
    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
  }

  .search-input::placeholder {
    color: var(--theme-text-dim);
  }

  .clear-search {
    position: absolute;
    right: 8px;
    top: 50%;
    transform: translateY(-50%);
    width: 28px;
    height: 28px;
    border-radius: 50%;
    border: none;
    background: transparent;
    color: var(--theme-text-dim);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
  }

  .clear-search:hover {
    background: var(--theme-card-bg-hover, rgba(255, 255, 255, 0.1));
    color: var(--theme-text);
  }

  .action-buttons-row {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .icon-btn {
    width: 44px;
    height: 44px;
    border-radius: 12px;
    border: 1px solid var(--theme-stroke);
    background: var(--theme-card-bg);
    color: var(--theme-text);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    transition: all 0.2s;
  }

  .icon-btn:hover:not(:disabled) {
    background: var(--theme-accent);
    border-color: var(--theme-accent);
    color: white;
  }

  .icon-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .action-pill {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    border-radius: 24px;
    border: none;
    color: white;
    cursor: pointer;
    font-size: 14px;
    font-weight: 600;
    transition: all 0.2s;
  }

  .action-pill.curate {
    background: linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%);
  }

  .action-pill.curate:hover {
    box-shadow: 0 4px 12px rgba(139, 92, 246, 0.4);
    transform: translateY(-1px);
  }

  .action-pill.link {
    background: linear-gradient(135deg, #10b981 0%, #06b6d4 100%);
  }

  .action-pill.link:hover {
    box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);
    transform: translateY(-1px);
  }

  .action-pill.rename {
    background: linear-gradient(135deg, #f59e0b 0%, #f97316 100%);
  }

  .action-pill.rename:hover {
    box-shadow: 0 4px 12px rgba(245, 158, 11, 0.4);
    transform: translateY(-1px);
  }

  .action-pill .count {
    padding: 2px 8px;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.2);
    font-size: 12px;
  }

  /* Filter Chips */
  .filter-chips-container {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-bottom: 24px;
  }

  .chip-group {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .chip-group.toggles {
    padding-top: 8px;
    border-top: 1px solid var(--theme-stroke);
  }

  .chip-label {
    font-size: 12px;
    font-weight: 600;
    color: var(--theme-text-dim);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    min-width: 70px;
  }

  .chips {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .chip {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 14px;
    border-radius: 20px;
    border: 1px solid var(--theme-stroke);
    background: var(--theme-card-bg);
    color: var(--theme-text);
    cursor: pointer;
    font-size: 13px;
    transition: all 0.2s;
  }

  .chip:hover {
    border-color: var(--chip-color, var(--theme-accent));
  }

  .chip.active {
    background: var(--chip-color, var(--theme-accent));
    border-color: var(--chip-color, var(--theme-accent));
    color: white;
  }

  .chip i {
    font-size: 12px;
  }

  .chip.add-chip {
    border-style: dashed;
    padding: 8px 12px;
  }

  .chip.add-chip:hover {
    border-style: solid;
  }

  .performer-chip {
    --chip-color: #8b5cf6;
  }

  .active-filters {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 10px 16px;
    background: color-mix(in srgb, var(--theme-accent, #6366f1) 10%, transparent);
    border-radius: 10px;
    border: 1px solid color-mix(in srgb, var(--theme-accent, #6366f1) 20%, transparent);
  }

  .filter-count {
    font-size: 14px;
    font-weight: 600;
    color: var(--theme-accent);
  }

  .clear-all {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border-radius: 6px;
    border: none;
    background: transparent;
    color: var(--theme-text-dim);
    cursor: pointer;
    font-size: 13px;
    transition: all 0.2s;
  }

  .clear-all:hover {
    background: color-mix(in srgb, var(--semantic-error, #ef4444) 10%, transparent);
    color: var(--semantic-error, #ef4444);
  }

  /* Add category popup */
  .add-category-popup {
    display: flex;
    gap: 8px;
    padding: 12px;
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 8px;
    margin-bottom: 16px;
    align-items: center;
  }

  .add-category-popup input[type="text"] {
    flex: 1;
    padding: 8px 12px;
    border-radius: 6px;
    border: 1px solid var(--theme-stroke);
    background: var(--theme-panel-bg);
    color: var(--theme-text);
  }

  .add-category-popup input[type="color"] {
    width: 40px;
    height: 32px;
    padding: 0;
    border: 1px solid var(--theme-stroke);
    border-radius: 6px;
    cursor: pointer;
  }

  .add-category-popup .save-btn,
  .add-category-popup .cancel-btn {
    padding: 8px 16px;
    border-radius: 6px;
    border: none;
    cursor: pointer;
  }

  .add-category-popup .save-btn {
    background: var(--theme-accent);
    color: white;
  }

  .add-category-popup .save-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .add-category-popup .cancel-btn {
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    color: var(--theme-text);
  }

  @container (max-width: 45rem) {
    .modern-filters {
      flex-wrap: wrap;
      gap: 0.75rem;
    }

    .search-container {
      flex: 1 0 100%;
      max-width: none;
    }

    .action-buttons-row {
      width: 100%;
    }

    .action-pill {
      flex: 1;
      justify-content: center;
      padding-inline: 0.75rem;
    }
  }
</style>
