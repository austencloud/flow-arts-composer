/**
 * Inbox State Management
 *
 * Svelte 5 runes-based state for the combined messages + notifications inbox.
 */

import type {
  ConversationPreview,
  Conversation,
} from "$lib/shared/messaging/domain/models/conversation-models";
import type { Message } from "$lib/shared/messaging/domain/models/message-models";
import type { UserNotification } from "$lib/shared/notifications/domain/models/notification-models";
import type { SequenceSharePayload } from "../domain/models/sequence-share-payload";
import type { PendingMessageAttachment } from "../domain/pending-message-attachment";

// Inbox tab types
export type InboxTab = "messages" | "notifications";

// Inbox view state
export type InboxView =
  | "list"
  | "thread"
  | "compose"
  | "group-settings"
  | "send-attachment";

/**
 * Reactive inbox state using Svelte 5 runes
 */
class InboxState {
  // Drawer state
  isOpen = $state(false);
  /**
   * A surface outside the drawer needs the outbox the drawer owns. Hosts that
   * mount the drawer lazily (the standalone viewer route) mount it on this as
   * well as on `isOpen`; the drawer itself stays closed.
   */
  hostRequested = $state(false);
  activeTab = $state<InboxTab>("messages");
  currentView = $state<InboxView>("list");

  // Message state
  conversations = $state<ConversationPreview[]>([]);
  /**
   * The first conversation snapshot for the signed-in user has arrived. Until
   * then an empty list means "not loaded yet", not "no conversations".
   */
  conversationsLoaded = $state(false);
  selectedConversation = $state<Conversation | null>(null);
  messages = $state<Message[]>([]);

  // Notification state
  notifications = $state<UserNotification[]>([]);

  // Derived unread counts from actual data - using arrow functions for reactivity
  unreadMessageCount = $derived.by(() => {
    return this.conversations.reduce((sum, c) => sum + (c.unreadCount || 0), 0);
  });

  unreadNotificationCount = $derived.by(() => {
    return this.notifications.filter((n) => !n.read).length;
  });

  // Loading states
  isLoadingConversations = $state(false);
  isLoadingMessages = $state(false);
  isLoadingNotifications = $state(false);

  // Compose state (for new message)
  composeRecipientId = $state<string | null>(null);
  composeRecipientName = $state<string | null>(null);
  composeGroupMode = $state(false);

  // Sequence sharing state
  /**
   * What the share sheet is about to send. The domain already modelled
   * image | sequence; only this view was sequence-only.
   */
  shareAttachment = $state<PendingMessageAttachment | null>(null);

  /** Prefilled note — shared text that was not a TKA code (Task 10). */
  shareAttachmentNote = $state<string | null>(null);

  /**
   * The share-intake record these bytes came from, or null for an ordinary
   * in-app share.
   *
   * Trace 2.14 needs it: the intake is resolved when the image is SENT, not
   * when the picker opens. Held as a plain id rather than a callback so a
   * reload cannot strand a closure - the id is re-derivable from the store,
   * a closure is not.
   */
  shareAttachmentReceiptId = $state<string | null>(null);

  /**
   * The conversation to pre-select in the send sheet, set when the user picked a
   * person straight from the Android share sheet (a Direct Share target).
   *
   * Deliberately NOT `pendingConversationId`. That field already means "navigate
   * to this conversation's thread" and InboxDrawer owns it: its effect clears it
   * and calls selectConversation, which nulls shareAttachment and switches to
   * the thread view. Routing a Direct Share through it opened the send sheet and
   * then tore it down 50ms later, dropping the attachment. Two different
   * intentions needed two fields; sharing one only worked by winning a race.
   */
  shareAttachmentConversationId = $state<string | null>(null);

  // Reply state - message being replied to
  replyToMessage = $state<Message | null>(null);

  // Edit state - message being edited
  editingMessage = $state<Message | null>(null);

  // Typing indicator state - display names of users currently typing
  typingUsers = $state<string[]>([]);

  // Pending navigation - allows dashboard widgets to request direct navigation
  // The InboxDrawer will pick this up and handle the actual loading
  pendingConversationId = $state<string | null>(null);
  pendingNotificationId = $state<string | null>(null);

  // Derived state - using $derived.by for proper reactivity
  totalUnreadCount = $derived.by(() => {
    return this.unreadMessageCount + this.unreadNotificationCount;
  });

  hasUnread = $derived.by(() => {
    return this.totalUnreadCount > 0;
  });

  // Actions
  requestHost() {
    this.hostRequested = true;
  }

