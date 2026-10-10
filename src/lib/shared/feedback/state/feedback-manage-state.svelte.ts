/**
 * Feedback Manage State
 *
 * State management for the feedback management tab (admin view).
 * Uses real-time Firestore listeners for reactive updates.
 */

import type {
  FeedbackItem,
  FeedbackFilterOptions,
  FeedbackStatus,
  FeedbackType,
  FeedbackPriority,
} from "#lib/shared/feedback/domain/models/feedback-models.js";
import { feedbackService } from "#lib/shared/feedback/services/feedback-repository.js";

/**
 * Creates feedback manage state with real-time updates
 */
export function createFeedbackManageState() {
  // List state - populated by real-time subscription
  let items = $state<FeedbackItem[]>([]);
  let isLoading = $state(true); // Start as loading until first snapshot
  let error = $state<string | null>(null);

  // Subscription cleanup
  let unsubscribe: (() => void) | null = null;
  let isSubscribed = $state(false);

  // Filter state (client-side filtering of real-time data)
  let filters = $state<FeedbackFilterOptions>({
    type: "all",
    status: "all",
    priority: "all",
  });

  // Search query
  let searchQuery = $state("");

  // Selected item for detail view
  let selectedItem = $state<FeedbackItem | null>(null);

  // Title generation state
  let isGeneratingTitle = $state(false);

  // Client-side filtered items based on filters and search query
  const filteredItems = $derived.by(() => {
    let result = items;

    if (filters.type !== "all") {
      result = result.filter((item) => item.type === filters.type);
    }

    if (filters.status !== "all") {
      result = result.filter((item) => item.status === filters.status);
    }

    if (filters.priority !== "all") {
      result = result.filter((item) => item.priority === filters.priority);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (item) =>
          item.title.toLowerCase().includes(query) ||
          item.description.toLowerCase().includes(query) ||
          item.userDisplayName.toLowerCase().includes(query)
      );
    }

    return result;
  });

  // Actions

  /**
   * Start real-time subscription to feedback items
   */
  function subscribe() {
    if (isSubscribed) return;

    isLoading = true;
    error = null;

    unsubscribe = feedbackService.subscribeToFeedback(
      (updatedItems) => {
        items = updatedItems;
        isLoading = false;
        isSubscribed = true;

        // Update selected item if it exists in the new data
        if (selectedItem) {
          const updated = updatedItems.find((i) => i.id === selectedItem!.id);
          if (updated) {
            selectedItem = updated;
          }
        }
      },
      (err) => {
        console.error("Failed to subscribe to feedback:", err);
        error = "Failed to load feedback";
        isLoading = false;
      }
    );
  }

  /**
   * Force refresh by restarting the subscription
   */
  function refresh() {
    unsubscribeFromFeedback();
    subscribe();
  }

  /**
   * Stop real-time subscription (call on cleanup)
   */
  function unsubscribeFromFeedback() {
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
      isSubscribed = false;
    }
  }

  /**
   * Legacy method for compatibility - now just starts subscription
   */
  async function loadFeedback(_reset = false) {
    subscribe();
  }

  function setFilter<K extends keyof FeedbackFilterOptions>(
    key: K,
    value: FeedbackFilterOptions[K]
  ) {
    // Filters are now applied client-side via derived state
    filters = { ...filters, [key]: value };
  }

  function selectItem(item: FeedbackItem | null) {
    selectedItem = item;
  }

  /**
   * Select a feedback item by ID
   * Returns true if found and selected, false otherwise
   */
  function selectItemById(feedbackId: string): boolean {
    const item = items.find((i) => i.id === feedbackId);
    if (item) {
      selectedItem = item;
      return true;
    }
    return false;
  }

  async function updateStatus(feedbackId: string, status: FeedbackStatus) {
    try {
      await feedbackService.updateStatus(feedbackId, status);
      // Update local state
      items = items.map((item) =>
        item.id === feedbackId
          ? { ...item, status, updatedAt: new Date() }
          : item
      );
      if (selectedItem?.id === feedbackId) {
        selectedItem = { ...selectedItem, status, updatedAt: new Date() };
      }
    } catch (err) {
      console.error("Failed to update status:", err);
      throw err;
    }
  }

  async function deleteFeedback(feedbackId: string) {
    try {
      await feedbackService.deleteFeedback(feedbackId);
      // Remove from local state
      items = items.filter((item) => item.id !== feedbackId);
      if (selectedItem?.id === feedbackId) {
        selectedItem = null;
      }
    } catch (err) {
      console.error("Failed to delete feedback:", err);
      throw err;
    }
  }

  /**
   * Update editable feedback fields
   */
  async function updateFeedback(
    feedbackId: string,
    updates: Partial<{
      type: FeedbackType;
      title: string;
      description: string;
      priority: FeedbackPriority | undefined;
      assignedTo: string | undefined;
      assignedToName: string | undefined;
    }>
  ) {
    try {
      await feedbackService.updateFeedback(feedbackId, updates);
      // Update local state
      const updateWithTimestamp = { ...updates, updatedAt: new Date() };
      items = items.map((item) =>
        item.id === feedbackId ? { ...item, ...updateWithTimestamp } : item
      );
      if (selectedItem?.id === feedbackId) {
        selectedItem = { ...selectedItem, ...updateWithTimestamp };
      }
    } catch (err) {
      console.error("Failed to update feedback:", err);
      throw err;
    }
  }

  /**
   * Legacy method - no longer needed with real-time subscription
   * Kept for compatibility
   */
  function loadMore() {
    // Real-time subscription handles all data loading
    // This is a no-op now but kept for backward compatibility
  }

  /**
   * Refresh a single item (reload from server)
   */
  async function refreshItem(feedbackId: string) {
    try {
      const updated = await feedbackService.getFeedback(feedbackId);
      if (updated) {
        items = items.map((item) => (item.id === feedbackId ? updated : item));
        if (selectedItem?.id === feedbackId) {
          selectedItem = updated;
        }
      }
    } catch (err) {
      console.error("Failed to refresh item:", err);
    }
  }

  function setSearchQuery(query: string) {
    searchQuery = query;
  }

  async function generateTitle(
    feedbackId: string,
    description: string
  ): Promise<string | null> {
    if (isGeneratingTitle) return null;

    isGeneratingTitle = true;

    try {
      // Use browser-based simple title extraction as fallback
      // In practice, this would be handled by Claude Code directly
      let title = description.substring(0, 60);
      const lastSpace = title.lastIndexOf(" ");
      if (lastSpace > 30 && title.length >= 60) {
        title = title.substring(0, lastSpace) + "...";
      }

      if (title) {
        // Save the generated title
        await feedbackService.updateFeedback(feedbackId, { title });

        // Update local state
        items = items.map((item) =>
          item.id === feedbackId
            ? { ...item, title, updatedAt: new Date() }
            : item
        );
        if (selectedItem?.id === feedbackId) {
          selectedItem = { ...selectedItem, title, updatedAt: new Date() };
        }
      }

      return title;
    } catch (err) {
      console.error("Failed to generate title:", err);
      throw err;
    } finally {
      isGeneratingTitle = false;
    }
  }

  /**
   * Defer feedback to be reactivated at a future date
   */
  async function deferFeedback(
    feedbackId: string,
    deferDate: string,
    notes: string
  ) {
    try {
      const deferredUntil = new Date(deferDate);
      await feedbackService.deferFeedback(feedbackId, deferredUntil, notes);

      // Update local state - move to archived with deferredUntil
      items = items.map((item) =>
        item.id === feedbackId
          ? {
              ...item,
              status: "archived",
              deferredUntil,
              adminNotes: notes,
              archivedAt: new Date(),
              updatedAt: new Date(),
            }
          : item
      );
      if (selectedItem?.id === feedbackId) {
        selectedItem = {
          ...selectedItem,
          status: "archived",
          deferredUntil,
          adminNotes: notes,
          archivedAt: new Date(),
          updatedAt: new Date(),
        };
      }
    } catch (err) {
      console.error("Failed to defer feedback:", err);
      throw err;
    }
  }

  return {
    // State
    get items() {
      return filteredItems;
    },
    get allItems() {
      return items; // Unfiltered items for kanban board
    },
    get searchQuery() {
      return searchQuery;
    },
    get isLoading() {
      return isLoading;
    },
    get error() {
      return error;
    },
    get filters() {
      return filters;
    },
    get selectedItem() {
      return selectedItem;
    },
    get isGeneratingTitle() {
      return isGeneratingTitle;
    },
    get isSubscribed() {
      return isSubscribed;
    },

    // Actions
    subscribe,
    unsubscribe: unsubscribeFromFeedback,
    refresh,
    loadFeedback, // Legacy compatibility
    setFilter,
    setSearchQuery,
    selectItem,
    selectItemById,
    updateStatus,
    updateFeedback,
    deleteFeedback,
    loadMore, // Legacy compatibility
    refreshItem,

    // Title generation
    generateTitle,

    // Deferment
    deferFeedback,
  };
}

export type FeedbackManageState = ReturnType<typeof createFeedbackManageState>;
