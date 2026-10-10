<!-- FilterMobileSheet - Bottom sheet with all filter sections for mobile -->
<script lang="ts">
  import { getHapticFeedback } from "#lib/shared/application/get-haptic-feedback.js";
  import type { HapticFeedback } from "#lib/shared/application/services/haptic-feedback.js";
  import type { FeedbackManageState } from "#lib/shared/feedback/state/feedback-manage-state.svelte.js";
  import type { FilterBarUIState } from "../../state/filter-bar-ui-state.svelte";
  import {
    TYPE_CONFIG,
    STATUS_CONFIG,
    PRIORITY_CONFIG,
  } from "#lib/shared/feedback/domain/models/feedback-models.js";
  import type {
    FeedbackType,
    FeedbackStatus,
    FeedbackPriority,
  } from "#lib/shared/feedback/domain/models/feedback-models.js";
  import FilterSectionHeader from "./FilterSectionHeader.svelte";
  import FilterOptionGrid from "./FilterOptionGrid.svelte";

  interface Props {
    manageState: FeedbackManageState;
    uiState: FilterBarUIState;
  }

  const { manageState, uiState }: Props = $props();

  const hapticService = getHapticFeedback();

  function handleTypeFilter(type: FeedbackType | "all") {
    hapticService?.trigger("selection");
    manageState.setFilter("type", type);
  }

  function handleStatusFilter(status: FeedbackStatus | "all") {
    hapticService?.trigger("selection");
    manageState.setFilter("status", status);
  }

  function handlePriorityFilter(priority: FeedbackPriority | "all") {
    hapticService?.trigger("selection");
    manageState.setFilter("priority", priority);
  }

  function clearFilters() {
    hapticService?.trigger("selection");
    manageState.setFilter("type", "all");
    manageState.setFilter("status", "all");
    manageState.setFilter("priority", "all");
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      uiState.closeSheet();
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      uiState.closeSheet();
    }
  }

  // Prepare filter options for grid components
  const typeOptions = [
    {
      value: "all",
      label: "All Types",
      icon: "",
      color: "var(--semantic-success)",
    },
    ...Object.entries(TYPE_CONFIG).map(([value, config]) => ({
      value,
      label: config.label
        .replace(" Report", "")
        .replace(" Request", "")
        .replace(" Feedback", ""),
      icon: config.icon,
      color: config.color,
    })),
  ];

  const statusOptions = [
    {
      value: "all",
      label: "All Status",
      icon: "",
      color: "var(--semantic-success)",
    },
    ...Object.entries(STATUS_CONFIG).map(([value, config]) => ({
      value,
      label: config.label,
      icon: config.icon,
      color: config.color,
    })),
  ];

  const priorityOptions = [
    {
      value: "all",
      label: "All Priority",
      icon: "",
      color: "var(--semantic-success)",
    },
    ...Object.entries(PRIORITY_CONFIG).map(([value, config]) => ({
      value,
      label: config.label,
      icon: config.icon,
      color: config.color,
    })),
  ];
</script>

<svelte:window onkeydown={uiState.isSheetOpen ? handleKeydown : undefined} />

