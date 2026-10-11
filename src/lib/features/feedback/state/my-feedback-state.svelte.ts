/**
 * My Feedback State
 *
 * State management for the tester's personal feedback view.
 * Shows their submitted feedback and pending confirmations.
 * Supports preview mode for admin user viewing.
 *
 * Uses real-time Firestore subscription for automatic updates.
 */

import type {
  FeedbackItem,
  FeedbackType,
} from "#lib/shared/feedback/domain/models/feedback-models.js";
import { feedbackService } from "#lib/shared/feedback/services/feedback-repository.js";
import { authState } from "#lib/shared/auth/state/auth-state.svelte.js";
import { userPreviewState } from "#lib/shared/debug/state/user-preview-state.svelte.js";
import { toast } from "#lib/shared/toast/state/toast-state.svelte.js";

/**
 * Creates my feedback state for testers
 */
export function createMyFeedbackState() {
  // List state
  let items = $state<FeedbackItem[]>([]);
  let isLoading = $state(false);
  let error = $state<string | null>(null);

  // Selected item for detail view
  let selectedItem = $state<FeedbackItem | null>(null);

  // Subscription cleanup
  let unsubscribe: (() => void) | null = null;
  let subscribedUserId: string | null = null;

  // Derived: Items in progress
  const inProgress = $derived(
    items.filter(
      (item) => item.status === "in-progress" || item.status === "in-review"
    )
  );

  // Derived: Completed items
  const completed = $derived(
    items.filter((item) => item.status === "archived")
  );

  // Derived: New/pending items
  const pending = $derived(items.filter((item) => item.status === "new"));

  /**
   * Subscribe to real-time feedback updates for the current user
   */
  function subscribe() {
    // Use previewed user ID when preview mode is active, otherwise use actual user
    const effectiveUserId =
      userPreviewState.isActive && userPreviewState.data.profile
        ? userPreviewState.data.profile.uid
        : authState.user?.uid;

    if (!effectiveUserId) {
      console.warn("[MyFeedbackState] No user ID available for subscription");
      return;
    }

    // Don't resubscribe if already subscribed to this user
    if (subscribedUserId === effectiveUserId && unsubscribe) {
      return;
    }

    // Clean up existing subscription
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }

    isLoading = true;
    error = null;
    subscribedUserId = effectiveUserId;

    unsubscribe = feedbackService.subscribeToUserFeedback(
      effectiveUserId,
      (newItems) => {
        items = newItems;
        isLoading = false;

        // Update selected item if it changed
        if (selectedItem) {
          const updated = newItems.find((item) => item.id === selectedItem!.id);
          if (updated) {
            selectedItem = updated;
          }
        }
      },
      (err) => {
        console.error("Failed to subscribe to feedback:", err);
        error = "Failed to load your feedback";
        isLoading = false;
      }
    );
  }

  /**
   * Legacy method for compatibility - now just triggers subscription
   */
  async function loadMyFeedback(_reset = false) {
    subscribe();
  }

  function selectItem(item: FeedbackItem | null) {
    selectedItem = item;
  }

  // Update an item (user editing their own feedback)
  async function updateItem(
    feedbackId: string,
    updates: { type?: FeedbackType; description?: string },
    appendMode: boolean = false
  ): Promise<FeedbackItem> {
    // Block writes in preview mode
    if (userPreviewState.isActive) {
      toast.warning("Cannot edit feedback in preview mode");
      throw new Error("Cannot edit in preview mode");
    }

    const updatedItem = await feedbackService.updateUserFeedback(
      feedbackId,
      updates,
      appendMode
    );

    // Update in local state
    const index = items.findIndex((i) => i.id === feedbackId);
    if (index !== -1) {
      items = [
        ...items.slice(0, index),
        updatedItem,
        ...items.slice(index + 1),
      ];
    }

    // Update selected item if it's the one being edited
    if (selectedItem?.id === feedbackId) {
      selectedItem = updatedItem;
    }

    return updatedItem;
  }

  // Delete an item (user deleting their own new feedback)
  async function deleteItem(feedbackId: string): Promise<void> {
    // Block writes in preview mode
    if (userPreviewState.isActive) {
      toast.warning("Cannot delete feedback in preview mode");
      throw new Error("Cannot delete in preview mode");
    }

    await feedbackService.deleteUserFeedback(feedbackId);

    // Clear selection if deleted item was selected
    if (selectedItem?.id === feedbackId) {
      selectedItem = null;
    }

    // Remove from local state (real-time subscription will also update)
    items = items.filter((i) => i.id !== feedbackId);

    toast.success("Feedback deleted");
  }

  // Cleanup function - unsubscribe and reset state
  function cleanup() {
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
    subscribedUserId = null;
    items = [];
    selectedItem = null;
    error = null;
    isLoading = false;
  }

  return {
    // State (getters)
    get items() {
      return items;
    },
    get isLoading() {
      return isLoading;
    },
    get error() {
      return error;
    },
    get selectedItem() {
      return selectedItem;
    },

    // Derived
    get inProgress() {
      return inProgress;
    },
    get completed() {
      return completed;
    },
    get pending() {
      return pending;
    },

    // Actions
    subscribe,
    loadMyFeedback,
    selectItem,
    updateItem,
    deleteItem,
    cleanup,
  };
}

export type MyFeedbackState = ReturnType<typeof createMyFeedbackState>;
