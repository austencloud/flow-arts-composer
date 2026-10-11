<!-- Mobile view: tabs + active column -->
<script lang="ts">
  import type { FeedbackManageState } from "#lib/shared/feedback/state/feedback-manage-state.svelte.js";
  import type { KanbanBoardState } from "../../state/kanban-board-state.svelte";
  import type {
    FeedbackItem,
    FeedbackStatus,
  } from "#lib/shared/feedback/domain/models/feedback-models.js";
  import FeedbackKanbanColumn from "./FeedbackKanbanColumn.svelte";
  import KanbanStatusTab from "./KanbanStatusTab.svelte";
  import type { ClaimStatusDeriver } from "../../services/claim-status-deriver";
  import type { FeedbackManageLayoutMode } from "../../domain/feedback-manage-layout";
  import { STATUS_CONFIG } from "#lib/shared/feedback/domain/models/feedback-models.js";
  import KanbanQueueSummary from "./KanbanQueueSummary.svelte";

  interface Props {
    boardState: KanbanBoardState;
    manageState: FeedbackManageState;
    claimStatusDeriver?: ClaimStatusDeriver;
    onOpenArchive?: () => void;
    layoutMode: FeedbackManageLayoutMode;
  }

  const {
    boardState,
    manageState,
    claimStatusDeriver,
    onOpenArchive,
    layoutMode,
  }: Props = $props();

  const KANBAN_STATUSES = [
    "new",
    "in-progress",
    "in-review",
    "completed",
  ] as const;

  function handleDragStart(item: FeedbackItem) {
    boardState.setDraggedItem(item);
  }

  function handleDragEnd() {
    if (boardState.touchDragPosition && boardState.draggedItem) {
      const targetColumn = boardState.getColumnAtPosition(
        boardState.touchDragPosition.x,
        boardState.touchDragPosition.y
      );
      if (targetColumn && targetColumn !== boardState.draggedItem.status) {
        handleDrop(targetColumn);
        return;
      }
    }
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
      if (
        status === "deferred" ||
        status === "trash" ||
        boardState.draggedItem.status !== status
      ) {
        boardState.setDragOverColumn(status);
      }
    }
  }

  function handleDragLeave() {
    boardState.setDragOverColumn(null);
  }

  async function handleDrop(status: FeedbackStatus | "deferred" | "trash") {
    if (!boardState.draggedItem) return;

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
      } catch {
        // Error is logged in state
      }
    }
    boardState.setDraggedItem(null);
    boardState.setDragOverColumn(null);
  }

  function handleCardClick(item: FeedbackItem) {
    manageState.selectItem(item);
  }
</script>