  open(tab?: InboxTab) {
    this.isOpen = true;
    if (tab) {
      this.activeTab = tab;
    }
    this.currentView = "list";
    this.shareAttachment = null;
    this.shareAttachmentNote = null;
    this.shareAttachmentReceiptId = null;
    this.shareAttachmentConversationId = null;
  }

  close() {
    this.isOpen = false;
    this.selectedConversation = null;
    this.messages = [];
    this.currentView = "list";
    this.composeRecipientId = null;
    this.composeRecipientName = null;
    this.composeGroupMode = false;
    this.shareAttachment = null;
    this.shareAttachmentNote = null;
    this.shareAttachmentReceiptId = null;
    this.shareAttachmentConversationId = null;
    this.replyToMessage = null;
    this.editingMessage = null;
    this.typingUsers = [];
    this.pendingConversationId = null;
    this.pendingNotificationId = null;
  }

  setTab(tab: InboxTab) {
    this.activeTab = tab;
    this.currentView = "list";
    this.selectedConversation = null;
    this.messages = [];
    this.replyToMessage = null;
    this.editingMessage = null;
    this.typingUsers = [];
    this.shareAttachment = null;
    this.shareAttachmentNote = null;
    this.shareAttachmentReceiptId = null;
    this.shareAttachmentConversationId = null;
  }

  selectConversation(conversation: Conversation) {
    this.shareAttachment = null;
    this.shareAttachmentNote = null;
    this.shareAttachmentReceiptId = null;
    this.shareAttachmentConversationId = null;
    this.selectedConversation = conversation;
    this.currentView = "thread";
    this.replyToMessage = null;
    this.editingMessage = null;
    this.typingUsers = [];
  }

  /**
   * Open inbox directly to a specific conversation
   * Used from dashboard widgets for one-click access
   */
  openToConversation(conversation: Conversation) {
    this.isOpen = true;
    this.activeTab = "messages";
    this.shareAttachment = null;
    this.shareAttachmentNote = null;
    this.shareAttachmentReceiptId = null;
    this.shareAttachmentConversationId = null;
    this.selectedConversation = conversation;
    this.currentView = "thread";
  }

  /**
   * Open inbox directly to a specific conversation by ID
   * Opens directly to thread view (shows loading state while conversation loads)
   */
  openToConversationById(conversationId: string) {
    this.pendingConversationId = conversationId;
    this.isOpen = true;
    this.activeTab = "messages";
    this.shareAttachment = null;
    this.shareAttachmentNote = null;
    this.shareAttachmentReceiptId = null;
    this.shareAttachmentConversationId = null;
    this.currentView = "thread"; // Go directly to thread view
    this.isLoadingMessages = true; // Show loading state
    // InboxDrawer will detect pendingConversationId and load the conversation
  }

  /**
   * Open inbox to handle a specific notification
   * Sets pendingNotificationId so InboxDrawer can handle the action
   */
  openToNotification(notificationId: string) {
    this.pendingNotificationId = notificationId;
    this.isOpen = true;
    this.activeTab = "notifications";
    this.shareAttachment = null;
    this.shareAttachmentNote = null;
    this.shareAttachmentReceiptId = null;
    this.shareAttachmentConversationId = null;
    // InboxDrawer will detect pendingNotificationId and handle the action
  }

  /**
   * Clear pending navigation after it's been handled
   */
  clearPendingNavigation() {
    this.pendingConversationId = null;
    this.pendingNotificationId = null;
  }

  backToList() {
    this.shareAttachment = null;
    this.shareAttachmentNote = null;
    this.shareAttachmentReceiptId = null;
    this.shareAttachmentConversationId = null;
    this.selectedConversation = null;
    this.messages = [];
    this.currentView = "list";
    this.replyToMessage = null;
    this.editingMessage = null;
    this.typingUsers = [];
  }

  startCompose(recipientId?: string, recipientName?: string) {
    this.shareAttachment = null;
    this.shareAttachmentNote = null;
    this.shareAttachmentReceiptId = null;
    this.shareAttachmentConversationId = null;
    this.composeRecipientId = recipientId || null;
    this.composeRecipientName = recipientName || null;
    this.composeGroupMode = false;
    this.currentView = "compose";
  }

  startGroupCompose() {
    this.shareAttachment = null;
    this.shareAttachmentNote = null;
    this.shareAttachmentReceiptId = null;
    this.shareAttachmentConversationId = null;
    this.composeGroupMode = true;
    this.composeRecipientId = null;
    this.composeRecipientName = null;
    this.currentView = "compose";
  }

  cancelCompose() {
    this.composeRecipientId = null;
    this.composeRecipientName = null;
    this.composeGroupMode = false;
    this.currentView = "list";
  }

