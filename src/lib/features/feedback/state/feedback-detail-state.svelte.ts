/**
 * Feedback Detail State Factory
 *
 * Reactive state management for FeedbackDetailPanel using Svelte 5 runes.
 * Wraps services and manages panel-level state with change detection.
 * Uses $state for reactive primitives, $derived for computed values, $effect for side effects.
 */

import type { FeedbackItem, FeedbackType, FeedbackPriority, FeedbackStatus, } from "#lib/shared/feedback/domain/models/feedback-models.js";
import type { FeedbackManageState } from "#lib/shared/feedback/state/feedback-manage-state.svelte.js";
import { TYPE_CONFIG, PRIORITY_CONFIG } from "#lib/shared/feedback/domain/models/feedback-models.js";
import { getFeedbackEditor } from "#lib/features/feedback/get-feedback-editor.js";
import { getFeedbackFormatter } from "#lib/features/feedback/get-feedback-formatter.js";

/**
 * Creates reactive state for feedback detail panel
 */
export function createFeedbackDetailState(
  initialItem: FeedbackItem,
  manageState: FeedbackManageState | null,
  readOnly: boolean = false
) {
  // Resolve services via DI
  const editing = getFeedbackEditor();
  const formatting = getFeedbackFormatter();

  // Current item (updated by parent when real-time changes arrive)
  let item = $state<FeedbackItem>(initialItem);

  // Edit state - reactive primitives for inline editing
  let editType = $state<FeedbackType>(item.type);
  let editPriority = $state<FeedbackPriority | "">(item.priority || "");
  let editTitle = $state(item.title);
  let editDescription = $state(item.description);

  // Snapshot for change detection
  let originalSnapshot = $state(editing.createSnapshot(item));

  // UI state
  let isSaving = $state(false);
  let currentItemId = $state(item.id);

  // Status update state
  let isUpdatingStatus = $state(false);
  let lastUpdatedStatus = $state<string | null>(null);

  // Delete confirmation
  let showDeleteConfirm = $state(false);
  let isDeleting = $state(false);

  // Admin response state
  let adminResponseMessage = $state(item.adminResponse?.message || "");
  const isSendingResponse = $state(false);
  let showResponseForm = $state(false);

  // Derived state - configs from TYPE_CONFIG and PRIORITY_CONFIG
  const typeConfig = $derived(
    item.type && item.type in TYPE_CONFIG
      ? TYPE_CONFIG[item.type as keyof typeof TYPE_CONFIG]
      : { color: "#6b7280", icon: "fa-question-circle", label: "Unknown" }
  );

  const priorityConfig = $derived(
    item.priority && item.priority in PRIORITY_CONFIG
      ? PRIORITY_CONFIG[item.priority as keyof typeof PRIORITY_CONFIG]
      : null
  );

  // Derived state - change detection
  const hasChanges = $derived(
    editing.hasChanges(
      {
        type: editType,
        priority: editPriority,
        title: editTitle,
        description: editDescription,
      },
      originalSnapshot
    )
  );

  // Effect: Sync when item ID changes (different item selected)
  // This prevents resetting fields during typing when real-time updates arrive
  $effect(() => {
    if (item.id !== currentItemId) {
      currentItemId = item.id;
      originalSnapshot = editing.createSnapshot(item);

      // Sync edit fields to new item
      editType = item.type;
      editPriority = item.priority || "";
      editTitle = item.title;
      editDescription = item.description;

      // Sync admin response field
      adminResponseMessage = item.adminResponse?.message || "";
    }
  });

  // Public methods

  function updateItem(newItem: FeedbackItem) {
    item = newItem;
  }

  function restoreOriginal() {
    const restored = editing.restoreFromSnapshot(originalSnapshot);
    editType = restored.type;
    editPriority = restored.priority;
    editTitle = restored.title;
    editDescription = restored.description;
  }

  async function saveChanges() {
    if (readOnly || !manageState || isSaving || !hasChanges) return;
    isSaving = true;

    try {
      await manageState.updateFeedback(item.id, {
        type: editType,
        priority: editPriority || undefined,
        title: editTitle,
        description: editDescription,
      });

      // Update snapshot after successful save
      originalSnapshot = editing.createSnapshot({
        ...item,
        type: editType,
        priority: editPriority || undefined,
        title: editTitle,
        description: editDescription,
      } as FeedbackItem);
    } catch (err) {
      console.error("Failed to save changes:", err);
    } finally {
      isSaving = false;
    }
  }

  function handleFieldBlur() {
    if (hasChanges) {
      void saveChanges();
    }
  }

  async function handleStatusChange(status: FeedbackStatus) {
    if (readOnly || !manageState || isUpdatingStatus || item.status === status)
      return;
    isUpdatingStatus = true;
    lastUpdatedStatus = status;
    try {
      await manageState.updateStatus(item.id, status);
    } finally {
      isUpdatingStatus = false;
      // Clear animation trigger after delay
      setTimeout(() => {
        lastUpdatedStatus = null;
      }, 600);
    }
  }

  async function handleDelete() {
    if (readOnly || !manageState || isDeleting) return;
    isDeleting = true;
    try {
      await manageState.deleteFeedback(item.id);
    } finally {
      isDeleting = false;
      showDeleteConfirm = false;
    }
  }

  async function saveAssignment(userId?: string, displayName?: string) {
    if (readOnly || !manageState) return;
    try {
      await manageState.updateFeedback(item.id, {
        assignedTo: userId,
        assignedToName: displayName,
      });
      // Update local item so UI reflects immediately
      item = {
        ...item,
        assignedTo: userId,
        assignedToName: displayName,
        updatedAt: new Date(),
      };
    } catch (err) {
      console.error("Failed to save assignment:", err);
    }
  }

  // Formatting helpers (delegate to service)
  function formatDate(date: Date): string {
    return formatting.formatDate(date);
  }

  function formatRelativeTime(date: Date): string {
    return formatting.formatRelativeTime(date);
  }

  // Return public API with getters and setters for controlled access
  return {
    // Item data
    get item() {
      return item;
    },
    updateItem,

    // Edit state (with getters and setters)
    get editType() {
      return editType;
    },
    set editType(v: FeedbackType) {
      editType = v;
    },
    get editPriority() {
      return editPriority;
    },
    set editPriority(v: FeedbackPriority | "") {
      editPriority = v;
    },
    get editTitle() {
      return editTitle;
    },
    set editTitle(v: string) {
      editTitle = v;
    },
    get editDescription() {
      return editDescription;
    },
    set editDescription(v: string) {
      editDescription = v;
    },

    // Admin state
    get adminResponseMessage() {
      return adminResponseMessage;
    },
    set adminResponseMessage(v: string) {
      adminResponseMessage = v;
    },

    // UI state
    get isSaving() {
      return isSaving;
    },
    get isUpdatingStatus() {
      return isUpdatingStatus;
    },
    get lastUpdatedStatus() {
      return lastUpdatedStatus;
    },
    get isDeleting() {
      return isDeleting;
    },
    get showDeleteConfirm() {
      return showDeleteConfirm;
    },
    set showDeleteConfirm(v: boolean) {
      showDeleteConfirm = v;
    },
    get isSendingResponse() {
      return isSendingResponse;
    },
    get showResponseForm() {
      return showResponseForm;
    },
    set showResponseForm(v: boolean) {
      showResponseForm = v;
    },

    // Derived state
    get typeConfig() {
      return typeConfig;
    },
    get priorityConfig() {
      return priorityConfig;
    },
    get hasChanges() {
      return hasChanges;
    },

    // Methods
    restoreOriginal,
    saveChanges,
    saveAssignment,
    handleFieldBlur,
    handleStatusChange,
    handleDelete,
    formatDate,
    formatRelativeTime,
  };
}

/**
 * Type export for components using FeedbackDetailState
 */
export type FeedbackDetailState = ReturnType<typeof createFeedbackDetailState>;