{#if uiState.isSheetOpen}
  <div
    class="sheet-backdrop"
    class:closing={uiState.isSheetAnimating && !uiState.isSheetOpen}
    onclick={handleBackdropClick}
    onkeydown={(e) => e.key === "Escape" && uiState.closeSheet()}
    role="button"
    tabindex="0"
    aria-label="Close filter sheet"
  >
    <div
      class="sheet-container"
      class:closing={uiState.isSheetAnimating && !uiState.isSheetOpen}
      role="dialog"
      aria-modal="true"
      aria-label="Filter options"
    >
      <!-- Handle -->
      <button
        type="button"
        class="sheet-handle-area"
        onclick={() => uiState.closeSheet()}
        aria-label="Close filters"
      >
        <div class="sheet-handle"></div>
      </button>

      <!-- Header -->
      <header class="sheet-header">
        <h2 class="sheet-title">
          <i class="fas fa-filter" aria-hidden="true"></i>
          Filters
        </h2>
        {#if uiState.activeFilterCount > 0}
          <span class="active-count">{uiState.activeFilterCount} active</span>
        {/if}
        <button
          type="button"
          class="sheet-close"
          onclick={() => uiState.closeSheet()}
          aria-label="Close filters"
        >
          <i class="fas fa-times" aria-hidden="true"></i>
        </button>
      </header>

      <!-- Content -->
      <div class="sheet-content">
        <!-- Type filter -->
        <div
          class="filter-section"
          class:expanded={uiState.activeSection === "type" ||
            uiState.activeSection === null}
        >
          <FilterSectionHeader
            title="Type"
            isActive={manageState.filters.type !== "all"}
            isExpanded={uiState.activeSection === "type" ||
              uiState.activeSection === null}
            onToggle={() => uiState.toggleSection("type")}
          />
          <div class="filter-options">
            <FilterOptionGrid
              options={typeOptions}
              selectedValue={manageState.filters.type}
              onSelect={(v) => handleTypeFilter(v as FeedbackType | "all")}
              showIcons={true}
              isVertical={true}
            />
          </div>
        </div>

        <!-- Status filter -->
        <div
          class="filter-section"
          class:expanded={uiState.activeSection === "status" ||
            uiState.activeSection === null}
        >
          <FilterSectionHeader
            title="Status"
            isActive={manageState.filters.status !== "all"}
            isExpanded={uiState.activeSection === "status" ||
              uiState.activeSection === null}
            onToggle={() => uiState.toggleSection("status")}
          />
          <div class="filter-options">
            <FilterOptionGrid
              options={statusOptions}
              selectedValue={manageState.filters.status}
              onSelect={(v) => handleStatusFilter(v as FeedbackStatus | "all")}
              showIcons={true}
              isVertical={true}
            />
          </div>
        </div>

        <!-- Priority filter -->
        <div
          class="filter-section"
          class:expanded={uiState.activeSection === "priority" ||
            uiState.activeSection === null}
        >
          <FilterSectionHeader
            title="Priority"
            isActive={manageState.filters.priority !== "all"}
            isExpanded={uiState.activeSection === "priority" ||
              uiState.activeSection === null}
            onToggle={() => uiState.toggleSection("priority")}
          />
          <div class="filter-options">
            <FilterOptionGrid
              options={priorityOptions}
              selectedValue={manageState.filters.priority}
              onSelect={(v) =>
                handlePriorityFilter(v as FeedbackPriority | "all")}
              showIcons={true}
              isVertical={true}
            />
          </div>
        </div>
      </div>

      <!-- Footer -->
      <footer class="sheet-footer">
        <button
          type="button"
          class="sheet-btn secondary"
          onclick={clearFilters}
          disabled={uiState.activeFilterCount === 0}
        >
          <i class="fas fa-undo" aria-hidden="true"></i>
          Clear All
        </button>
        <button
          type="button"
          class="sheet-btn primary"
          onclick={() => uiState.closeSheet()}
        >
          <i class="fas fa-check" aria-hidden="true"></i>
          Done
        </button>
      </footer>
    </div>
  </div>
{/if}

<style>
  .sheet-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(8px);
    z-index: var(--z-modal);
    animation: fadeIn var(--duration-normal) ease;
  }

  .sheet-backdrop.closing {
    animation: fadeOut var(--duration-normal) ease forwards;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  @keyframes fadeOut {
    from {
      opacity: 1;
    }
    to {
      opacity: 0;
    }
  }

  .sheet-container {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    max-height: 85vh;
    background: var(
      --theme-panel-bg,
      linear-gradient(180deg, #1e1e24 0%, #16161a 100%)
    );
    border-radius: 20px 20px 0 0;
    display: flex;
    flex-direction: column;
    animation: slideUp var(--duration-dramatic) cubic-bezier(0.34, 1.56, 0.64, 1);
    padding-bottom: env(safe-area-inset-bottom, 0px);
    box-shadow: 0 -8px 32px rgba(0, 0, 0, 0.5);
  }

  .sheet-container.closing {
    animation: slideDown var(--duration-emphasis) cubic-bezier(0.4, 0, 0.2, 1) forwards;
  }

  @keyframes slideUp {
    from {
      transform: translateY(100%);
    }
    to {
      transform: translateY(0);
    }
  }

  @keyframes slideDown {
    from {
      transform: translateY(0);
    }
    to {
      transform: translateY(100%);
    }
  }

  .sheet-handle-area {
    display: flex;
    justify-content: center;
    width: 100%;
    padding: 13px 0;
    background: none;
    border: none;
    cursor: pointer;
  }

  .sheet-handle {
    width: 40px;
    height: 5px;
    background: var(--theme-stroke-strong);
    border-radius: 3px;
    transition: background var(--duration-normal) ease;
  }

  .sheet-handle-area:hover .sheet-handle {
    background: var(--theme-text-dim);
  }

  .sheet-header {
    display: flex;
    align-items: center;
    gap: 13px;
    padding: 0 21px 21px;
    border-bottom: 1px solid var(--theme-stroke, var(--theme-stroke));
  }

  .sheet-title {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: var(--theme-text);
  }

  .sheet-title i {
    color: var(--semantic-success, var(--semantic-success));
  }

  .active-count {
    margin-left: auto;
    margin-right: 8px;
    padding: 4px 8px;
    background: color-mix(
      in srgb,
      var(--semantic-success, var(--semantic-success)) 15%,
      transparent
    );
    border-radius: 999px;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--semantic-success, var(--semantic-success));
  }

  .sheet-close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--min-touch-target);
    height: var(--min-touch-target);
    margin: calc(-1 * 13px);
    margin-left: 0;
    background: none;
    border: none;
    color: var(--theme-text-dim, var(--theme-text-dim));
    cursor: pointer;
    border-radius: 12px;
    transition: all var(--duration-fast) ease;
  }

  .sheet-close:hover {
    background: var(--theme-card-hover-bg);
    color: var(--theme-text);
  }

  .sheet-close:active {
    transform: scale(0.95);
  }

  .sheet-content {
    flex: 1;
    overflow-y: auto;
    padding: 13px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .filter-section {
    display: flex;
    flex-direction: column;
    background: var(--theme-card-bg, var(--theme-card-bg));
    border: 1px solid var(--theme-stroke, var(--theme-stroke));
    border-radius: 12px;
    overflow: hidden;
  }

  .filter-options {
    display: none;
    flex-direction: column;
    gap: 2px;
    padding: 6px;
    padding-top: 0;
  }

  .filter-section.expanded .filter-options {
    display: flex;
    animation: expandIn var(--duration-normal) ease;
  }

  @keyframes expandIn {
    from {
      opacity: 0;
      transform: translateY(-8px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .sheet-footer {
    display: flex;
    gap: 13px;
    padding: 21px;
    border-top: 1px solid var(--theme-stroke, var(--theme-stroke));
    background: rgba(0, 0, 0, 0.2);
  }

  .sheet-btn {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    height: var(--min-touch-target);
    border: none;
    border-radius: 12px;
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
    transition: all var(--duration-normal) cubic-bezier(0.4, 0, 0.2, 1);
  }

  .sheet-btn:active {
    transform: scale(0.98);
  }

  .sheet-btn.secondary {
    background: var(--theme-card-bg, var(--theme-card-bg));
    border: 1px solid var(--theme-stroke, var(--theme-stroke));
    color: var(--theme-text-dim, var(--theme-text-dim));
  }

  .sheet-btn.secondary:hover:not(:disabled) {
    background: var(--theme-card-hover-bg);
    color: var(--theme-text);
  }

  .sheet-btn.secondary:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .sheet-btn.primary {
    background: linear-gradient(
      135deg,
      color-mix(
          in srgb,
          var(--semantic-success, var(--semantic-success)) 80%,
          white
        )
        0%,
      var(--semantic-success, var(--semantic-success)) 100%
    );
    color: white;
    box-shadow: 0 4px 16px
      color-mix(
        in srgb,
        var(--semantic-success, var(--semantic-success)) 25%,
        transparent
      );
  }

  .sheet-btn.primary:hover {
    box-shadow: 0 6px 20px
      color-mix(
        in srgb,
        var(--semantic-success, var(--semantic-success)) 35%,
        transparent
      );
    transform: translateY(-1px);
  }

  .sheet-btn.primary:active {
    transform: translateY(0) scale(0.98);
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .sheet-backdrop,
    .sheet-container,
    .filter-options {
      animation: none;
    }

    /* Closing variants rely on `forwards` fill to hold the hidden end state,
       so collapse their duration instead of removing the animation. */
    .sheet-backdrop.closing,
    .sheet-container.closing {
      animation-duration: 0.01ms;
    }
  }
</style>
