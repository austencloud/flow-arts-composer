<!-- TrackerList - Filterable read-only list of feedback items -->
<script lang="ts">
  import type { FeedbackTrackerState } from "../../state/feedback-tracker-state.svelte";
  import type {
    TrackerTypeFilter,
    TrackerStatusFilter,
  } from "../../state/feedback-tracker-state.svelte";
  import TrackerCard from "./TrackerCard.svelte";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";

  const { trackerState }: {
    trackerState: FeedbackTrackerState;
  } = $props();

  // Track which card is expanded (inline detail)
  let expandedId: string | null = $state(null);

  function toggleExpanded(id: string) {
    expandedId = expandedId === id ? null : id;
  }

  // Type filter options
  const typeOptions = $derived([
    { value: "all" as TrackerTypeFilter, label: t("feedback_filter_all"), icon: "fa-layer-group" },
    { value: "bug" as TrackerTypeFilter, label: t("feedback_filter_bugs"), icon: "fa-bug" },
    { value: "feature" as TrackerTypeFilter, label: t("feedback_filter_features"), icon: "fa-lightbulb" },
    { value: "general" as TrackerTypeFilter, label: t("feedback_filter_general"), icon: "fa-comment" },
  ]);

  // Status filter options
  const statusOptions = $derived([
    { value: "all" as TrackerStatusFilter, label: t("feedback_filter_all"), icon: "fa-layer-group" },
    { value: "reported" as TrackerStatusFilter, label: t("feedback_filter_reported"), icon: "fa-inbox" },
    { value: "in-progress" as TrackerStatusFilter, label: t("feedback_filter_in_progress"), icon: "fa-spinner" },
    { value: "fixed" as TrackerStatusFilter, label: t("feedback_filter_fixed"), icon: "fa-check-circle" },
  ]);
</script>

<div class="tracker-list">
  <!-- Filter bar -->
  <div class="filter-bar">
    <div class="filter-row">
      <span class="filter-label">{t("feedback_filter_type")}</span>
      <div class="filter-chips" role="radiogroup" aria-label={t("create_review_filter_by_type")}>
        {#each typeOptions as opt}
          <button
            class="filter-chip"
            class:active={trackerState.typeFilter === opt.value}
            onclick={() => trackerState.setTypeFilter(opt.value)}
            type="button"
            role="radio"
            aria-checked={trackerState.typeFilter === opt.value}
          >
            <i class="fas {opt.icon}" aria-hidden="true"></i>
            {opt.label}
          </button>
        {/each}
      </div>
    </div>

    <div class="filter-row">
      <span class="filter-label">{t("feedback_filter_status")}</span>
      <div class="filter-chips" role="radiogroup" aria-label={t("create_review_filter_by_status")}>
        {#each statusOptions as opt}
          <button
            class="filter-chip"
            class:active={trackerState.statusFilter === opt.value}
            onclick={() => trackerState.setStatusFilter(opt.value)}
            type="button"
            role="radio"
            aria-checked={trackerState.statusFilter === opt.value}
          >
            <i class="fas {opt.icon}" aria-hidden="true"></i>
            {opt.label}
          </button>
        {/each}
      </div>
    </div>
  </div>

  <!-- Content -->
  <div class="list-content themed-scrollbar">
    {#if trackerState.isLoading}
      <div class="loading-state" role="status" aria-live="polite" aria-busy="true">
        <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
        <span>{t("feedback_loading_feedback")}</span>
      </div>
    {:else if trackerState.error}
      <div class="error-state" role="alert" aria-live="assertive">
        <i class="fas fa-exclamation-triangle" aria-hidden="true"></i>
        <span>{trackerState.error}</span>
      </div>
    {:else if trackerState.items.length === 0}
      <div class="empty-state">
        <i class="fas fa-inbox" aria-hidden="true"></i>
        <h2>{t("feedback_no_results")}</h2>
        <p>{t("feedback_no_results_hint")}</p>
      </div>
    {:else}
      <div class="card-list">
        {#each trackerState.items as item (item.id)}
          <TrackerCard
            {item}
            isExpanded={expandedId === item.id}
            onToggle={() => toggleExpanded(item.id)}
          />
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .tracker-list {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

  /* Filter bar */
  .filter-bar {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px 16px;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    flex-shrink: 0;
  }

  .filter-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .filter-label {
    font-size: var(--font-size-compact, 0.75rem);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    font-weight: 500;
    min-width: 44px;
  }

  .filter-chips {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  .filter-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 16px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    font-size: var(--font-size-compact, 0.75rem);
    cursor: pointer;
    transition: all var(--duration-normal, 200ms) ease;
  }

  .filter-chip i {
    font-size: 0.625rem;
  }

  .filter-chip:hover {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(255, 255, 255, 0.2);
    color: var(--theme-text, #ffffff);
  }

  .filter-chip.active {
    background: rgba(245, 158, 11, 0.15);
    border-color: rgba(245, 158, 11, 0.4);
    color: #f59e0b;
  }

  /* List content */
  .list-content {
    flex: 1;
    overflow-y: auto;
    padding: 12px 16px;
  }

  .card-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  /* States */
  .loading-state,
  .error-state,
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: 12px;
    padding: 32px;
    text-align: center;
  }

  .loading-state i {
    font-size: var(--font-size-2xl, 1.5rem);
    color: var(--semantic-info, #3b82f6);
  }

  .loading-state span {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
  }

  .error-state i {
    font-size: var(--font-size-3xl, 2rem);
    color: var(--semantic-error, #ef4444);
  }

  .error-state span {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
  }

  .empty-state i {
    font-size: var(--font-size-3xl, 2rem);
    color: var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  .empty-state h2 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--theme-text, #ffffff);
  }

  .empty-state p {
    margin: 0;
    max-width: 300px;
    font-size: var(--font-size-sm, 0.875rem);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    line-height: 1.5;
  }
</style>
