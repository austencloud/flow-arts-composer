<script lang="ts">
  /**
   * MessageComposer
   *
   * Input field and send button with optimistic UI and error handling.
   * Supports reply mode, edit mode, and typing indicators.
   */

  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
  import { onMount, untrack } from "svelte";
  import { messagingService } from "../../../messaging/services/messenger";
  import type { HapticFeedback } from "$lib/shared/application/services/haptic-feedback";
  import { inboxState } from "../../state/inbox-state.svelte";
  import ReplyPreview from "./ReplyPreview.svelte";
  import MessageAttachmentPicker from "./MessageAttachmentPicker.svelte";
  import type { PendingMessageAttachment } from "../../domain/pending-message-attachment";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import { buildSequenceSharePayload } from "../../domain/build-sequence-share-payload";
  import { buildReplyPreview } from "$lib/shared/messaging/domain/message-preview";
  import type {
    Message,
    ReplyPreview as MessageReplyPreview,
  } from "$lib/shared/messaging/domain/models/message-models";
  import { getMessageDeliveryContext } from "../../context/message-delivery-context";
  import { restoreMessageAttachment } from "../../domain/message-delivery-models";
  import { getErrorHandler } from "$lib/shared/application/get-error-handler";

  interface Props {
    conversationId: string;
    lastEditableMessage?: Message;
  }

  interface DraftSnapshot {
    /** The signed-in account whose draft ledger this text belongs to. */
    ownerId: string | null;
    conversationId: string;
    content: string;
    replyTo: MessageReplyPreview | null;
    attachment: PendingMessageAttachment | null;
  }

  let { conversationId, lastEditableMessage }: Props = $props();

  const messageDeliveryState = getMessageDeliveryContext();
  let messageText = $state("");
  let isSending = $state(false);
  let inputElement: HTMLTextAreaElement | undefined = $state();
  let pendingAttachment = $state<PendingMessageAttachment | null>(null);
  let activeEditId: string | null = null;
  let draftBeforeEdit: string | null = null;
  let lastFocusedReplyId: string | null = null;
  let restoredReplyPreview = $state<MessageReplyPreview | null>(null);
  /**
   * `<ownerId>:<conversationId>` — the draft ledger is keyed by account as well
   * as conversation, so re-hydrating only on a conversation change would leave
   * the previous account's text sitting in the composer after a switch.
   */
  let hydratedDraftKey = "";
  let suppressDraftPersistence = false;
  let draftSaveTimer: ReturnType<typeof setTimeout> | null = null;
  /**
   * The snapshot a pending autosave is going to write, including the thread and
   * the account it belongs to. Both have to travel WITH the text: the debounce
   * can outlive either one, and a save that reads the live `conversationId` or
   * the live `activeUserId` at timer time writes one thread's unsent text into
   * another thread's draft, or into another account's ledger.
   */
  let pendingDraftSave: DraftSnapshot | null = null;
  let draftSaveError = $state<string | null>(null);
  let draftFailureReported = false;
  const MAX_INPUT_HEIGHT_PX = 120;
  const DRAFT_SAVE_DELAY_MS = 300;

  // Typing indicator debounce
  let typingTimeout: ReturnType<typeof setTimeout> | null = null;
  const TYPING_DEBOUNCE_MS = 1000;

  // Haptic feedback service
  let hapticService: HapticFeedback | undefined;

  onMount(() => {
    hapticService = getHapticFeedback();
    let resizeFrame: number | null = null;
    const handleWindowResize = () => {
      if (resizeFrame !== null) cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => {
        resizeFrame = null;
        resizeInput();
      });
    };
    window.addEventListener("resize", handleWindowResize);

    // Capture at mount time so the cleanup doesn't access a stale/null prop
    const mountedConversationId = conversationId;

    // Cleanup typing on unmount
    return () => {
      if (typingTimeout) clearTimeout(typingTimeout);
      if (resizeFrame !== null) cancelAnimationFrame(resizeFrame);
      window.removeEventListener("resize", handleWindowResize);
      // A pending autosave carries its own thread, so flushing it is always
      // safe. The explicit persist below then supersedes it for the thread this
      // composer is still bound to.
      if (!inboxState.isEditing && messageDeliveryState.ready) {
        flushPendingDraftSave();
      } else {
        pendingDraftSave = null;
        if (draftSaveTimer) clearTimeout(draftSaveTimer);
        draftSaveTimer = null;
      }
      if (
        !inboxState.isEditing &&
        messageDeliveryState.ready &&
        messageDeliveryState.activeUserId &&
        hydratedDraftKey === draftKey(conversationId)
      ) {
        void persistCurrentDraft();
      }
      if (mountedConversationId) {
        messagingService
          .setTyping(mountedConversationId, false)
          .catch(() => {});
      }
    };
  });

  function resizeInput(): void {
    if (!inputElement) return;
    inputElement.style.height = "auto";
    const borderHeight = inputElement.offsetHeight - inputElement.clientHeight;
    const naturalHeight = inputElement.scrollHeight + borderHeight;

    inputElement.style.height =
      Math.min(naturalHeight, MAX_INPUT_HEIGHT_PX) + "px";
    inputElement.style.overflowY =
      naturalHeight > MAX_INPUT_HEIGHT_PX ? "auto" : "hidden";
  }

  function focusInputAtEnd(): void {
    if (!inputElement) return;
    inputElement.focus();
    inputElement.setSelectionRange(messageText.length, messageText.length);
    resizeInput();
  }

  const replyPreview = $derived(
    inboxState.replyToMessage
      ? buildReplyPreview(inboxState.replyToMessage)
      : restoredReplyPreview
  );

  $effect(() => {
    if (inboxState.replyToMessage) restoredReplyPreview = null;
  });

  // A thread does not become editable until its device-local draft has been
  // read. That small gate prevents fast typing from being overwritten by a
  // draft that finishes loading a moment later.
  $effect(() => {
    if (!messageDeliveryState.ready || !conversationId) return;
    const key = draftKey(conversationId);
    if (hydratedDraftKey === key) return;

    // The thread (or account) being left may still have an autosave in flight.
    // Write it before this composer is rebound, so its last keystrokes survive
    // and its text can never be mistaken for the incoming draft.
    flushPendingDraftSave();

    const draft = messageDeliveryState.draftFor(conversationId);
    suppressDraftPersistence = true;
    hydratedDraftKey = key;
    messageText = draft?.content ?? "";
    pendingAttachment = draft?.attachment
      ? restoreMessageAttachment(draft.attachment)
      : null;
    restoredReplyPreview = draft?.replyTo ?? null;
    draftSaveError = null;

    const hydrationTimer = setTimeout(() => {
      suppressDraftPersistence = false;
      resizeInput();
    }, 0);
    return () => clearTimeout(hydrationTimer);
  });

  $effect(() => {
    const content = messageText;
    const attachment = pendingAttachment;
    const replyTo = replyPreview;
    const editing = inboxState.isEditing;
    const ready = messageDeliveryState.ready;
    const activeConversationId = conversationId;
    const ownerId = messageDeliveryState.activeUserId;

    if (
      !ready ||
      editing ||
      suppressDraftPersistence ||
      hydratedDraftKey !== draftKey(activeConversationId)
    ) {
      return;
    }

    if (draftSaveTimer) clearTimeout(draftSaveTimer);
    pendingDraftSave = {
      ownerId,
      conversationId: activeConversationId,
      content,
      replyTo,
      attachment,
    };
    draftSaveTimer = setTimeout(flushPendingDraftSave, DRAFT_SAVE_DELAY_MS);
  });

  /** Write the pending snapshot now, to the thread it was captured for. */
  function flushPendingDraftSave(): void {
    if (draftSaveTimer) {
      clearTimeout(draftSaveTimer);
      draftSaveTimer = null;
    }
    const pending = pendingDraftSave;
    pendingDraftSave = null;
    if (pending) void saveDraftSnapshot(pending);
  }

  function draftKey(forConversationId: string): string {
    return `${messageDeliveryState.activeUserId ?? ""}:${forConversationId}`;
  }

  async function saveDraftSnapshot(snapshot: DraftSnapshot): Promise<void> {
    // The delivery state writes to whichever account is active NOW, and a draft
    // id is `<userId>:<conversationId>`. A snapshot whose account has since
    // changed can only be written into the wrong ledger, so it is dropped: the
    // account that is signed in never inherits text typed by the previous one.
    if (snapshot.ownerId !== messageDeliveryState.activeUserId) return;
    const snapshotKey = draftKey(snapshot.conversationId);

    try {
      await messageDeliveryState.saveDraft(snapshot.conversationId, {
        content: snapshot.content,
        replyTo: snapshot.replyTo ?? undefined,
        attachment: snapshot.attachment ?? undefined,
      });
      // The outcome belongs to the thread it was written for. By the time this
      // resolves the composer may be showing a different thread or account, and
      // an older success must not clear that one's warning.
      if (hydratedDraftKey !== snapshotKey) return;
      draftSaveError = null;
      draftFailureReported = false;
    } catch (error) {
      if (hydratedDraftKey !== snapshotKey) {
        console.warn(
          "A draft for a thread that is no longer open could not be saved:",
          error
        );
        return;
      }
      draftSaveError = "Draft not saved";
      if (draftFailureReported) return;
      draftFailureReported = true;
      showComposerFailure(
        "This draft could not be saved on this device.",
        error,
        "saveMessageDraft"
      );
    }
  }

  async function persistCurrentDraft(): Promise<void> {
    return saveDraftSnapshot({
      ownerId: messageDeliveryState.activeUserId,
      conversationId,
      content: messageText,
      replyTo: replyPreview,
      attachment: pendingAttachment,
    });
  }

  function showComposerFailure(
    message: string,
    error: unknown,
    action: string
  ): void {
    const failure = error instanceof Error ? error : new Error(String(error));
    getErrorHandler().showUserError({
      message,
      technicalDetails: failure.message,
      error: failure,
      severity: "error",
      context: { module: "inbox", tab: "messages", action },
    });
  }

  // Starting a reply should be one action, not "choose Reply, then find the
  // composer." The draft stays exactly where it was and receives focus.
  $effect(() => {
    const replyId = inboxState.replyToMessage?.id ?? null;
    if (!replyId) {
      lastFocusedReplyId = null;
      return;
    }
    if (replyId === lastFocusedReplyId || inboxState.isEditing) return;

    lastFocusedReplyId = replyId;
    const focusTimer = setTimeout(focusInputAtEnd, 0);
    return () => clearTimeout(focusTimer);
  });

  // Editing temporarily borrows the composer. The draft and any attachment
  // waiting underneath come back when the edit is saved or cancelled.
  $effect(() => {
    const editingMessage = inboxState.editingMessage;

    if (editingMessage && editingMessage.id !== activeEditId) {
      if (activeEditId === null) {
        draftBeforeEdit = untrack(() => messageText);
      }
      activeEditId = editingMessage.id;
      messageText = editingMessage.content;

      if (typingTimeout) clearTimeout(typingTimeout);
      messagingService.setTyping(conversationId, false).catch(() => {});

      const focusTimer = setTimeout(focusInputAtEnd, 50);
      return () => clearTimeout(focusTimer);
    }

    if (!editingMessage && activeEditId !== null) {
      activeEditId = null;
      messageText = draftBeforeEdit ?? "";
      draftBeforeEdit = null;

      const restoreTimer = setTimeout(resizeInput, 0);
      return () => clearTimeout(restoreTimer);
    }

    return undefined;
  });

  // Auto-resize textarea and update typing indicator
  function handleInput() {
    resizeInput();

    // Update typing indicator (debounced)
    if (!inboxState.isEditing) {
      messagingService.setTyping(conversationId, true).catch(() => {});

      // Clear previous timeout
      if (typingTimeout) clearTimeout(typingTimeout);

      // Set typing to false after debounce period of inactivity
      typingTimeout = setTimeout(() => {
        messagingService.setTyping(conversationId, false).catch(() => {});
      }, TYPING_DEBOUNCE_MS);
    }
  }

  // Handle keyboard shortcuts
  function handleKeydown(event: KeyboardEvent) {
    // The composer owns its keystrokes. Background editors stay mounted while
    // Messages is open, so letting this bubble can turn typed letters such as
    // S into WASD movement and cancel the browser's text insertion.
    event.stopPropagation();

    // Cancel edit on Escape
    if (event.key === "Escape") {
      if (inboxState.isEditing) {
        event.preventDefault();
        inboxState.clearEditingMessage();
        return;
      }
      if (inboxState.isReplying) {
        event.preventDefault();
        dismissReply();
        return;
      }
      if (restoredReplyPreview) {
        event.preventDefault();
        dismissReply();
        return;
      }
      if (pendingAttachment) {
        pendingAttachment = null;
        return;
      }
    }

    // Matches the established desktop chat shortcut: Up from an empty
    // composer opens the most recent message you can edit.
    if (
      event.key === "ArrowUp" &&
      messageText.length === 0 &&
      !inboxState.isEditing &&
      !isReplying &&
      !pendingAttachment &&
      lastEditableMessage
    ) {
      event.preventDefault();
      inboxState.setEditingMessage(lastEditableMessage);
      return;
    }

    // Send/save on Enter (without Shift)
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (inboxState.isEditing) {
        saveEdit();
      } else {
        sendMessage();
      }
    }
  }

  async function sendMessage() {
    const text = messageText.trim();
    if (
      (!text && !pendingAttachment) ||
      isSending ||
      !messageDeliveryState.ready
    )
      return;

    hapticService?.trigger("selection");

    // Clear typing indicator
    if (typingTimeout) clearTimeout(typingTimeout);
    messagingService.setTyping(conversationId, false).catch(() => {});

    // Capture reply context before clearing
    const replyTo = replyPreview ?? undefined;
    const attachment = pendingAttachment;

    isSending = true;
    try {
      if (draftSaveTimer) {
        clearTimeout(draftSaveTimer);
        draftSaveTimer = null;
      }
      await messageDeliveryState.queueMessage({
        conversationId,
        content: text,
        attachment: attachment ?? undefined,
        replyTo,
      });

      suppressDraftPersistence = true;
      messageText = "";
      pendingAttachment = null;
      inboxState.clearReplyTo();
      restoredReplyPreview = null;
      draftSaveError = null;
      if (inputElement) {
        inputElement.style.height = "auto";
        inputElement.style.overflowY = "hidden";
      }
      setTimeout(() => {
        suppressDraftPersistence = false;
      }, 0);
    } catch (error) {
      console.error("Failed to send message:", error);
      showComposerFailure(
        "This message could not be placed in the outbox. Your draft is still here.",
        error,
        "queueMessage"
      );
    } finally {
      isSending = false;
    }
  }

  function selectImage(file: File) {
    pendingAttachment = {
      type: "image",
      file,
      messageId: crypto.randomUUID(),
      attachmentId: crypto.randomUUID(),
    };
  }

  function selectSequence(sequence: SequenceData) {
    // The picker hands over a raw SequenceData; the payload is what every
    // sequence-rendering consumer downstream expects.
    pendingAttachment = {
      type: "sequence",
      payload: buildSequenceSharePayload(sequence),
    };
  }

  function removeAttachment() {
    if (isSending) return;
    pendingAttachment = null;
  }

  async function saveEdit() {
    const text = messageText.trim();
    const editingMessage = inboxState.editingMessage;
    const canBeEmpty = Boolean(editingMessage?.attachments?.length);
    if (
      (!text && !canBeEmpty) ||
      isSending ||
      !editingMessage ||
      text === editingMessage.content
    ) {
      return;
    }

    hapticService?.trigger("selection");

    isSending = true;
    try {
      await messagingService.editMessage(
        editingMessage.conversationId,
        editingMessage.id,
        text
      );

      hapticService?.trigger("success");
      inboxState.clearEditingMessage();
    } catch (error) {
      console.error("Failed to edit message:", error);
      showComposerFailure(
        "These changes could not be saved.",
        error,
        "editMessage"
      );
    } finally {
      isSending = false;
    }
  }

  function cancelEdit() {
    inboxState.clearEditingMessage();
  }

  function dismissReply() {
    inboxState.clearReplyTo();
    restoredReplyPreview = null;
  }

  // Derive button state
  const isEditing = $derived(inboxState.isEditing);
  const isReplying = $derived(replyPreview !== null);
  const canSend = $derived.by(() => {
    if (isSending || !messageDeliveryState.ready) return false;

    const text = messageText.trim();
    if (!isEditing) {
      return text.length > 0 || pendingAttachment !== null;
    }

    const editingMessage = inboxState.editingMessage;
    if (!editingMessage || text === editingMessage.content) return false;
    return text.length > 0 || Boolean(editingMessage.attachments?.length);
  });
