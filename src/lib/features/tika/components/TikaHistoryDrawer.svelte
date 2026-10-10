<!--
  TIKA History Drawer - Chat History Panel

  Displays list of previous conversations with ability to:
  - Start new conversation
  - Load previous conversation
  - Delete conversations
-->
<script lang="ts">
  import { onMount } from "svelte";
  import DrawerHeader from "#lib/shared/foundation/ui/DrawerHeader.svelte";
  import TikaHistoryItem from "./TikaHistoryItem.svelte";
  import type { TikaSessionPreview, TikaSessionQueryOptions } from "../domain/models/tika-conversation-models";

  interface SessionRepository {
    subscribeToSessions(
      callback: (sessions: TikaSessionPreview[]) => void,
      options?: TikaSessionQueryOptions,
      onError?: (error: Error) => void
    ): () => void;
    deleteSession(sessionId: string): Promise<void>;
  }

  let {
    repository,
    currentSessionId = null,
    onNewChat,
    onLoadSession,
    onClose,
  }: {
    repository: SessionRepository;
    currentSessionId: string | null;
    onNewChat: () => void;
    onLoadSession: (sessionId: string) => void;
    onClose: () => void;
  } = $props();

  // State
  let sessions = $state<TikaSessionPreview[]>([]);
  let isLoading = $state(true);
  let error = $state<string | null>(null);
  let deleteConfirmId = $state<string | null>(null);

  // Subscription cleanup
  let unsubscribe: (() => void) | null = null;

  onMount(() => {
    // Subscribe to session list
    try {
      unsubscribe = repository.subscribeToSessions(
        (updatedSessions) => {
          sessions = updatedSessions;
          isLoading = false;
          error = null;
        },
        undefined,
        (err) => {
          console.error("[TIKAHistoryDrawer] Subscription error:", err);
          error = "Failed to load history";
          isLoading = false;
        }
      );
    } catch (err) {
      console.error("[TIKAHistoryDrawer] Failed to subscribe:", err);
      error = "Failed to load history";
      isLoading = false;
    }

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  });

  // Handle session selection
  function handleSelectSession(sessionId: string) {
    onLoadSession(sessionId);
    onClose();
  }

  function handleNewChat() {
    onNewChat();
    onClose();
  }

  // Handle delete request (show confirmation)
  function handleDeleteRequest(sessionId: string) {
    deleteConfirmId = sessionId;
  }

  // Confirm delete
  async function confirmDelete() {
    if (!deleteConfirmId) return;

    try {
      await repository.deleteSession(deleteConfirmId);
      deleteConfirmId = null;
    } catch (err) {
      console.error("[TIKAHistoryDrawer] Failed to delete:", err);
      error = "Failed to delete conversation";
    }
  }

  // Cancel delete
  function cancelDelete() {
    deleteConfirmId = null;
  }

  // Handle escape key to close
  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      if (deleteConfirmId) {
        cancelDelete();
      } else {
        onClose();
      }
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="history-drawer" role="dialog" aria-label="Chat History">
  <DrawerHeader title="Chat History" {onClose} />

  <!-- New Chat Button -->
  <div class="new-chat-section">
    <button aria-label="New conversation" class="new-chat-btn" onclick={handleNewChat}>
      <i class="fas fa-plus" aria-hidden="true"></i>
      <span>New Conversation</span>
    </button>
  </div>

  <!-- Content -->
  <div class="drawer-content themed-scrollbar">
    {#if isLoading}
      <div class="loading-state">
        <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
        <span>Loading history...</span>
      </div>
    {:else if error}
      <div class="error-state">
        <i class="fas fa-exclamation-circle" aria-hidden="true"></i>
        <span>{error}</span>
      </div>
    {:else if sessions.length === 0}
      <div class="empty-state">
        <i class="fas fa-comments" aria-hidden="true"></i>
        <span>No conversations yet</span>
        <p>Start a conversation with Tika to see it here.</p>
      </div>
    {:else}
      <div class="sessions-list">
        {#each sessions as session (session.id)}
          <TikaHistoryItem
            {session}
            isActive={session.id === currentSessionId}
            onSelect={() => handleSelectSession(session.id)}
            onDelete={() => handleDeleteRequest(session.id)}
          />
        {/each}
      </div>
    {/if}
  </div>

  <!-- Delete Confirmation Dialog -->
  {#if deleteConfirmId}
    <div class="confirm-overlay" role="alertdialog" aria-modal="true">
      <div class="confirm-dialog">
        <h3>Delete Conversation?</h3>
        <p>This conversation will be permanently deleted.</p>
        <div class="confirm-actions">
          <button class="btn-cancel" onclick={cancelDelete}>Cancel</button>
          <button class="btn-delete" onclick={confirmDelete}>Delete</button>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .history-drawer {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
    border-left: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  /* New Chat Section */
  .new-chat-section {
    padding: 12px 16px;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  .new-chat-btn {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 12px 16px;
    background: var(--theme-accent, #6366f1);
    border: none;
    border-radius: 8px;
    color: white;
    font-size: var(--font-size-min, 14px);
    font-weight: 500;
    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  .new-chat-btn:hover {
    filter: brightness(1.1);
    transform: translateY(-1px);
  }

  .new-chat-btn:focus-visible {
    outline: 2px solid var(--theme-accent, #6366f1);
    outline-offset: 2px;
  }

  .new-chat-btn:active {
    transform: translateY(0);
  }

  /* Content */
  .drawer-content {
    flex: 1;
    overflow-y: auto;
    padding: 12px 16px;
  }

  .sessions-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  /* Loading State */
  .loading-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 32px 16px;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.6));
    font-size: var(--font-size-min, 14px);
  }

  .loading-state i {
    font-size: 24px;
    color: var(--theme-accent, #6366f1);
  }

  /* Error State */
  .error-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 32px 16px;
    color: var(--semantic-error, #ef4444);
    font-size: var(--font-size-min, 14px);
  }

  .error-state i {
    font-size: 24px;
  }

  /* Empty State */
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 32px 16px;
    text-align: center;
  }

  .empty-state i {
    font-size: 32px;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.3));
  }

  .empty-state span {
    font-size: var(--font-size-min, 14px);
    font-weight: 500;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.6));
  }

  .empty-state p {
    margin: 0;
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.4));
  }

  /* Confirmation Overlay */
  .confirm-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--theme-overlay, rgba(0, 0, 0, 0.6));
    z-index: 10;
  }

  .confirm-dialog {
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 12px;
    padding: 20px;
    max-width: 280px;
    text-align: center;
  }

  .confirm-dialog h3 {
    margin: 0 0 8px 0;
    font-size: 16px;
    font-weight: 600;
    color: var(--theme-text, #ffffff);
  }

  .confirm-dialog p {
    margin: 0 0 16px 0;
    font-size: var(--font-size-min, 14px);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.6));
  }

  .confirm-actions {
    display: flex;
    gap: 8px;
  }

  .confirm-actions button {
    flex: 1;
    padding: 10px 16px;
    border: none;
    border-radius: 6px;
    font-size: var(--font-size-min, 14px);
    font-weight: 500;
    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  .btn-cancel {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    color: var(--theme-text, #ffffff);
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1)) !important;
  }

  .btn-cancel:hover {
    background: var(--theme-card-bg-hover, rgba(255, 255, 255, 0.08));
  }

  .btn-delete {
    background: var(--semantic-error, #ef4444);
    color: white;
  }

  .btn-delete:hover {
    filter: brightness(1.1);
  }

  .confirm-actions button:focus-visible {
    outline: 2px solid var(--theme-accent, #6366f1);
    outline-offset: 2px;
  }

  /* Reduced Motion */
  @media (prefers-reduced-motion: reduce) {
    .new-chat-btn,
    .confirm-actions button {
      transition: none;
    }

    .new-chat-btn:hover {
      transform: none;
    }
  }
</style>
