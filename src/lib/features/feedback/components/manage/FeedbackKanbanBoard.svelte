<!-- FeedbackKanbanBoard - Kanban board layout for feedback management -->
<script lang="ts">
  import { onMount } from "svelte";
  import type { FeedbackManageState } from "#lib/shared/feedback/state/feedback-manage-state.svelte.js";
  import type { KanbanBoardState } from "../../state/kanban-board-state.svelte";
  import { createKanbanBoardState } from "../../state/kanban-board-state.svelte";
  import { getFeedbackSorter } from "#lib/features/feedback/get-feedback-sorter.js";
  import { toast } from "#lib/shared/toast/state/toast-state.svelte.js";
  import { STATUS_CONFIG } from "#lib/shared/feedback/domain/models/feedback-models.js";
  import KanbanMobileView from "./KanbanMobileView.svelte";
  import KanbanDesktopView from "./KanbanDesktopView.svelte";
  import DeferFeedbackDialog from "./DeferFeedbackDialog.svelte";
  import TrashFeedbackDialog from "./TrashFeedbackDialog.svelte";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import EditHistoryShortcutBridge from "#lib/shared/keyboard/components/EditHistoryShortcutBridge.svelte";
  import FeedbackFilterBar from "./FeedbackFilterBar.svelte";
  import {
    getFeedbackManageLayoutMode,
    isFeedbackManageQueueMode,
  } from "../../domain/feedback-manage-layout";

  interface Props {
    manageState: FeedbackManageState;
    onOpenArchive?: () => void;
  }

  const { manageState, onOpenArchive }: Props = $props();

  // Resolve services
  let boardState = $state<KanbanBoardState | null>(null);
  let boardElement = $state<HTMLDivElement | null>(null);
  const sortingService = getFeedbackSorter();

  // Get claim status deriver for UI indicators
  import { FeedbackSorter } from "../../services/feedback-sorter";
  const claimStatusDeriver =
    sortingService instanceof FeedbackSorter
      ? sortingService.getClaimStatusDeriver()
      : undefined;

  // Debounce flag to prevent rapid undo/redo
  let isProcessingUndoRedo = $state(false);

  // Handle undo keyboard shortcut
  async function handleUndo() {
    if (!boardState?.canUndo || isProcessingUndoRedo) return;

    const action = boardState.popUndo();
    if (!action) return;

    // Check if item still exists
    const itemExists = manageState.allItems.some(
      (item) => item.id === action.feedbackId
    );
    if (!itemExists) {
      toast.warning(t("feedback_item_no_longer_exists"));
      return;
    }

    isProcessingUndoRedo = true;

    try {
      await manageState.updateStatus(action.feedbackId, action.previousStatus);
      // Push to redo stack (with swapped statuses for redo)
      boardState.pushRedo({
        feedbackId: action.feedbackId,
        previousStatus: action.newStatus,
        newStatus: action.previousStatus,
        timestamp: Date.now(),
      });
      const statusLabel =
        STATUS_CONFIG[action.previousStatus]?.label || action.previousStatus;
      toast.info(t("feedback_moved_back_to", { status: statusLabel }));
    } catch (err) {
      console.error("[FeedbackKanbanBoard] Failed to undo:", err);
      toast.error(t("feedback_failed_undo"));
    } finally {
      isProcessingUndoRedo = false;
    }
  }

  // Handle redo keyboard shortcut
  async function handleRedo() {
    if (!boardState?.canRedo || isProcessingUndoRedo) return;

    const action = boardState.popRedo();
    if (!action) return;

    // Check if item still exists
    const itemExists = manageState.allItems.some(
      (item) => item.id === action.feedbackId
    );
    if (!itemExists) {
      toast.warning(t("feedback_item_no_longer_exists"));
      return;
    }

    isProcessingUndoRedo = true;

    try {
      await manageState.updateStatus(action.feedbackId, action.previousStatus);
      // Push back to undo stack without clearing redo (we're in redo mode)
      boardState.pushUndo(
        {
          feedbackId: action.feedbackId,
          previousStatus: action.newStatus,
          newStatus: action.previousStatus,
          timestamp: Date.now(),
        },
        false // Don't clear redo stack
      );
      const statusLabel =
        STATUS_CONFIG[action.previousStatus]?.label || action.previousStatus;
      toast.info(t("feedback_restored_to", { status: statusLabel }));
    } catch (err) {
      console.error("[FeedbackKanbanBoard] Failed to redo:", err);
      toast.error(t("feedback_failed_redo"));
    } finally {
      isProcessingUndoRedo = false;
    }
  }

  onMount(() => {
    let resizeObserver: ResizeObserver | null = null;

    async function initializeBoard() {
      try {
        boardState = createKanbanBoardState(manageState, sortingService);

        if (!boardElement) return;

        resizeObserver = new ResizeObserver((entries) => {
          for (const entry of entries) {
            boardState?.setLayoutMode(
              getFeedbackManageLayoutMode({
                width: entry.contentRect.width,
                height: entry.contentRect.height,
              })
            );
          }
        });

        resizeObserver.observe(boardElement);
      } catch (err) {
        console.error(`[FeedbackKanbanBoard] Error initializing board:`, err);
      }
    }

    initializeBoard();

    return () => {
      resizeObserver?.disconnect();
    };
  });
