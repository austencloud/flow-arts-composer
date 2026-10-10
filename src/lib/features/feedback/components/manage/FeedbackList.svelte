<!-- FeedbackList - Premium list with empty states, loading skeletons, and infinite scroll -->
<script lang="ts">
  import { onMount } from "svelte";
  import type { FeedbackManageState } from "#lib/shared/feedback/state/feedback-manage-state.svelte.js";
  import type { FeedbackStatus } from "#lib/shared/feedback/domain/models/feedback-models.js";
  import FeedbackCard from "./FeedbackCard.svelte";

  // Using 'manageState' to avoid conflict with $state rune
  const { manageState } = $props<{
    manageState: FeedbackManageState;
  }>();

  // Intersection observer for infinite scroll
  let loadMoreTrigger = $state<HTMLDivElement | null>(null);
  let observer: IntersectionObserver | null = null;

  onMount(() => {
    // Set up intersection observer for infinite scroll
    observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (
          entry?.isIntersecting &&
          manageState.hasMore &&
          !manageState.isLoading
        ) {
          manageState.loadMore();
        }
      },
      { rootMargin: "200px" }
    );

    return () => {
      observer?.disconnect();
    };
  });

  // Watch for loadMoreTrigger changes to observe/unobserve
  $effect(() => {
    if (loadMoreTrigger && observer) {
      observer.observe(loadMoreTrigger);
      return () => {
        if (loadMoreTrigger) {
          observer?.unobserve(loadMoreTrigger);
        }
      };
    }
    return undefined;
  });

  // Handlers for swipe actions
  async function handleStatusChange(itemId: string, status: FeedbackStatus) {
    try {
      await manageState.updateStatus(itemId, status);
    } catch {
      // Error is logged in state, could show toast here
    }
  }

  async function handleDelete(itemId: string) {
    try {
      await manageState.deleteFeedback(itemId);
    } catch {
      // Error is logged in state, could show toast here
    }
  }

  // Determine empty state message based on filters/search
  const emptyStateMessage = $derived(() => {
    if (manageState.searchQuery) {
      return {
        icon: "fa-search",
        title: "No results found",
        subtitle: `No feedback matching "${manageState.searchQuery}"`,
        hint: "Try different keywords or clear your search",
      };
    }
    if (
      manageState.filters.type !== "all" ||
      manageState.filters.status !== "all" ||
      manageState.filters.priority !== "all"
    ) {
      return {
        icon: "fa-filter",
        title: "No matching feedback",
        subtitle: "No items match your current filters",
        hint: "Try adjusting or clearing your filters",
      };
    }
    return {
      icon: "fa-inbox",
      title: "No feedback yet",
      subtitle: "Feedback submitted by users will appear here",
      hint: "Check back later for new submissions",
    };
  });
</script>

