/**
 * Feedback Tracker State
 *
 * Read-only state for the public Tracker tab. Any logged-in user can browse
 * reported bugs, features in progress, and recent fixes.
 *
 * Strips sensitive admin fields before exposing items to components.
 */

import type {
  FeedbackItem,
  FeedbackType,
  FeedbackStatus,
} from "#lib/shared/feedback/domain/models/feedback-models.js";
import { feedbackService } from "#lib/shared/feedback/services/feedback-repository.js";

/**
 * Public-safe subset of a FeedbackItem.
 * Excludes admin notes, claim tokens, device context, and other internal fields.
 */
export interface TrackerItem {
  id: string;
  title: string;
  description: string;
  type: FeedbackType;
  status: FeedbackStatus;
  priority?: string;
  createdAt: Date;
  userDisplayName: string;
  imageCount: number;
}

/** Simplified status for the tracker UI */
export type TrackerStatus = "reported" | "in-progress" | "fixed" | "released";

export const TRACKER_STATUS_CONFIG: Record<
  TrackerStatus,
  { label: string; color: string; icon: string }
> = {
  reported: { label: "Reported", color: "#3b82f6", icon: "fa-inbox" },
  "in-progress": {
    label: "In Progress",
    color: "#f59e0b",
    icon: "fa-spinner",
  },
  fixed: { label: "Fixed", color: "#10b981", icon: "fa-check-circle" },
  released: { label: "Released", color: "#6b7280", icon: "fa-rocket" },
};

/** Map internal statuses to simplified tracker statuses */
export function toTrackerStatus(status: FeedbackStatus): TrackerStatus {
  switch (status) {
    case "new":
      return "reported";
    case "in-progress":
    case "in-review":
      return "in-progress";
    case "completed":
      return "fixed";
    case "archived":
      return "released";
  }
}

/** Strip sensitive fields from a FeedbackItem */
function toTrackerItem(item: FeedbackItem): TrackerItem {
  return {
    id: item.id,
    title: item.title,
    description: item.description,
    type: item.type,
    status: item.status,
    priority: item.priority,
    createdAt: item.createdAt,
    userDisplayName: item.userDisplayName,
    imageCount: item.imageUrls?.length ?? 0,
  };
}

export type TrackerTypeFilter = FeedbackType | "all";
export type TrackerStatusFilter = TrackerStatus | "all";

/**
 * Creates read-only tracker state with real-time subscription.
 */
export function createFeedbackTrackerState() {
  let rawItems = $state<FeedbackItem[]>([]);
  let isLoading = $state(true);
  let error = $state<string | null>(null);

  let unsubscribeFn: (() => void) | null = null;
  let isSubscribed = $state(false);

  // Filters
  let typeFilter = $state<TrackerTypeFilter>("all");
  let statusFilter = $state<TrackerStatusFilter>("all");

  // Strip sensitive fields and apply filters
  const items = $derived.by(() => {
    let result = rawItems
      // Exclude soft-deleted items
      .filter((item) => !item.isDeleted);

    // Type filter
    if (typeFilter !== "all") {
      result = result.filter((item) => item.type === typeFilter);
    }

    // Status filter (map internal status to tracker status)
    if (statusFilter !== "all") {
      result = result.filter(
        (item) => toTrackerStatus(item.status) === statusFilter
      );
    }

    return result.map(toTrackerItem);
  });

  function subscribe() {
    if (isSubscribed) return;

    isLoading = true;
    error = null;

    unsubscribeFn = feedbackService.subscribeToFeedback(
      (updatedItems) => {
        rawItems = updatedItems;
        isLoading = false;
        isSubscribed = true;
      },
      (err) => {
        console.error("Failed to subscribe to feedback tracker:", err);
        error = "Failed to load feedback";
        isLoading = false;
      }
    );
  }

  function unsubscribe() {
    if (unsubscribeFn) {
      unsubscribeFn();
      unsubscribeFn = null;
      isSubscribed = false;
    }
  }

  function setTypeFilter(filter: TrackerTypeFilter) {
    typeFilter = filter;
  }

  function setStatusFilter(filter: TrackerStatusFilter) {
    statusFilter = filter;
  }

  return {
    get items() {
      return items;
    },
    get isLoading() {
      return isLoading;
    },
    get error() {
      return error;
    },
    get typeFilter() {
      return typeFilter;
    },
    get statusFilter() {
      return statusFilter;
    },

    subscribe,
    unsubscribe,
    setTypeFilter,
    setStatusFilter,
  };
}

export type FeedbackTrackerState = ReturnType<
  typeof createFeedbackTrackerState
>;