</script>

<div
  bind:this={boardElement}
  data-edit-history-shortcut-scope
  data-layout-mode={boardState?.layoutMode ?? "loading"}
  class="kanban-board"
  style="--active-color: {boardState?.activeStatusColor}"
>
  <EditHistoryShortcutBridge
    onUndo={handleUndo}
    onRedo={handleRedo}
    canUndo={Boolean(boardState?.canUndo) && !isProcessingUndoRedo}
    canRedo={Boolean(boardState?.canRedo) && !isProcessingUndoRedo}
  />
  {#if boardState}
    <FeedbackFilterBar {manageState} />

    <div class="board-viewport">
      {#if isFeedbackManageQueueMode(boardState.layoutMode)}
        <KanbanMobileView
          {boardState}
          {manageState}
          {claimStatusDeriver}
          {onOpenArchive}
          layoutMode={boardState.layoutMode}
        />
      {:else}
        <KanbanDesktopView
          {boardState}
          {manageState}
          {claimStatusDeriver}
          {onOpenArchive}
        />
      {/if}
    </div>

    {#if manageState.isLoading && manageState.items.length === 0}
      <div class="loading-overlay">
        <div class="loading-skeletons">
          {#each Array(3) as _}
            <div class="skeleton-card">
              <div class="skeleton-header">
                <div class="skeleton-icon"></div>
                <div class="skeleton-title"></div>
              </div>
              <div class="skeleton-body"></div>
              <div class="skeleton-footer">
                <div class="skeleton-meta"></div>
                <div class="skeleton-badge"></div>
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    {#if boardState.showDeferDialog && boardState.itemToDefer}
      <DeferFeedbackDialog {boardState} {manageState} />
    {/if}

    {#if boardState.showTrashDialog && boardState.itemToTrash}
      <TrashFeedbackDialog {boardState} {manageState} />
    {/if}

    <!-- Undo/Redo Hint - shows briefly after drag operations -->
    {#if boardState.showUndoHint}
      <div
        class="undo-hint"
        onclick={() => boardState?.dismissUndoHint()}
        onkeydown={(e) =>
          (e.key === "Escape" || e.key === "Enter" || e.key === " ") &&
          boardState?.dismissUndoHint()}
        role="button"
        aria-live="polite"
        tabindex="0"
      >
        <i class="fas fa-undo" aria-hidden="true"></i>
        <span>{t("feedback_undo_hint")}</span>
        <button
          type="button"
          class="undo-hint-dismiss"
          onclick={(e) => {
            e.stopPropagation();
            boardState?.dismissUndoHint();
          }}
          aria-label="Dismiss hint"
        >
          <i class="fas fa-times" aria-hidden="true"></i>
        </button>
      </div>
    {/if}
  {/if}
</div>

<style>
  .kanban-board {
    /* ===== FLUID SPACING - All clamp() based ===== */
    --kb-space-2xs: clamp(4px, 1cqi, 8px);
    --kb-space-xs: clamp(6px, 1.5cqi, 12px);
    --kb-space-sm: clamp(10px, 2.5cqi, 16px);
    --kb-space-md: clamp(14px, 3.5cqi, 24px);
    --kb-space-lg: clamp(20px, 5cqi, 32px);
    --kb-space-xl: clamp(28px, 7cqi, 48px);

    --kb-text-xs: clamp(0.8125rem, 2cqi, 0.875rem); /* min 13px */
    --kb-text-sm: clamp(0.875rem, 2.5cqi, 1rem); /* min 14px */
    --kb-text-base: clamp(1rem, 3cqi, 1.125rem); /* min 16px */
    --kb-text-lg: clamp(1.125rem, 3.5cqi, 1.25rem); /* min 18px */

    --kb-radius-sm: clamp(6px, 1.5cqi, 10px);
    --kb-radius-md: clamp(10px, 2.5cqi, 16px);
    --kb-radius-lg: clamp(14px, 3.5cqi, 20px);
    --kb-radius-full: 999px;

    --kb-text: var(--theme-text);
    --kb-text-muted: color-mix(in srgb, var(--theme-text) 75%, transparent);
    --kb-text-subtle: var(--theme-text-dim);

    --spring-smooth: cubic-bezier(0.4, 0, 0.2, 1);
    --spring-bounce: cubic-bezier(0.34, 1.56, 0.64, 1);

    position: relative;
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
    container-type: inline-size;
    container-name: kanban;
    background: transparent;
    backdrop-filter: none;
    box-shadow: none;
    transition: background 0.5s ease;
  }

  .board-viewport {
    display: flex;
    flex: 1;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }

  .loading-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--kb-space-xl);
    background: rgba(0, 0, 0, 0.4);
    backdrop-filter: blur(8px);
  }

  .loading-skeletons {
    display: flex;
    flex-direction: column;
    gap: var(--kb-space-md);
    width: 100%;
    max-width: clamp(280px, 70cqi, 400px);
  }

  .skeleton-card {
    display: flex;
    flex-direction: column;
    gap: var(--kb-space-sm);
    padding: var(--kb-space-md);
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: var(--kb-radius-lg);
    animation: skeleton-pulse 1.5s ease-in-out infinite;
  }

  .skeleton-header {
    display: flex;
    align-items: center;
    gap: var(--kb-space-sm);
  }

  .skeleton-icon {
    width: clamp(28px, 7cqi, 36px);
    height: clamp(28px, 7cqi, 36px);
    background: var(--theme-card-hover-bg);
    border-radius: var(--kb-radius-sm);
  }

  .skeleton-title {
    flex: 1;
    height: clamp(16px, 4cqi, 20px);
    background: var(--theme-stroke, var(--theme-card-hover-bg));
    border-radius: var(--kb-radius-sm);
  }

  .skeleton-body {
    height: clamp(36px, 9cqi, 48px);
    background: var(--theme-card-hover-bg, var(--theme-card-bg));
    border-radius: var(--kb-radius-sm);
  }

  .skeleton-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-top: var(--kb-space-sm);
    border-top: 1px solid var(--theme-stroke);
  }

  .skeleton-meta {
    width: clamp(80px, 20cqi, 120px);
    height: clamp(12px, 3cqi, 16px);
    background: var(--theme-card-hover-bg, var(--theme-card-bg));
    border-radius: var(--kb-radius-sm);
  }

  .skeleton-badge {
    width: clamp(24px, 6cqi, 32px);
    height: clamp(24px, 6cqi, 32px);
    background: var(--theme-card-hover-bg);
    border-radius: var(--kb-radius-sm);
  }

  @keyframes skeleton-pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.5;
    }
  }

  .undo-hint {
    position: absolute;
    bottom: clamp(16px, 4cqi, 24px);
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: clamp(8px, 2cqi, 12px);
    padding: clamp(10px, 2.5cqi, 14px) clamp(16px, 4cqi, 20px);
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: var(--kb-radius-full);
    box-shadow:
      0 8px 24px rgba(0, 0, 0, 0.3),
      0 2px 8px rgba(0, 0, 0, 0.2);
    font-size: var(--kb-text-sm);
    color: var(--theme-text);
    cursor: pointer;
    animation: slideUpFade 0.3s var(--spring-bounce);
    z-index: 100;
  }

  .undo-hint i {
    font-size: clamp(14px, 3.5cqi, 16px);
    color: var(--theme-accent);
  }

  .undo-hint span {
    font-weight: 500;
  }

  .undo-hint-dismiss {
    display: flex;
    align-items: center;
    justify-content: center;
    width: clamp(20px, 5cqi, 24px);
    height: clamp(20px, 5cqi, 24px);
    margin-left: clamp(4px, 1cqi, 8px);
    background: transparent;
    border: none;
    border-radius: 50%;
    color: var(--theme-text-dim);
    font-size: clamp(10px, 2.5cqi, 12px);
    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  .undo-hint-dismiss:hover {
    background: var(--theme-card-hover-bg);
    color: var(--theme-text);
  }

  @keyframes slideUpFade {
    from {
      opacity: 0;
      transform: translateX(-50%) translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
  }

  /* Accessibility: Respect user's motion preferences (WCAG AAA) */
  @media (prefers-reduced-motion: reduce) {
    .skeleton-card {
      animation: none;
    }
    .undo-hint {
      animation: none;
    }
  }
</style>