</script>

<div class="message-composer" class:editing={isEditing}>
  <!-- Reply preview strip -->
  {#if isReplying && replyPreview && !isEditing}
    <div class="reply-strip">
      <ReplyPreview
        reply={replyPreview}
        domId="message-reply-context"
        onDismiss={dismissReply}
      />
    </div>
  {/if}

  <!-- Edit mode header -->
  {#if isEditing}
    <div class="edit-header">
      <i class="fa-solid fa-pen" aria-hidden="true"></i>
      <span>Editing message</span>
      <button
        type="button"
        class="cancel-edit-button"
        onclick={cancelEdit}
        aria-label="Cancel editing"
      >
        Cancel
      </button>
    </div>
  {/if}

  <div class="compose-grid" class:editing={isEditing}>
    {#if !isEditing}
      <MessageAttachmentPicker
        attachment={pendingAttachment}
        disabled={isSending}
        progress={null}
        onImageSelected={selectImage}
        onSequenceSelected={selectSequence}
        onRemove={removeAttachment}
      />
    {/if}
    <textarea
      bind:this={inputElement}
      bind:value={messageText}
      name="message"
      oninput={handleInput}
      onkeydown={handleKeydown}
      placeholder={!messageDeliveryState.ready
        ? "Restoring draft..."
        : isEditing
          ? "Edit your message..."
          : "Type a message..."}
      rows="1"
      maxlength={2000}
      spellcheck="true"
      disabled={isSending || !messageDeliveryState.ready}
      aria-label={isEditing ? "Edit message" : "Message input"}
      aria-describedby={isReplying ? "message-reply-context" : undefined}
    ></textarea>
    <button
      data-save-shortcut={isEditing ? "" : undefined}
      class="send-button"
      onclick={isEditing ? saveEdit : sendMessage}
      disabled={!canSend}
      aria-label={isSending
        ? isEditing
          ? "Saving changes..."
          : "Saving message to outbox..."
        : isEditing
          ? "Save changes"
          : "Send message"}
    >
      {#if isSending}
        <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
      {:else if isEditing}
        <i class="fas fa-check" aria-hidden="true"></i>
      {:else}
        <i class="fas fa-paper-plane" aria-hidden="true"></i>
      {/if}
    </button>
  </div>
  {#if draftSaveError}
    <p class="draft-save-error" role="status">
      <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>
      {draftSaveError}
    </p>
  {/if}
</div>

<style>
  .message-composer {
    display: flex;
    flex-direction: column;
    gap: 0;
    padding: 12px 16px;
    background: var(--theme-panel-bg);
    border-top: 1px solid var(--theme-stroke, var(--theme-stroke));
  }

  .message-composer.editing {
    border-top-color: var(--theme-accent, #6366f1);
    background: color-mix(
      in srgb,
      var(--theme-accent, #6366f1) 5%,
      var(--theme-panel-bg)
    );
  }

  .reply-strip {
    margin-bottom: 8px;
  }

  .edit-header {
    display: flex;
    align-items: center;
    column-gap: 8px;
    row-gap: 0;
    padding: 8px 0;
    font-size: var(--font-size-sm, 14px);
    color: var(--theme-accent, #6366f1);
  }

  .edit-header i {
    font-size: var(--font-size-compact, 12px);
  }

  .edit-header span {
    flex: 1;
    font-weight: 500;
  }

  .cancel-edit-button {
    min-height: var(--min-touch-target, 44px);
    padding: 0 12px;
    font-size: var(--font-size-min, 14px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
    background: transparent;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 4px;
    cursor: pointer;
    transition: all var(--duration-fast) ease;
  }

  .cancel-edit-button:hover {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    color: var(--theme-text, #ffffff);
  }

  .compose-grid {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: flex-end;
    gap: 8px;
  }

  .compose-grid.editing {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  textarea {
    grid-column: 2;
    grid-row: 2;
    min-height: var(--min-touch-target, 44px);
    max-height: 120px;
    padding: 14px 16px;
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke, var(--theme-stroke));
    border-radius: 24px;
    color: var(--theme-text);
    font-family: inherit;
    font-size: var(--font-size-base);
    line-height: 1.4;
    resize: none;
    overflow-y: hidden;
    outline: none;
    transition:
      border-color 0.2s ease,
      box-shadow 0.2s ease;
  }

  .compose-grid.editing textarea {
    grid-column: 1;
    grid-row: 1;
  }

  textarea::placeholder {
    color: var(--theme-text-dim);
  }

  textarea:focus {
    border-color: var(--theme-accent, var(--semantic-info));
    box-shadow: 0 0 0 3px
      color-mix(in srgb, var(--theme-accent) 20%, transparent);
  }

  textarea:disabled {
    opacity: 0.6;
  }

  @media (min-width: 480px) and (hover: hover) and (pointer: fine) {
    textarea {
      font-size: var(--font-size-sm);
    }
  }

  .send-button {
    grid-column: 3;
    grid-row: 2;
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--min-touch-target, 44px);
    height: var(--min-touch-target, 44px);
    padding: 0;
    background: var(--theme-accent, var(--semantic-info));
    border: none;
    border-radius: 50%;
    color: white;
    cursor: pointer;
    transition:
      background 0.2s ease,
      transform 0.15s ease,
      box-shadow 0.2s ease;
  }

  .compose-grid.editing .send-button {
    grid-column: 2;
    grid-row: 1;
  }

  .send-button:hover:not(:disabled) {
    background: color-mix(
      in srgb,
      var(--theme-accent, var(--semantic-info)) 85%,
      white
    );
    transform: scale(1.05);
    box-shadow: 0 4px 12px
      color-mix(in srgb, var(--theme-accent) 40%, transparent);
  }

  .send-button:active:not(:disabled) {
    transform: scale(0.95);
  }

  .send-button:focus-visible {
    outline: none;
    box-shadow:
      0 0 0 3px color-mix(in srgb, var(--theme-accent) 40%, transparent),
      0 4px 12px rgba(0, 0, 0, 0.2);
  }

  .send-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .send-button i {
    font-size: var(--font-size-base);
    transition: transform var(--duration-normal) ease;
  }

  .send-button:hover:not(:disabled) i {
    transform: translateX(1px);
  }

  .draft-save-error {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 8px 0 0 52px;
    color: var(--semantic-error);
    font-size: var(--font-size-compact, 12px);
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    textarea,
    .send-button,
    .send-button i {
      transition: none !important;
      animation: none !important;
    }
  }
</style>
