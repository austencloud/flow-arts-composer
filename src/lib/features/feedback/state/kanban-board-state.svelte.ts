import type { FeedbackManageState } from "#lib/shared/feedback/state/feedback-manage-state.svelte.js";
import type {
  FeedbackItem,
  FeedbackStatus,
} from "#lib/shared/feedback/domain/models/feedback-models.js";
import { STATUS_CONFIG } from "#lib/shared/feedback/domain/models/feedback-models.js";
import {
  safeLocalStorageGet,
  safeLocalStorageSet,
} from "#lib/shared/foundation/services/storage-manager.js";
import { FeedbackSorter } from "../services/feedback-sorter";
import type { FeedbackManageLayoutMode } from "../domain/feedback-manage-layout";

type KanbanStatus = "new" | "in-progress" | "in-review" | "completed";

/** Represents a status change that can be undone */
export interface UndoableAction {
  feedbackId: string;
  previousStatus: FeedbackStatus;
  newStatus: FeedbackStatus;
  timestamp: number;
}

const MAX_UNDO_HISTORY = 10;

const STORAGE_KEY = "tka-feedback-manage-active-status";
const _KANBAN_STATUSES: KanbanStatus[] = [
  "new",
  "in-progress",
  "in-review",
  "completed",
];

export interface KanbanBoardState {
  activeStatus: FeedbackStatus;
  activeStatusColor: string;
  itemsByStatus: Record<KanbanStatus, FeedbackItem[]>;
  deferredItems: FeedbackItem[];
  wipStatus: Record<
    KanbanStatus,
    { count: number; limit: number; isAtLimit: boolean; isOverLimit: boolean }
  >;
  draggedItem: FeedbackItem | null;
  dragOverColumn: FeedbackStatus | "deferred" | "trash" | null;
  touchDragPosition: { x: number; y: number } | null;
  layoutMode: FeedbackManageLayoutMode;
  showDeferDialog: boolean;
  itemToDefer: FeedbackItem | null;
  deferDate: string;
  deferNotes: string;
  isSubmittingDefer: boolean;
  showTrashDialog: boolean;
  itemToTrash: FeedbackItem | null;
  isSubmittingTrash: boolean;

  // Undo/Redo support
  canUndo: boolean;
  canRedo: boolean;
  showUndoHint: boolean;
  pushUndo(action: UndoableAction, clearRedo?: boolean): void;
  popUndo(): UndoableAction | undefined;
  popRedo(): UndoableAction | undefined;
  pushRedo(action: UndoableAction): void;
  clearRedoStack(): void;
  dismissUndoHint(): void;

  // Actions
  setActiveStatus(status: FeedbackStatus): void;
  setDraggedItem(item: FeedbackItem | null): void;
  setDragOverColumn(status: FeedbackStatus | "deferred" | "trash" | null): void;
  setTouchDragPosition(pos: { x: number; y: number } | null): void;
  setLayoutMode(mode: FeedbackManageLayoutMode): void;
  setShowDeferDialog(show: boolean): void;
  setItemToDefer(item: FeedbackItem | null): void;
  setDeferDate(date: string): void;
  setDeferNotes(notes: string): void;
  setIsSubmittingDefer(isSubmitting: boolean): void;
  resetDeferDialog(): void;
  setShowTrashDialog(show: boolean): void;
  setItemToTrash(item: FeedbackItem | null): void;
  setIsSubmittingTrash(isSubmitting: boolean): void;
  resetTrashDialog(): void;
  getColumnAtPosition(
    x: number,
    y: number
  ): FeedbackStatus | "deferred" | "trash" | null;
}

