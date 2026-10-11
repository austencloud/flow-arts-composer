<!-- FeedbackFilterBar - Responsive filters composed of child components -->
<script lang="ts">
  import { getHapticFeedback } from "#lib/shared/application/get-haptic-feedback.js";
  import type { HapticFeedback } from "#lib/shared/application/services/haptic-feedback.js";
  import type { FeedbackManageState } from "#lib/shared/feedback/state/feedback-manage-state.svelte.js";
  import { createFilterBarUIState } from "../../state/filter-bar-ui-state.svelte";
  import {
    TYPE_CONFIG,
    STATUS_CONFIG,
    PRIORITY_CONFIG,
  } from "#lib/shared/feedback/domain/models/feedback-models.js";
  import type { FeedbackType } from "#lib/shared/feedback/domain/models/feedback-models.js";
  import FilterButton from "./FilterButton.svelte";
  import FilterMobileSheet from "./FilterMobileSheet.svelte";
  import FilterDesktopDrawers from "./FilterDesktopDrawers.svelte";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";

  interface Props {
    manageState: FeedbackManageState;
  }

  const { manageState }: Props = $props();

  const hapticService = getHapticFeedback();
  const uiState = createFilterBarUIState(() => manageState);

  function clearSearch() {
    hapticService?.trigger("selection");
    manageState.setSearchQuery("");
  }

  function handleTypeFilter(type: FeedbackType | "all") {
    hapticService?.trigger("selection");
    manageState.setFilter("type", type);
  }

  function clearFilters() {
    hapticService?.trigger("selection");
    manageState.setFilter("type", "all");
    manageState.setFilter("status", "all");
    manageState.setFilter("priority", "all");
  }
</script>

