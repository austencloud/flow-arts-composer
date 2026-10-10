<script lang="ts" module>
  import type { UserNotification } from "#lib/shared/notifications/domain/models/notification-models.js";

  export interface FilterState {
    readStatus: "all" | "unread" | "read";
    type: UserNotification["type"] | "all";
    searchQuery: string;
  }
</script>

<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  /**
   * NotificationFilter - Modern chip-based filter controls
   */

  import { slide } from "svelte/transition";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  // Note: UserNotification type is imported in the module script above

  interface Props {
    onFilterChange: (filters: FilterState) => void;
  }

  let { onFilterChange }: Props = $props();

  let filters = $state<FilterState>({
    readStatus: "all", // Always "all" now - no read/unread filtering
    type: "all",
    searchQuery: "",
  });

  let isTypeSheetOpen = $state(false);
  let showTypeFilters = $state(false);

  // Notify parent when filters change
  $effect(() => {
    onFilterChange(filters);
  });

  const notificationTypes: Array<{
    value: UserNotification["type"] | "all";
    label: string;
  }> = $derived([
    { value: "all", label: t("notifications_filter_all_types") },
    { value: "feedback-resolved", label: t("notifications_filter_resolved") },
    { value: "feedback-in-progress", label: t("notifications_filter_in_progress") },
    { value: "feedback-needs-info", label: t("notifications_filter_needs_info") },
    { value: "feedback-response", label: t("notifications_filter_response") },
    { value: "sequence-liked", label: t("notifications_filter_likes") },
    { value: "user-followed", label: t("notifications_filter_follows") },
    { value: "achievement-unlocked", label: t("notifications_filter_achievements") },
    { value: "message-received", label: t("notifications_filter_messages") },
    { value: "system-announcement", label: t("notifications_filter_announcements") },
  ]);

  function getTypeLabel(value: UserNotification["type"] | "all"): string {
    return (
      notificationTypes.find((t) => t.value === value)?.label || t("notifications_filter_all_types")
    );
  }
</script>

