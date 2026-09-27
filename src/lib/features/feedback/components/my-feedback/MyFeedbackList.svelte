<!-- MyFeedbackList - List of tester's own feedback items -->
<script lang="ts">
  import { onMount } from "svelte";
  import type {
    FeedbackItem,
    FeedbackStatus,
  } from "$lib/shared/feedback/domain/models/feedback-models";
  import { STATUS_CONFIG } from "$lib/shared/feedback/domain/models/feedback-models";
  import MyFeedbackCard from "./MyFeedbackCard.svelte";
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import { feedbackStatusLabel } from "../../domain/feedback-display-labels";

  const { items, selectedItemId, onSelect, isLoading } = $props<{
    items: FeedbackItem[];
    selectedItemId: string | null;
    onSelect: (item: FeedbackItem) => void;
    isLoading: boolean;
  }>();

  // Filter state - default to "new" as most actionable
  let selectedStatus = $state<FeedbackStatus>("new");

  // Load persisted filter state on mount
  onMount(() => {
    const stored = localStorage.getItem("my-feedback-filter");
    if (
      stored &&
      ["new", "in-progress", "in-review", "completed", "archived"].includes(
        stored
      )
    ) {
      selectedStatus = stored as FeedbackStatus;
    }
  });

  // Persist filter state when it changes
  $effect(() => {
    localStorage.setItem("my-feedback-filter", selectedStatus);
  });

  // Filtered items based on status
  const filteredItems = $derived(
    items.filter((item: FeedbackItem) => item.status === selectedStatus)
  );

  // Status order for sorting
  const statusOrder: FeedbackStatus[] = [
    "new",
    "in-progress",
    "in-review",
    "completed",
    "archived",
  ];
</script>

<div class="feedback-list">
  <!-- Filter controls -->
  <div class="filter-bar">
    {#each statusOrder as status}
      {@const count = items.filter(
        (item: FeedbackItem) => item.status === status
      ).length}
      {#if count > 0}
        <button
          class="filter-chip"
          class:active={selectedStatus === status}
          onclick={() => (selectedStatus = status)}
          style="--status-color: {STATUS_CONFIG[status].color}"
        >
          <i class="fas {STATUS_CONFIG[status].icon}" aria-hidden="true"></i>
          <span>{feedbackStatusLabel(status)}</span>
          <span class="count">{count}</span>
        </button>
      {/if}
    {/each}
  </div>

  <section class="all-section">
    <header class="section-header">
      <i class="fas fa-list" aria-hidden="true"></i>
      <span>{feedbackStatusLabel(selectedStatus)}</span>
      <span class="count">{filteredItems.length}</span>
    </header>

    <div class="section-items">
      {#each filteredItems as item (item.id)}
        <MyFeedbackCard
          {item}
          isSelected={selectedItemId === item.id}
          onClick={() => onSelect(item)}
        />
      {/each}
    </div>

    {#if filteredItems.length === 0 && !isLoading}
      <div class="empty-filter">
        <i class="fas fa-filter" aria-hidden="true"></i>
        <span
          >{t("feedback_no_status_feedback", {
            status: feedbackStatusLabel(selectedStatus).toLowerCase(),
          })}</span
        >
      </div>
    {/if}

    {#if isLoading}
      <div class="loading-more">
        <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
        <span>{t("feedback_loading_more")}</span>
      </div>
    {/if}
  </section>
</div>

<style>
  .feedback-list {
    flex: 1;
    min-width: 0;
    overflow-y: auto;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  /* Filter bar */
  .filter-bar {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--theme-stroke);
  }

  .filter-chip {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    background: linear-gradient(
      135deg,
      var(--theme-card-bg) 0%,
      var(--theme-card-hover-bg) 100%
    );
    border: 1.5px solid var(--theme-stroke-strong, var(--theme-stroke-strong));
    border-radius: 20px;
    color: var(--theme-text-dim, var(--theme-text-dim));
    font-size: 0.8125rem;
    font-weight: 500;
    cursor: pointer;
    transition: all var(--duration-normal) ease;
    box-shadow: 0 2px 8px var(--theme-shadow);
  }

  .filter-chip:hover {
    background: linear-gradient(
      135deg,
      var(--theme-card-hover-bg) 0%,
      color-mix(in srgb, var(--theme-card-hover-bg) 90%, white) 100%
    );
    border-color: color-mix(in srgb, var(--theme-text) 30%, transparent);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
    transform: translateY(-1px);
  }

  .filter-chip.active {
    background: linear-gradient(
      135deg,
      var(--status-color, var(--semantic-info)) 0%,
      color-mix(in srgb, var(--status-color, var(--semantic-info)) 80%, black)
        100%
    );
    border: 1.5px solid
      color-mix(in srgb, var(--status-color, var(--semantic-info)) 120%, white);
    color: #ffffff;
    box-shadow:
      0 6px 16px
        color-mix(in srgb, var(--status-color, var(--semantic-info)) 40%, black),
      0 0 0 1px
        color-mix(
          in srgb,
          var(--status-color, var(--semantic-info)) 50%,
          transparent
        );
    transform: translateY(-2px);
  }

  .filter-chip i {
    font-size: 0.75rem;
  }

  .filter-chip .count {
    padding: 1px 6px;
    background: rgba(0, 0, 0, 0.2);
    border-radius: 10px;
    font-size: 0.6875rem;
    font-weight: 600;
  }

  /* Section styling */
  section {
    margin-bottom: 24px;
  }

  .section-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 0;
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--theme-text-dim, var(--theme-text-dim));
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .section-header i {
    font-size: 0.875rem;
  }

  .section-header .count {
    margin-left: auto;
    padding: 2px 8px;
    background: var(--theme-card-hover-bg);
    border-radius: 10px;
    font-size: 0.75rem;
  }

  /* Items container */
  .section-items {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  /* Loading more */
  .loading-more {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 16px;
    color: var(--theme-text-dim, var(--theme-text-dim));
    font-size: 0.875rem;
  }

  /* Empty filter state */
  .empty-filter {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 32px;
    color: color-mix(
      in srgb,
      var(--theme-text-dim, var(--theme-text-dim)) 80%,
      transparent
    );
    text-align: center;
  }

  .empty-filter i {
    font-size: var(--font-size-3xl);
    opacity: 0.5;
  }

  /* Scrollbar */
  .feedback-list::-webkit-scrollbar {
    width: 6px;
  }

  .feedback-list::-webkit-scrollbar-track {
    background: transparent;
  }

  .feedback-list::-webkit-scrollbar-thumb {
    background: var(--scrollbar-thumb);
    border-radius: 3px;
  }

  .feedback-list::-webkit-scrollbar-thumb:hover {
    background: var(--scrollbar-thumb-hover);
  }

  /* Container query for responsive layout */
  @container my-feedback (max-width: 600px) {
    .feedback-list {
      padding: 12px;
    }
  }
</style>
