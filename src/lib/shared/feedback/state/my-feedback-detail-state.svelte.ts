/**
 * My Feedback Detail State
 *
 * Singleton state for the feedback detail drawer.
 * Used to coordinate between MyFeedbackTab (list) and FeedbackModule (drawer rendering).
 * This allows the drawer to be rendered outside the tab's stacking context.
 */

import { mutateCurrentUrl } from "#lib/shared/navigation/services/url-state.js";
import type {
  FeedbackItem,
  FeedbackType,
} from "#lib/shared/feedback/domain/models/feedback-models.js";

// Singleton state
let selectedItem = $state<FeedbackItem | null>(null);
let updateHandler = $state<
  | ((
      feedbackId: string,
      updates: { type?: FeedbackType; description?: string },
      appendMode?: boolean
    ) => Promise<FeedbackItem>)
  | null
>(null);
let deleteHandler = $state<((feedbackId: string) => Promise<void>) | null>(
  null
);

// URL persistence helpers
function updateURLParam(feedbackId: string | null) {
  if (typeof window === "undefined") return;
  mutateCurrentUrl((url) => {
    if (feedbackId) {
      url.searchParams.set("feedback", feedbackId);
    } else {
      url.searchParams.delete("feedback");
    }
  });
}

function getURLParam(): string | null {
  if (typeof window === "undefined") return null;
  return new URL(window.location.href).searchParams.get("feedback");
}

export const myFeedbackDetailState = {
  get selectedItem() {
    return selectedItem;
  },
  get isOpen() {
    return selectedItem !== null;
  },

  getPersistedFeedbackId(): string | null {
    return getURLParam();
  },

  // Actions
  selectItem(item: FeedbackItem | null) {
    selectedItem = item;
    updateURLParam(item?.id ?? null);
  },

  close() {
    selectedItem = null;
    updateURLParam(null);
  },

  // Register handlers from MyFeedbackTab
  setHandlers(
    onUpdate: (
      feedbackId: string,
      updates: { type?: FeedbackType; description?: string },
      appendMode?: boolean
    ) => Promise<FeedbackItem>,
    onDelete: (feedbackId: string) => Promise<void>
  ) {
    updateHandler = onUpdate;
    deleteHandler = onDelete;
  },

  clearHandlers() {
    updateHandler = null;
    deleteHandler = null;
  },

  // Proxy methods for the detail component
  async updateItem(
    feedbackId: string,
    updates: { type?: FeedbackType; description?: string },
    appendMode?: boolean
  ): Promise<FeedbackItem> {
    if (!updateHandler) throw new Error("Update handler not registered");
    const updated = await updateHandler(feedbackId, updates, appendMode);
    // Update the selected item with new data
    if (selectedItem?.id === feedbackId) {
      selectedItem = updated;
    }
    return updated;
  },

  async deleteItem(feedbackId: string): Promise<void> {
    if (!deleteHandler) throw new Error("Delete handler not registered");
    await deleteHandler(feedbackId);
    // Close the drawer after deletion
    selectedItem = null;
  },
};