<div class="feedback-list">
  {#if manageState.error}
    <!-- Error State -->
    <div class="state-container error">
      <div class="state-icon error">
        <i class="fas fa-exclamation-triangle" aria-hidden="true"></i>
      </div>
      <h3 class="state-title">Couldn't load feedback</h3>
      <p class="state-subtitle">{manageState.error}</p>
      <button
        type="button"
        class="retry-btn"
        onclick={() => manageState.loadFeedback(true)}
      >
        <i class="fas fa-redo" aria-hidden="true"></i>
        Try Again
      </button>
    </div>
  {:else if manageState.isLoading && manageState.items.length === 0}
    <!-- Loading Skeleton -->
    <div class="list-items">
      {#each Array(5) as _, i}
        <div class="skeleton-card" style="animation-delay: {i * 100}ms">
          <div class="skeleton-type"></div>
          <div class="skeleton-content">
            <div class="skeleton-header">
              <div class="skeleton-title"></div>
              <div class="skeleton-badge"></div>
            </div>
            <div class="skeleton-description">
              <div class="skeleton-line"></div>
              <div class="skeleton-line short"></div>
            </div>
            <div class="skeleton-footer">
              <div class="skeleton-meta"></div>
              <div class="skeleton-meta"></div>
            </div>
          </div>
        </div>
      {/each}
    </div>
  {:else if manageState.items.length === 0}
    <!-- Empty State -->
    <div class="state-container">
      <div class="state-icon">
        <i class="fas {emptyStateMessage().icon}" aria-hidden="true"></i>
      </div>
      <h3 class="state-title">{emptyStateMessage().title}</h3>
      <p class="state-subtitle">{emptyStateMessage().subtitle}</p>
      <p class="state-hint">{emptyStateMessage().hint}</p>
    </div>
  {:else}
    <!-- Feedback Items -->
    <div class="list-items">
      {#each manageState.items as item (item.id)}
        <FeedbackCard
          {item}
          isSelected={manageState.selectedItem?.id === item.id}
          onClick={() => manageState.selectItem(item)}
          onStatusChange={(status) => handleStatusChange(item.id, status)}
          onDelete={() => handleDelete(item.id)}
        />
      {/each}

      <!-- Infinite scroll trigger -->
      {#if manageState.hasMore}
        <div bind:this={loadMoreTrigger} class="load-trigger">
          {#if manageState.isLoading}
            <div class="loading-more">
              <i class="fas fa-circle-notch fa-spin" aria-hidden="true"></i>
              <span>Loading more...</span>
            </div>
          {/if}
        </div>
      {/if}

      <!-- Manual load more as fallback -->
      {#if manageState.hasMore && !manageState.isLoading}
        <button
          type="button"
          class="load-more-btn"
          onclick={() => manageState.loadMore()}
        >
          Load More
        </button>
      {/if}

      <!-- End of list indicator -->
      {#if !manageState.hasMore && manageState.items.length > 0}
        <div class="end-indicator">
          <span class="end-line"></span>
          <span class="end-text">End of list</span>
          <span class="end-line"></span>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  /* ═══════════════════════════════════════════════════════════════════════════
     DESIGN TOKENS
     ═══════════════════════════════════════════════════════════════════════════ */
  .feedback-list {
    --fb-space-3xs: 4px;
    --fb-space-2xs: 6px;
    --fb-space-xs: 8px;
    --fb-space-sm: 13px;
    --fb-space-md: 21px;
    --fb-space-lg: 34px;
    --fb-space-xl: 55px;

    --fb-text-xs: 0.75rem;
    --fb-text-sm: 0.875rem;
    --fb-text-base: 1rem;
    --fb-text-lg: 1.25rem;

    --fb-radius-sm: 8px;
    --fb-radius-md: 12px;

    --fb-primary: var(--semantic-success, var(--semantic-success));
    --fb-error: var(--semantic-error, var(--semantic-error));
    --fb-surface: var(--theme-card-bg);
    --fb-border: var(--theme-stroke);
    --fb-text: var(--theme-text);
    --fb-text-muted: var(--theme-text-dim);
    --fb-text-subtle: color-mix(
      in srgb,
      var(--theme-text-dim) 70%,
      transparent
    );

    display: flex;
    flex-direction: column;
    height: 100%;
    overflow-y: auto;
    overflow-x: hidden;
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     LIST ITEMS CONTAINER
     ═══════════════════════════════════════════════════════════════════════════ */
  .list-items {
    display: flex;
    flex-direction: column;
    gap: var(--fb-space-sm);
    padding: var(--fb-space-sm);
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     STATE CONTAINERS (Empty, Error)
     ═══════════════════════════════════════════════════════════════════════════ */
  .state-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    flex: 1;
    min-height: 300px;
    padding: var(--fb-space-xl) var(--fb-space-md);
    text-align: center;
  }

  .state-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 80px;
    height: 80px;
    margin-bottom: var(--fb-space-md);
    background: var(--fb-surface);
    border: 1px solid var(--fb-border);
    border-radius: 50%;
    font-size: var(--font-size-3xl);
    color: var(--fb-text-subtle);
  }

  .state-icon.error {
    background: rgba(239, 68, 68, 0.1);
    border-color: rgba(239, 68, 68, 0.2);
    color: var(--fb-error);
  }

  .state-title {
    margin: 0 0 var(--fb-space-xs) 0;
    font-size: var(--fb-text-lg);
    font-weight: 600;
    color: var(--fb-text);
  }

  .state-subtitle {
    margin: 0;
    max-width: 280px;
    font-size: var(--fb-text-sm);
    color: var(--fb-text-muted);
    line-height: 1.5;
  }

  .state-hint {
    margin: var(--fb-space-md) 0 0 0;
    font-size: var(--fb-text-xs);
    color: var(--fb-text-subtle);
  }

  .retry-btn {
    display: flex;
    align-items: center;
    gap: var(--fb-space-xs);
    margin-top: var(--fb-space-md);
    padding: var(--fb-space-sm) var(--fb-space-md);
    background: rgba(239, 68, 68, 0.15);
    border: 1px solid rgba(239, 68, 68, 0.25);
    border-radius: var(--fb-radius-md);
    color: var(--fb-error);
    font-size: var(--fb-text-sm);
    font-weight: 500;
    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  .retry-btn:hover {
    background: rgba(239, 68, 68, 0.2);
    border-color: rgba(239, 68, 68, 0.35);
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     LOADING SKELETON
     ═══════════════════════════════════════════════════════════════════════════ */
  .skeleton-card {
    display: flex;
    gap: var(--fb-space-sm);
    padding: var(--fb-space-md);
    background: var(--fb-surface);
    border: 1px solid var(--fb-border);
    border-radius: var(--fb-radius-md);
    animation: skeletonFadeIn var(--duration-emphasis) ease backwards;
  }

  @keyframes skeletonFadeIn {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .skeleton-type {
    width: 40px;
    height: 40px;
    flex-shrink: 0;
    background: var(--fb-border);
    border-radius: var(--fb-radius-sm);
    animation: pulse 1.5s ease-in-out infinite;
  }

  .skeleton-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--fb-space-xs);
  }

  .skeleton-header {
    display: flex;
    align-items: center;
    gap: var(--fb-space-sm);
  }

  .skeleton-title {
    flex: 1;
    height: 18px;
    max-width: 200px;
    background: var(--fb-border);
    border-radius: 4px;
    animation: pulse 1.5s ease-in-out infinite;
  }

  .skeleton-badge {
    width: 60px;
    height: 20px;
    background: var(--fb-border);
    border-radius: 999px;
    animation: pulse 1.5s ease-in-out infinite;
  }

  .skeleton-description {
    display: flex;
    flex-direction: column;
    gap: var(--fb-space-2xs);
  }

  .skeleton-line {
    height: 14px;
    background: var(--fb-border);
    border-radius: 4px;
    animation: pulse 1.5s ease-in-out infinite;
  }

  .skeleton-line.short {
    width: 65%;
  }

  .skeleton-footer {
    display: flex;
    gap: var(--fb-space-md);
    margin-top: var(--fb-space-2xs);
  }

  .skeleton-meta {
    width: 80px;
    height: 12px;
    background: var(--fb-border);
    border-radius: 4px;
    animation: pulse 1.5s ease-in-out infinite;
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 0.4;
    }
    50% {
      opacity: 0.7;
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     LOAD MORE
     ═══════════════════════════════════════════════════════════════════════════ */
  .load-trigger {
    min-height: 60px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .loading-more {
    display: flex;
    align-items: center;
    gap: var(--fb-space-xs);
    padding: var(--fb-space-sm);
    color: var(--fb-text-subtle);
    font-size: var(--fb-text-sm);
  }

  .loading-more i {
    color: var(--fb-primary);
  }

  .load-more-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: var(--min-touch-target);
    background: var(--fb-surface);
    border: 1px solid var(--fb-border);
    border-radius: var(--fb-radius-md);
    color: var(--fb-text-muted);
    font-size: var(--fb-text-sm);
    font-weight: 500;
    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  .load-more-btn:hover {
    background: var(--theme-card-hover-bg);
    border-color: var(--theme-stroke-strong, var(--theme-stroke-strong));
    color: var(--fb-text);
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     END INDICATOR
     ═══════════════════════════════════════════════════════════════════════════ */
  .end-indicator {
    display: flex;
    align-items: center;
    gap: var(--fb-space-md);
    padding: var(--fb-space-md) 0;
  }

  .end-line {
    flex: 1;
    height: 1px;
    background: var(--fb-border);
  }

  .end-text {
    font-size: var(--fb-text-xs);
    color: var(--fb-text-subtle);
    white-space: nowrap;
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     RESPONSIVE
     ═══════════════════════════════════════════════════════════════════════════ */

  @media (min-width: 768px) {
    .list-items {
      padding: var(--fb-space-md);
      gap: var(--fb-space-md);
    }

    .state-icon {
      width: 96px;
      height: 96px;
      font-size: var(--font-size-3xl);
    }
  }

  /* Scrollbar styling */
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

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .skeleton-card,
    .skeleton-type,
    .skeleton-title,
    .skeleton-badge,
    .skeleton-line,
    .skeleton-meta {
      animation: none;
    }
  }
</style>