<div class="notification-filter">
  <!-- Search input -->
  <div class="search-box">
    <i class="fas fa-search" aria-hidden="true"></i>
    <input
      type="text"
      placeholder={t("notifications_search_placeholder")}
      bind:value={filters.searchQuery}
      aria-label={t("notifications_search")}
    />
    {#if filters.searchQuery}
      <button
        class="clear-search"
        onclick={() => (filters.searchQuery = "")}
        aria-label={t("notifications_clear_search")}
      >
        <i class="fas fa-times" aria-hidden="true"></i>
      </button>
    {/if}
  </div>

  <!-- Optional type filter toggle (only shows if filter is active or explicitly opened) -->
  {#if filters.type !== "all" || showTypeFilters}
    <div class="filter-header">
      <button
        class="filter-toggle-btn"
        class:active={showTypeFilters}
        onclick={() => (showTypeFilters = !showTypeFilters)}
        aria-label={t("notifications_toggle_filters")}
        title={showTypeFilters ? t("notifications_hide_filters") : t("notifications_filter_by_type")}
      >
        <i class="fas fa-filter" aria-hidden="true"></i>
        <span>{t("notifications_filter_by_type")}</span>
        {#if filters.type !== "all"}
          <span class="active-filter-badge"></span>
        {/if}
      </button>
    </div>
  {/if}

  <!-- Collapsible type filters -->
  {#if showTypeFilters}
    <div class="type-filter" transition:slide={{ duration: 200 }}>
      <!-- Desktop: Single-select segmented control -->
      <div class="segmented-wrap desktop-only">
        <SegmentedControl
          options={notificationTypes}
          value={filters.type}
          onchange={(value) => (filters.type = value)}
          color="accent"
          size="sm"
        />
      </div>

      <!-- Mobile: Button to open type selector sheet -->
      <button
        class="type-selector-btn mobile-only"
        onclick={() => (isTypeSheetOpen = true)}
        aria-label={t("notifications_select_type")}
      >
        <i class="fas fa-filter" aria-hidden="true"></i>
        <span>{getTypeLabel(filters.type)}</span>
        <i class="fas fa-chevron-down" aria-hidden="true"></i>
      </button>
    </div>
  {/if}
</div>

<!-- Mobile type selector sheet -->
{#if isTypeSheetOpen}
  <div
    class="sheet-overlay"
    onclick={() => (isTypeSheetOpen = false)}
    onkeydown={(e) => {
      if (e.key === "Escape" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        isTypeSheetOpen = false;
      }
    }}
    role="button"
    tabindex="0"
    aria-label={t("notifications_close_selector")}
  >
    <div
      class="sheet"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
      aria-label={t("notifications_select_type")}
      tabindex="-1"
    >
      <div class="sheet-header">
        <h3>{t("notifications_type")}</h3>
        <button
          class="close-btn"
          onclick={() => (isTypeSheetOpen = false)}
          aria-label={t("notifications_close")}
        >
          <i class="fas fa-times" aria-hidden="true"></i>
        </button>
      </div>
      <div class="sheet-content">
        {#each notificationTypes as type}
          <button
            class="type-option"
            class:active={filters.type === type.value}
            onclick={() => {
              filters.type = type.value;
              isTypeSheetOpen = false;
            }}
          >
            {type.label}
            {#if filters.type === type.value}
              <i class="fas fa-check" aria-hidden="true"></i>
            {/if}
          </button>
        {/each}
      </div>
    </div>
  </div>
{/if}

<style>
  .notification-filter {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 12px 16px;
    border-bottom: 1px solid var(--theme-stroke);
    background: var(--theme-panel-bg);
  }

  .search-box {
    position: relative;
    display: flex;
    align-items: center;
  }

  .search-box i.fa-search {
    position: absolute;
    left: 12px;
    color: var(--theme-text-dim, var(--theme-text-dim));
    font-size: var(--font-size-sm);
    pointer-events: none;
  }

  .search-box input {
    flex: 1;
    padding: 10px 12px 10px 36px;
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke, var(--theme-stroke));
    border-radius: 8px;
    color: var(--theme-text);
    font-size: var(--font-size-min);
    transition: all var(--duration-normal) ease;
  }

  .search-box input::placeholder {
    color: var(--theme-text-dim);
  }

  .search-box input:focus {
    outline: none;
    border-color: var(--theme-accent, var(--semantic-info));
    box-shadow: 0 0 0 2px
      color-mix(in srgb, var(--theme-accent) 20%, transparent);
  }

  .clear-search {
    position: absolute;
    right: 8px;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    border-radius: 4px;
    color: var(--theme-text-dim, var(--theme-text-dim));
    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  .clear-search:hover {
    background: var(--theme-card-hover-bg);
    color: var(--theme-text);
  }

  /* Filter header */
  .filter-header {
    display: flex;
    align-items: center;
    justify-content: flex-start;
  }

  /* Filter toggle button */
  .filter-toggle-btn {
    position: relative;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: transparent;
    border: none;
    border-radius: 8px;
    color: var(--theme-text-dim, var(--theme-text-dim));
    font-size: var(--font-size-min);
    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  .filter-toggle-btn:hover {
    background: var(--theme-card-bg);
    color: var(--theme-text);
  }

  .filter-toggle-btn.active {
    background: var(--theme-card-bg);
    color: var(--theme-accent, var(--semantic-info));
  }

  .filter-toggle-btn:focus-visible {
    outline: none;
    box-shadow: 0 0 0 2px
      color-mix(in srgb, var(--theme-accent) 50%, transparent);
  }

  .filter-toggle-btn i:first-child {
    font-size: var(--font-size-compact);
  }

  /* Active filter indicator badge */
  .active-filter-badge {
    position: absolute;
    top: 2px;
    right: 2px;
    width: 8px;
    height: 8px;
    background: var(--semantic-info, var(--semantic-info));
    border: 2px solid var(--theme-panel-bg);
    border-radius: 50%;
  }

  /* Type filter container */
  .type-filter {
    position: relative;
  }

  /* Desktop: Segmented control wrapper */
  .segmented-wrap {
    width: 100%;
  }

  /* Mobile: Type selector button */
  .type-selector-btn {
    display: none;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 10px 12px;
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke, var(--theme-stroke));
    border-radius: 8px;
    color: var(--theme-text);
    font-size: var(--font-size-min);
    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  .type-selector-btn:hover {
    background: var(--theme-card-hover-bg);
    border-color: var(--theme-stroke);
  }

  .type-selector-btn:focus-visible {
    outline: none;
    border-color: var(--theme-accent, var(--semantic-info));
    box-shadow: 0 0 0 2px
      color-mix(in srgb, var(--theme-accent) 20%, transparent);
  }

  .type-selector-btn span {
    flex: 1;
    text-align: left;
    margin: 0 8px;
  }

  /* Sheet overlay */
  .sheet-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(4px);
    z-index: var(--z-modal);
    animation: fadeIn var(--duration-normal) ease;
  }

  .sheet {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    max-height: 70vh;
    background: var(--theme-panel-bg);
    border-radius: 16px 16px 0 0;
    animation: slideUp var(--duration-emphasis) cubic-bezier(0.4, 0, 0.2, 1);
  }

  .sheet-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid var(--theme-stroke, var(--theme-stroke));
  }

  .sheet-header h3 {
    margin: 0;
    font-size: var(--font-size-lg);
    font-weight: 600;
    color: var(--theme-text);
  }

  .close-btn {
    width: var(--min-touch-target); /* WCAG AA touch target */
    height: var(--min-touch-target);
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    border-radius: 8px;
    color: var(--theme-text-dim, var(--theme-text-dim));
    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  .close-btn:hover {
    background: var(--theme-card-bg);
    color: var(--theme-text);
  }

  .sheet-content {
    overflow-y: auto;
    max-height: calc(70vh - 64px);
    padding: 8px;
  }

  .type-option {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    min-height: var(--min-touch-target);
    padding: 12px 16px;
    background: transparent;
    border: none;
    border-radius: 8px;
    color: var(--theme-text);
    font-size: var(--font-size-min);
    text-align: left;
    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  .type-option:hover {
    background: var(--theme-card-bg);
  }

  .type-option.active {
    background: var(--theme-card-bg, var(--theme-card-bg));
    color: var(--theme-accent, var(--semantic-info));
    font-weight: 500;
  }

  .type-option i.fa-check {
    color: var(--theme-accent, var(--semantic-info));
  }

  /* Responsive */
  @media (max-width: 768px) {
    .desktop-only {
      display: none !important;
    }

    .mobile-only {
      display: flex !important;
    }
  }

  @media (min-width: 769px) {
    .desktop-only {
      display: flex !important;
    }

    .mobile-only {
      display: none !important;
    }
  }

  /* Animations */
  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  @keyframes slideUp {
    from {
      transform: translateY(100%);
    }
    to {
      transform: translateY(0);
    }
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .search-box input,
    .clear-search,
    .filter-toggle-btn,
    .type-filter,
    .type-selector-btn,
    .close-btn,
    .type-option,
    .sheet-overlay,
    .sheet {
      transition: none !important;
      animation: none !important;
    }
  }
</style>
