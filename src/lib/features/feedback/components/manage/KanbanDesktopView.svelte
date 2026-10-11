<!-- Desktop view: 4 columns + archive/defer stack -->
<script lang="ts">
  import type { FeedbackManageState } from "#lib/shared/feedback/state/feedback-manage-state.svelte.js";
  import type { KanbanBoardState } from "../../state/kanban-board-state.svelte";
  import type {
    FeedbackItem, FeedbackStatus, } from "#lib/shared/feedback/domain/models/feedback-models.js";
  import { STATUS_CONFIG } from "#lib/shared/feedback/domain/models/feedback-models.js";
  import FeedbackKanbanColumn from "./FeedbackKanbanColumn.svelte";
  import KanbanArchiveDropZone from "./KanbanArchiveDropZone.svelte";
  import KanbanDeferDropZone from "./KanbanDeferDropZone.svelte";
  import KanbanTrashDropZone from "./KanbanTrashDropZone.svelte";
  import type { ClaimStatusDeriver } from "../../services/claim-status-deriver";

  interface Props {
    boardState: KanbanBoardState;
    manageState: FeedbackManageState;
    claimStatusDeriver?: ClaimStatusDeriver;
    onOpenArchive?: () => void;
  }

  const { boardState, manageState, claimStatusDeriver, onOpenArchive }: Props = $props();

  const KANBAN_STATUSES = [
    "new",
    "in-progress",
    "in-review",
    "completed",
  ] as const;
  const ARCHIVE_STATUS = "archived" as const;

  function handleDragStart(item: FeedbackItem) {
    boardState.setDraggedItem(item);
  }

  function handleDragEnd() {
    boardState.setDraggedItem(null);
    boardState.setDragOverColumn(null);
    boardState.setTouchDragPosition(null);
  }

  function handleTouchDrag(item: FeedbackItem, x: number, y: number) {
    boardState.setTouchDragPosition({ x, y });
    const targetColumn = boardState.getColumnAtPosition(x, y);
    if (targetColumn && targetColumn !== item.status) {
      boardState.setDragOverColumn(targetColumn);
    } else {
      boardState.setDragOverColumn(null);
    }
  }

  function handleDragOver(status: FeedbackStatus | "deferred" | "trash") {
    if (boardState.draggedItem) {
      if (status === "deferred" || status === "trash" || boardState.draggedItem.status !== status) {
        boardState.setDragOverColumn(status);
      }
    }
  }

  function handleDragLeave() {
    boardState.setDragOverColumn(null);
  }

  async function handleDrop(status: FeedbackStatus | "deferred" | "trash") {
    if (!boardState.draggedItem) {
      return;
    }

    if (status === "deferred") {
      boardState.setItemToDefer(boardState.draggedItem);
      boardState.setShowDeferDialog(true);
      boardState.setDraggedItem(null);
      boardState.setDragOverColumn(null);
      return;
    }

    if (status === "trash") {
      boardState.setItemToTrash(boardState.draggedItem);
      boardState.setShowTrashDialog(true);
      boardState.setDraggedItem(null);
      boardState.setDragOverColumn(null);
      return;
    }

    if (boardState.draggedItem.status !== status) {
      // Record for undo BEFORE the update
      boardState.pushUndo({
        feedbackId: boardState.draggedItem.id,
        previousStatus: boardState.draggedItem.status,
        newStatus: status,
        timestamp: Date.now(),
      });

      try {
        await manageState.updateStatus(boardState.draggedItem.id, status);
      } catch (err) {
        console.error("[KanbanDesktopView] Failed to update status:", err);
      }
    }
    boardState.setDraggedItem(null);
    boardState.setDragOverColumn(null);
  }

  // Handle touch drop - find column at touch position and process drop
  async function handleTouchEnd(x: number, y: number) {
    if (!boardState.draggedItem) {
      return;
    }

    const targetStatus = boardState.getColumnAtPosition(x, y);

    if (targetStatus) {
      await handleDrop(targetStatus);
    } else {
      boardState.setDraggedItem(null);
      boardState.setDragOverColumn(null);
    }
  }

  function handleCardClick(item: FeedbackItem) {
    manageState.selectItem(item);
  }
</script>

<div class="columns-container">
  {#each KANBAN_STATUSES as status}
    <FeedbackKanbanColumn
      {status}
      config={STATUS_CONFIG[status]}
      items={boardState.itemsByStatus[status] ?? []}
      wipStatus={boardState.wipStatus[status]}
      {claimStatusDeriver}
      isDropTarget={boardState.dragOverColumn === status}
      isDragActive={boardState.draggedItem !== null}
      isActiveTab={true}
      selectedItemId={manageState.selectedItem?.id ?? null}
      disableDrag={false}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onTouchDrag={handleTouchDrag}
      onTouchEnd={handleTouchEnd}
      onDragOver={() => handleDragOver(status)}
      onDragLeave={handleDragLeave}
      onDrop={() => handleDrop(status)}
      onCardClick={handleCardClick}
    />
  {/each}

  <!-- Archive/Defer Stack - Thin bar on the right with stacked zones -->
  <div class="archive-defer-stack">
    <!-- Deferred Drop Zone -->
    <KanbanDeferDropZone
      isDropTarget={boardState.dragOverColumn === "deferred"}
      isDragActive={boardState.draggedItem !== null}
      deferredCount={boardState.deferredItems.length}
      onDragOver={() => handleDragOver("deferred")}
      onDragLeave={handleDragLeave}
      onDrop={() => handleDrop("deferred")}
    />

    <!-- Archived Drop Zone -->
    <KanbanArchiveDropZone
      isDropTarget={boardState.dragOverColumn === ARCHIVE_STATUS}
      isDragActive={boardState.draggedItem !== null}
      onDragOver={() => handleDragOver(ARCHIVE_STATUS)}
      onDragLeave={handleDragLeave}
      onDrop={() => handleDrop(ARCHIVE_STATUS)}
      onOpenArchive={() => onOpenArchive?.()}
    />

    <!-- Trash Drop Zone -->
    <KanbanTrashDropZone
      isDropTarget={boardState.dragOverColumn === "trash"}
      isDragActive={boardState.draggedItem !== null}
      onDragOver={() => handleDragOver("trash")}
      onDragLeave={handleDragLeave}
      onDrop={() => handleDrop("trash")}
    />
  </div>
</div>

<style>
  .columns-container {
    display: flex;
    gap: clamp(16px, 1cqi, 32px);
    flex: 1;
    width: 100%;
    margin: 0 auto;
    padding: clamp(16px, 1cqi, 32px);
    overflow-x: auto;
    overflow-y: hidden;
  }

  .columns-container::-webkit-scrollbar {
    height: clamp(4px, 1cqi, 8px);
  }

  .columns-container::-webkit-scrollbar-track {
    background: transparent;
  }

  .columns-container::-webkit-scrollbar-thumb {
    background: var(--scrollbar-thumb);
    border-radius: clamp(6px, 1.5cqi, 10px);
  }

  .columns-container::-webkit-scrollbar-thumb:hover {
    background: var(--scrollbar-thumb-hover);
  }

  .archive-defer-stack {
    display: flex;
    flex-direction: column;
    gap: clamp(8px, 2cqi, 16px);
    width: clamp(60px, 8cqi, 80px);
    min-width: clamp(60px, 8cqi, 80px);
    flex-shrink: 0;
    align-self: stretch;
  }
</style>