<div class="workflow-queue {layoutMode}">
  <aside class="queue-navigation" aria-label="Feedback workflow navigation">
    <div class="status-tabs" role="tablist" aria-label="Feedback status">
      {#each KANBAN_STATUSES as status}
        {@const count = boardState.itemsByStatus[status]?.length ?? 0}
        <KanbanStatusTab
          {status}
          isActive={boardState.activeStatus === status}
          {count}
          onClick={() => boardState.setActiveStatus(status)}
        />
      {/each}
    </div>

    {#if layoutMode === "queue"}
      <div class="queue-summary-slot">
        <KanbanQueueSummary {boardState} />
      </div>
    {/if}

    <div class="queue-utilities" aria-label="Archived feedback">
      <button
        type="button"
        class="queue-utility"
        onclick={() => onOpenArchive?.()}
      >
        <i class="fas fa-clock" aria-hidden="true"></i>
        <span>Deferred</span>
        {#if boardState.deferredItems.length > 0}
          <span class="utility-count">{boardState.deferredItems.length}</span>
        {/if}
      </button>
      <button
        type="button"
        class="queue-utility"
        onclick={() => onOpenArchive?.()}
      >
        <i class="fas fa-archive" aria-hidden="true"></i>
        <span>Archive</span>
      </button>
    </div>
  </aside>

  <div class="columns-container">
    {#each KANBAN_STATUSES as status}
      {#if boardState.activeStatus === status}
        <FeedbackKanbanColumn
          {status}
          config={STATUS_CONFIG[status]}
          items={boardState.itemsByStatus[status] ?? []}
          wipStatus={boardState.wipStatus[status]}
          {claimStatusDeriver}
          isDropTarget={false}
          isDragActive={false}
          isActiveTab={true}
          selectedItemId={manageState.selectedItem?.id ?? null}
          disableDrag={true}
          queueMode={true}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onTouchDrag={handleTouchDrag}
          onDragOver={() => handleDragOver(status)}
          onDragLeave={handleDragLeave}
          onDrop={() => handleDrop(status)}
          onCardClick={handleCardClick}
        />
      {/if}
    {/each}
  </div>
</div>

<style>
  .workflow-queue {
    display: flex;
    flex: 1;
    min-width: 0;
    min-height: 0;
    flex-direction: column;
    overflow: hidden;
  }

  .queue-navigation {
    flex: 0 0 auto;
    min-width: 0;
    border-bottom: 1px solid var(--theme-stroke);
  }

  .status-tabs {
    display: flex;
    gap: 0.5rem;
    padding: 0.625rem 0.75rem;
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: none;
    -ms-overflow-style: none;
  }

  .status-tabs :global(.status-tab) {
    flex: 0 0 clamp(5rem, 24cqi, 6.5rem);
  }

  .workflow-queue.compact .status-tabs :global(.status-tab) {
    min-width: 0;
    flex: 1 1 0;
  }

  .status-tabs::-webkit-scrollbar {
    display: none;
  }

  .queue-utilities {
    display: flex;
    gap: 0.5rem;
    padding: 0 0.75rem 0.625rem;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .queue-utility {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    min-height: var(--min-touch-target);
    padding: 0 0.875rem;
    background: color-mix(in srgb, var(--theme-card-bg) 85%, transparent);
    border: 1px solid var(--theme-stroke);
    border-radius: 999px;
    color: var(--theme-text-dim);
    font: inherit;
    font-size: 0.875rem;
    font-weight: 600;
    white-space: nowrap;
    cursor: pointer;
  }

  .queue-utility:hover,
  .queue-utility:focus-visible {
    background: var(--theme-card-hover-bg);
    border-color: var(--theme-stroke-strong);
    color: var(--theme-text);
  }

  .queue-utility:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  .queue-utility i {
    color: var(--theme-accent);
  }

  .utility-count {
    display: inline-flex;
    min-width: 1.5rem;
    height: 1.5rem;
    align-items: center;
    justify-content: center;
    padding: 0 0.375rem;
    background: color-mix(in srgb, var(--theme-accent) 20%, transparent);
    border-radius: 999px;
    color: var(--theme-text);
    font-size: 0.75rem;
  }

  .columns-container {
    display: flex;
    flex: 1;
    min-width: 0;
    min-height: 0;
    width: 100%;
    padding: 0.75rem;
    overflow-x: hidden;
    overflow-y: hidden;
  }

  .workflow-queue.queue,
  .workflow-queue.compact-height {
    flex-direction: row;
  }

  .workflow-queue.queue .queue-navigation,
  .workflow-queue.compact-height .queue-navigation {
    display: flex;
    width: clamp(10rem, 18cqi, 13rem);
    flex-direction: column;
    border-right: 1px solid var(--theme-stroke);
    border-bottom: 0;
    background: color-mix(in srgb, var(--theme-panel-bg) 35%, transparent);
  }

  .workflow-queue.queue .queue-navigation {
    width: clamp(10.75rem, 18cqi, 13rem);
  }

  .workflow-queue.queue .status-tabs,
  .workflow-queue.compact-height .status-tabs {
    flex-direction: column;
    overflow-x: hidden;
    overflow-y: auto;
  }

  .workflow-queue.queue .status-tabs {
    gap: 0.375rem;
    padding: 0.75rem;
  }

  .workflow-queue.queue .status-tabs :global(.status-tab),
  .workflow-queue.compact-height .status-tabs :global(.status-tab) {
    width: 100%;
    flex: 0 0 auto;
  }

  .workflow-queue.queue .status-tabs :global(.status-tab) {
    min-height: 3.5rem;
    flex-direction: row;
    justify-content: flex-start;
    padding: 0.5rem;
  }

  .workflow-queue.queue .status-tabs :global(.tab-count),
  .workflow-queue.compact-height .status-tabs :global(.tab-count) {
    margin-left: auto;
  }

  .workflow-queue.queue .status-tabs :global(.tab-label),
  .workflow-queue.compact-height .status-tabs :global(.tab-label) {
    min-width: 0;
    flex: 1;
    text-align: left;
  }

  .workflow-queue.queue .status-tabs :global(.tab-label) {
    overflow: visible;
    text-overflow: clip;
    white-space: normal;
  }

  .workflow-queue.queue .queue-utilities,
  .workflow-queue.compact-height .queue-utilities {
    margin-top: auto;
    flex-direction: column;
    overflow: visible;
  }

  .queue-summary-slot {
    margin: auto 0.75rem;
  }

  .workflow-queue.queue .queue-utilities {
    margin-top: 0;
  }

  .workflow-queue.queue .queue-utility,
  .workflow-queue.compact-height .queue-utility {
    width: 100%;
    justify-content: flex-start;
  }

  .workflow-queue.queue .utility-count,
  .workflow-queue.compact-height .utility-count {
    margin-left: auto;
  }

  .workflow-queue.compact-height .queue-navigation {
    width: 10.75rem;
  }

  .workflow-queue.compact-height .status-tabs {
    gap: 0.25rem;
    padding: 0.375rem;
  }

  .workflow-queue.compact-height .status-tabs :global(.status-tab) {
    min-height: var(--min-touch-target);
    flex-direction: row;
  }

  .workflow-queue.compact-height .queue-utilities {
    gap: 0.25rem;
    padding: 0.375rem;
  }

  .workflow-queue.compact-height .columns-container {
    padding: 0.5rem;
  }
</style>