  /** Open the picker for any attachment the domain models. */
  openAttachmentShare(
    attachment: PendingMessageAttachment,
    options: { note?: string; receiptId?: string; conversationId?: string } = {}
  ) {
    this.isOpen = true;
    this.activeTab = "messages";
    this.currentView = "send-attachment";
    this.shareAttachment = attachment;
    this.shareAttachmentNote = options.note ?? null;
    this.shareAttachmentReceiptId = options.receiptId ?? null;
    // Set by a Direct Share tap: the send sheet opens with this conversation
    // already chosen, so the user's next tap is Send.
    this.shareAttachmentConversationId = options.conversationId ?? null;
    // NOT pendingConversationId. That field means "navigate to this thread",
    // and InboxDrawer's effect (InboxDrawer.svelte:84-92) acts on it 50ms after
    // this returns: it calls handleConversationSelect, which switches
    // currentView to "thread" and strands the attachment we just staged. The
    // send sheet reads shareAttachmentConversationId instead, precisely so
    // pre-selecting a destination cannot collide with navigating to one.
    this.pendingConversationId = null;
    this.pendingNotificationId = null;
    this.selectedConversation = null;
    this.messages = [];
    this.composeRecipientId = null;
    this.composeRecipientName = null;
    this.composeGroupMode = false;
    this.replyToMessage = null;
    this.editingMessage = null;
    this.typingUsers = [];
  }

  /** Existing sequence call sites keep working unchanged. */
  openSequenceShare(payload: SequenceSharePayload) {
    this.openAttachmentShare({ type: "sequence", payload });
  }

  /**
   * @param conversationId The thread to open afterwards, or null to return to
   * the conversation list. Null is the multi-recipient case: a share that went
   * to four people has no single "the" thread, and picking one arbitrarily
   * hides the other three.
   */
  completeAttachmentShare(conversationId: string | null) {
    this.shareAttachment = null;
    this.shareAttachmentNote = null;
    this.shareAttachmentReceiptId = null;
    this.shareAttachmentConversationId = null;
    if (conversationId) {
      this.openToConversationById(conversationId);
      return;
    }
    this.currentView = "list";
    this.selectedConversation = null;
    this.messages = [];
  }

  /**
   * Cancel is NOT a data-loss path any more. It clears the view; the intake
   * record and its bytes stay in IndexedDB as `ready` until the TTL, so the
   * share can be resumed. The previous revision deleted the record when the
   * picker OPENED, which made cancel, reload, crash and the sign-in round trip
   * all destroy the only copy.
   */
  cancelAttachmentShare() {
    this.close();
  }

  completeSequenceShare(conversationId: string) {
    this.completeAttachmentShare(conversationId);
  }

  cancelSequenceShare() {
    this.cancelAttachmentShare();
  }

  openGroupSettings() {
    if (this.selectedConversation?.type === "group") {
      this.currentView = "group-settings";
    }
  }

  closeGroupSettings() {
    this.currentView = "thread";
  }

  // Update methods for subscriptions
  setConversations(conversations: ConversationPreview[]) {
    this.conversations = conversations;
    this.conversationsLoaded = true;
  }

  /** A new subscription (sign-in, account switch) has not reported yet. */
  markConversationsPending() {
    this.conversationsLoaded = false;
  }

  setMessages(messages: Message[]) {
    this.messages = messages;

    if (this.editingMessage) {
      const current = messages.find(
        (message) => message.id === this.editingMessage?.id
      );
      if (!current || current.isDeleted) {
        this.editingMessage = null;
      }
    }
  }

  setNotifications(notifications: UserNotification[]) {
    this.notifications = notifications;
  }

  setLoadingConversations(loading: boolean) {
    this.isLoadingConversations = loading;
  }

  setLoadingMessages(loading: boolean) {
    this.isLoadingMessages = loading;
  }

  setLoadingNotifications(loading: boolean) {
    this.isLoadingNotifications = loading;
  }

  // Reply actions
  setReplyTo(message: Message) {
    this.replyToMessage = message;
    // Clear edit mode if replying
    this.editingMessage = null;
  }

  clearReplyTo() {
    this.replyToMessage = null;
  }

  // Edit actions
  setEditingMessage(message: Message) {
    this.editingMessage = message;
    // Clear reply mode if editing
    this.replyToMessage = null;
  }

  clearEditingMessage() {
    this.editingMessage = null;
  }

  // Typing indicator actions
  setTypingUsers(users: string[]) {
    this.typingUsers = users;
  }

  // Derived state for composer mode
  isReplying = $derived.by(() => {
    return this.replyToMessage !== null;
  });

  isEditing = $derived.by(() => {
    return this.editingMessage !== null;
  });
}

// Export singleton instance
export const inboxState = new InboxState();