export function createKanbanBoardState(
  manageState: FeedbackManageState,
  sortingService: FeedbackSorter
): KanbanBoardState {
  // Load saved active status or default to "new"
  const loadSavedStatus = (): FeedbackStatus => {
    const saved = safeLocalStorageGet<FeedbackStatus>(STORAGE_KEY, "new");
    const validStatuses: FeedbackStatus[] = [
      "new",
      "in-progress",
      "in-review",
      "completed",
    ];
    return saved && validStatuses.includes(saved) ? saved : "new";
  };

  let activeStatus = $state<FeedbackStatus>(loadSavedStatus());

  // Note: Persistence is handled manually via setActiveStatus to avoid $effect in factory
  // (runes like $effect can only be called during component initialization)

  // Derived: active status color
  const activeStatusColor = $derived(STATUS_CONFIG[activeStatus].color);

  // Search and filters belong to manage state, so both board presentations use
  // the same visible collection.
  const itemsByStatus = $derived.by(() => {
    return sortingService.groupByStatus(manageState.items);
  });

  // Derived: deferred items
  const deferredItems = $derived.by(() => {
    return sortingService.getDeferredItems(manageState.allItems);
  });

  // Derived: WIP status per column
  // CRITICAL: For "in-progress", count is based on ACTIVE CLAIMS, not column length
  // This ensures orphaned/stale items don't count toward the WIP limit
  const wipStatus = $derived.by(() => {
    const limits: Record<KanbanStatus, number> = {
      new: 0,
      "in-progress": 4,
      "in-review": 5,
      completed: 0,
    };
    const result: Record<
      string,
      { count: number; limit: number; isAtLimit: boolean; isOverLimit: boolean }
    > = {};

    // Get claim status deriver for accurate WIP counting
    const claimDeriver =
      sortingService instanceof FeedbackSorter
        ? sortingService.getClaimStatusDeriver()
        : null;

    for (const status of [
      "new",
      "in-progress",
      "in-review",
      "completed",
    ] as const) {
      let count: number;

      if (status === "in-progress" && claimDeriver) {
        // For in-progress, count only items with ACTIVE claims
        // This is the key fix: WIP = active work, not orphaned items
        count = claimDeriver.countActiveClaims(manageState.allItems);
      } else {
        // For other columns, count items in the column
        count = itemsByStatus[status].length;
      }

      const limit = limits[status];
      result[status] = {
        count,
        limit,
        isAtLimit: limit > 0 && count >= limit,
        isOverLimit: limit > 0 && count > limit,
      };
    }
    return result as Record<
      KanbanStatus,
      { count: number; limit: number; isAtLimit: boolean; isOverLimit: boolean }
    >;
  });

  // Drag state
  let draggedItem = $state<FeedbackItem | null>(null);
  let dragOverColumn = $state<FeedbackStatus | "deferred" | "trash" | null>(
    null
  );
  let touchDragPosition = $state<{ x: number; y: number } | null>(null);

  let layoutMode = $state<FeedbackManageLayoutMode>("compact");

  // Defer dialog state
  let showDeferDialog = $state(false);
  let itemToDefer = $state<FeedbackItem | null>(null);
  let deferDate = $state("");
  let deferNotes = $state("");
  let isSubmittingDefer = $state(false);

  // Trash dialog state
  let showTrashDialog = $state(false);
  let itemToTrash = $state<FeedbackItem | null>(null);
  let isSubmittingTrash = $state(false);

  // Undo/Redo stacks for drag operations
  let undoStack = $state<UndoableAction[]>([]);
  let redoStack = $state<UndoableAction[]>([]);
  let showUndoHint = $state(false);
  let undoHintTimeout: ReturnType<typeof setTimeout> | null = null;

  const canUndo = $derived(undoStack.length > 0);
  const canRedo = $derived(redoStack.length > 0);

  // Detect column at a screen position using two strategies:
  // 1. elementFromPoint + DOM walk (precise, works when finger is over a child element)
  // 2. Bounding rect scan (fallback, works even if ghost or gap is under the finger)
  function getColumnAtPosition(
    x: number,
    y: number
  ): FeedbackStatus | "deferred" | "trash" | null {
    const validStatuses: FeedbackStatus[] = [
      "new",
      "in-progress",
      "in-review",
      "completed",
    ];

    // Strategy 1: Walk DOM from elementFromPoint
    const element = document.elementFromPoint(x, y);
    if (element) {
      let current: Element | null = element;
      while (current) {
        if (current.classList?.contains("defer-drop-zone")) return "deferred";
        if (current.classList?.contains("archive-drop-zone"))
          return "archived" as FeedbackStatus;
        if (current.classList?.contains("trash-drop-zone")) return "trash";

        if (current.classList?.contains("kanban-column")) {
          const id = current.id;
          if (id?.startsWith("column-")) {
            const status = id.replace("column-", "") as FeedbackStatus;
            if (validStatuses.includes(status)) return status;
          }
        }
        current = current.parentElement;
      }
    }

    // Strategy 2: Bounding rect scan - catches gaps, overlays, or ghost interference
    // Check special drop zones first
    for (const cls of [
      "defer-drop-zone",
      "archive-drop-zone",
      "trash-drop-zone",
    ] as const) {
      const zone = document.querySelector(`.${cls}`);
      if (zone) {
        const rect = zone.getBoundingClientRect();
        if (
          x >= rect.left &&
          x <= rect.right &&
          y >= rect.top &&
          y <= rect.bottom
        ) {
          if (cls === "defer-drop-zone") return "deferred";
          if (cls === "archive-drop-zone") return "archived" as FeedbackStatus;
          return "trash";
        }
      }
    }

    // Check kanban columns by bounding rect
    const columns = document.querySelectorAll(".kanban-column");
    for (const col of columns) {
      const rect = col.getBoundingClientRect();
      if (
        x >= rect.left &&
        x <= rect.right &&
        y >= rect.top &&
        y <= rect.bottom
      ) {
        const id = col.id;
        if (id?.startsWith("column-")) {
          const status = id.replace("column-", "") as FeedbackStatus;
          if (validStatuses.includes(status)) return status;
        }
      }
    }

    return null;
  }

  function resetDeferDialog() {
    showDeferDialog = false;
    itemToDefer = null;
    deferDate = "";
    deferNotes = "";
  }

  function resetTrashDialog() {
    showTrashDialog = false;
    itemToTrash = null;
  }

  function pushUndo(action: UndoableAction, clearRedo = true) {
    undoStack = [...undoStack, action].slice(-MAX_UNDO_HISTORY);
    // Clear redo stack when a new action is performed (but not during redo operations)
    if (clearRedo) {
      redoStack = [];
      // Show undo hint briefly (only for new actions, not redo restores)
      showUndoHint = true;
      if (undoHintTimeout) clearTimeout(undoHintTimeout);
      undoHintTimeout = setTimeout(() => {
        showUndoHint = false;
      }, 4000);
    }
  }

  function popUndo(): UndoableAction | undefined {
    if (undoStack.length === 0) return undefined;
    const action = undoStack[undoStack.length - 1];
    undoStack = undoStack.slice(0, -1);
    return action;
  }

  function pushRedo(action: UndoableAction) {
    redoStack = [...redoStack, action].slice(-MAX_UNDO_HISTORY);
  }

  function popRedo(): UndoableAction | undefined {
    if (redoStack.length === 0) return undefined;
    const action = redoStack[redoStack.length - 1];
    redoStack = redoStack.slice(0, -1);
    return action;
  }

  function clearRedoStack() {
    redoStack = [];
  }

  function dismissUndoHint() {
    showUndoHint = false;
    if (undoHintTimeout) clearTimeout(undoHintTimeout);
  }

  return {
    get activeStatus() {
      return activeStatus;
    },
    get activeStatusColor() {
      return activeStatusColor;
    },
    get itemsByStatus() {
      return itemsByStatus;
    },
    get deferredItems() {
      return deferredItems;
    },
    get wipStatus() {
      return wipStatus;
    },
    get draggedItem() {
      return draggedItem;
    },
    get dragOverColumn() {
      return dragOverColumn;
    },
    get touchDragPosition() {
      return touchDragPosition;
    },
    get layoutMode() {
      return layoutMode;
    },
    get showDeferDialog() {
      return showDeferDialog;
    },
    get itemToDefer() {
      return itemToDefer;
    },
    get deferDate() {
      return deferDate;
    },
    get deferNotes() {
      return deferNotes;
    },
    get isSubmittingDefer() {
      return isSubmittingDefer;
    },
    get showTrashDialog() {
      return showTrashDialog;
    },
    get itemToTrash() {
      return itemToTrash;
    },
    get isSubmittingTrash() {
      return isSubmittingTrash;
    },
    get canUndo() {
      return canUndo;
    },
    get canRedo() {
      return canRedo;
    },
    get showUndoHint() {
      return showUndoHint;
    },

    setActiveStatus(status: FeedbackStatus) {
      activeStatus = status;
      // Persist immediately (since we can't use $effect in factory functions)
      safeLocalStorageSet(STORAGE_KEY, status);
    },
    setDraggedItem(item: FeedbackItem | null) {
      draggedItem = item;
    },
    setDragOverColumn(status: FeedbackStatus | "deferred" | null) {
      dragOverColumn = status;
    },
    setTouchDragPosition(pos: { x: number; y: number } | null) {
      touchDragPosition = pos;
    },
    setLayoutMode(mode: FeedbackManageLayoutMode) {
      layoutMode = mode;
    },
    setShowDeferDialog(show: boolean) {
      showDeferDialog = show;
    },
    setItemToDefer(item: FeedbackItem | null) {
      itemToDefer = item;
    },
    setDeferDate(date: string) {
      deferDate = date;
    },
    setDeferNotes(notes: string) {
      deferNotes = notes;
    },
    setIsSubmittingDefer(isSubmitting: boolean) {
      isSubmittingDefer = isSubmitting;
    },
    resetDeferDialog,
    setShowTrashDialog(show: boolean) {
      showTrashDialog = show;
    },
    setItemToTrash(item: FeedbackItem | null) {
      itemToTrash = item;
    },
    setIsSubmittingTrash(isSubmitting: boolean) {
      isSubmittingTrash = isSubmitting;
    },
    resetTrashDialog,
    getColumnAtPosition,
    pushUndo,
    popUndo,
    pushRedo,
    popRedo,
    clearRedoStack,
    dismissUndoHint,
  };
}