<div class="filter-bar">
  <!-- Search input (always visible) -->
  <div class="search-wrapper">
    <i class="fas fa-search search-icon" aria-hidden="true"></i>
    <input
      id="feedback-manage-search"
      name="feedback-manage-search"
      type="text"
      class="search-input"
      placeholder={t("feedback_search_placeholder")}
      aria-label={t("feedback_search_placeholder")}
      value={manageState.searchQuery}
      oninput={(e) => manageState.setSearchQuery(e.currentTarget.value)}
    />
    {#if manageState.searchQuery}
      <button
        type="button"
        class="search-clear"
        onclick={clearSearch}
        aria-label="Clear search"
      >
        <i class="fas fa-times" aria-hidden="true"></i>
      </button>
    {/if}
  </div>

  <!-- Mobile: Filters button -->
  <div class="mobile-filter-trigger">
    <FilterButton
      label={t("feedback_filters")}
      icon="fa-sliders-h"
      badgeCount={uiState.activeFilterCount}
      onClick={() => uiState.openSheet()}
      isActive={uiState.isSheetOpen}
    />
  </div>

  <!-- Desktop: Inline filter chips -->
  <div class="desktop-filters">
    <!-- Type chips -->
    <div class="chip-group">
      <FilterButton
        label={t("feedback_all_types")}
        onClick={() => handleTypeFilter("all")}
        isActive={manageState.filters.type === "all"}
      />
      {#each Object.entries(TYPE_CONFIG) as [type, config]}
        <FilterButton
          label={config.label
            .replace(" Report", "")
            .replace(" Request", "")
            .replace(" Feedback", "")}
          icon={config.icon}
          onClick={() => handleTypeFilter(type as FeedbackType)}
          isActive={manageState.filters.type === type}
        />
      {/each}
    </div>

    <!-- Status panel trigger -->
    <FilterButton
      label={uiState.currentStatusLabel}
      icon={manageState.filters.status !== "all" &&
      manageState.filters.status in STATUS_CONFIG
        ? (STATUS_CONFIG[
            manageState.filters.status as keyof typeof STATUS_CONFIG
          ]?.icon ?? "fa-circle")
        : undefined}
      onClick={() => uiState.openStatusDrawer()}
      isActive={manageState.filters.status !== "all"}
      isPanel={true}
    />

    <!-- Priority panel trigger -->
    <FilterButton
      label={uiState.currentPriorityLabel}
      icon={manageState.filters.priority !== "all" &&
      manageState.filters.priority in PRIORITY_CONFIG
        ? (PRIORITY_CONFIG[
            manageState.filters.priority as keyof typeof PRIORITY_CONFIG
          ]?.icon ?? "fa-circle")
        : undefined}
      onClick={() => uiState.openPriorityDrawer()}
      isActive={manageState.filters.priority !== "all"}
      isPanel={true}
    />

    <!-- Clear filters button -->
    {#if uiState.activeFilterCount > 0}
      <button
        type="button"
        class="clear-filters-btn"
        onclick={clearFilters}
        aria-label="Clear all filters"
      >
        <i class="fas fa-times" aria-hidden="true"></i>
        {t("feedback_clear")}
      </button>
    {/if}
  </div>
</div>

<!-- Mobile bottom sheet -->
<FilterMobileSheet {manageState} {uiState} />

<!-- Desktop side drawers -->
<FilterDesktopDrawers {manageState} {uiState} />

<style>
  /* Main filter bar layout */
  .filter-bar {
    display: flex;
    align-items: center;
    gap: 13px;
    padding: 13px;
    background: var(--theme-card-bg, var(--theme-card-bg));
    border-bottom: 1px solid var(--theme-stroke, var(--theme-stroke));
  }

  /* Search input */
  .search-wrapper {
    flex: 1;
    position: relative;
    min-width: 0;
  }

  .search-icon {
    position: absolute;
    left: 13px;
    top: 50%;
    transform: translateY(-50%);
    color: var(--theme-text-dim);
    font-size: 0.875rem;
    pointer-events: none;
    transition: color var(--duration-normal) ease;
  }

  .search-input {
    width: 100%;
    height: var(--min-touch-target);
    padding: 0 34px 0 calc(13px + 24px);
    background: var(--theme-card-bg, var(--theme-card-bg));
    border: 1px solid var(--theme-stroke, var(--theme-stroke));
    border-radius: 12px;
    color: var(--theme-text);
    font-size: var(--font-size-base);
    font-family: inherit;
    transition: all var(--duration-normal) ease;
  }

  .search-input::placeholder {
    color: var(--theme-text-dim);
  }

  .search-input:focus {
    outline: none;
    border-color: var(--semantic-success, var(--semantic-success));
    background: var(--theme-card-hover-bg, var(--theme-card-bg));
    box-shadow: 0 0 0 3px
      color-mix(
        in srgb,
        var(--semantic-success, var(--semantic-success)) 15%,
        transparent
      );
  }

  .search-wrapper:focus-within .search-icon {
    color: var(--semantic-success, var(--semantic-success));
  }

  .search-clear {
    position: absolute;
    right: 8px;
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    background: none;
    border: none;
    color: var(--theme-text-dim);
    cursor: pointer;
    border-radius: 50%;
    transition: all var(--duration-fast) ease;
  }

  .search-clear::before {
    content: "";
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    min-width: var(--min-touch-target);
    min-height: var(--min-touch-target);
  }

  .search-clear:hover {
    background: var(--theme-card-hover-bg);
    color: var(--theme-text, var(--theme-text-dim));
  }

  .search-clear:active {
    transform: translateY(-50%) scale(0.95);
  }

  /* Desktop inline filters */
  .desktop-filters {
    display: none;
    align-items: center;
    gap: 13px;
  }

  .mobile-filter-trigger {
    flex: 0 0 auto;
  }

  .chip-group {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .clear-filters-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    height: var(--min-touch-target);
    padding: 0 21px;
    background: none;
    border: none;
    color: var(--theme-text-dim);
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all var(--duration-fast) ease;
    border-radius: 12px;
  }

  .clear-filters-btn:hover {
    background: color-mix(
      in srgb,
      var(--semantic-error, var(--semantic-error)) 10%,
      transparent
    );
    color: var(--semantic-error, var(--semantic-error));
  }

  /* The board, not the viewport, decides when the complete filter row fits. */
  @container kanban (min-width: 1320px) {
    .filter-bar {
      padding: 0.75rem 1rem;
      gap: 1rem;
    }

    .desktop-filters {
      display: flex;
    }

    .mobile-filter-trigger {
      display: none;
    }

    .search-wrapper {
      flex: unset;
      width: 17.5rem;
    }
  }

  @container kanban (min-width: 2600px) {
    .filter-bar {
      font-size: 1rem;
    }

    .search-wrapper {
      width: 24rem;
    }

    .search-input {
      font-size: 1rem;
    }
  }
</style>
