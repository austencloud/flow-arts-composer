import { getErrorHandler } from "$lib/shared/application/get-error-handler";
import type { HapticFeedback } from "$lib/shared/application/services/haptic-feedback";
import { ensureGuestIdentity } from "$lib/shared/auth/services/guest-identity";
import { authDrawerState } from "$lib/shared/auth/state/auth-drawer-state.svelte";
import { authState } from "$lib/shared/auth/state/auth-state.svelte";
import { getUserIdentityLabels } from "$lib/shared/community/domain/user-identity-labels";
import type { ConversationPreview } from "$lib/shared/messaging/domain/models/conversation-models";
import { conversationService } from "$lib/shared/messaging/services/conversation-manager";
import { getShortCodeShareMessage } from "$lib/shared/qr/domain/short-code-error";
import { getShortCodeManager } from "$lib/shared/qr/get-short-code-manager";
import { toast } from "$lib/shared/toast/state/toast-state.svelte";
import { buildSequenceMessageAttachment } from "../domain/message-attachment-builders";
import type { PendingMessageAttachment } from "../domain/pending-message-attachment";
import { inboxState } from "./inbox-state.svelte";
import type { MessageDeliveryState } from "./message-delivery-state.svelte";

export const SEND_MESSAGE_MAX = 500;
const MAX_RECENT_CONVERSATIONS = 8;

export type SendSelectedUser = {
  id: string;
  displayName: string;
  username?: string | null;
  avatar?: string;
};

export interface SendDestinationChip {
  key: string;
  name: string;
  avatar?: string;
  isGroup: boolean;
  remove: () => void;
}

interface SendAttachmentInputs {
  getAttachment: () => PendingMessageAttachment;
  /** Prefilled note. Share intake passes the shared text that was not a code. */
  initialNote?: string;
  /**
   * The conversations that accepted it into their outbox, in queue order.
   * Plural because one share can go to several people; a partial success
   * reports only the durable entries that were created.
   */
  onSent: (conversationIds: string[]) => void;
  /**
   * A guest tapped Send on a sequence. The host retires its own surface before
   * the sign-up drawer opens over it.
   */
  onGuestBlocked: () => void;
  /**
   * A Direct Share tap names the conversation before the picker renders. Read
   * once at creation: the inbox's own navigation field means "open this
   * thread" and would pull the drawer out of the picker.
   */
  directShareConversationId?: string | null;
  /**
   * The sender's viewer state, read when Send is pressed. The viewer's share
   * panel stays open while the person changes views, so the message carries
   * the view on stage at that moment rather than when the panel opened.
   */
  getSequenceViewParams?: () => string | undefined;
}

interface SendAttachmentDependencies {
  delivery: Pick<MessageDeliveryState, "queueMessage">;
  getHaptics: () => HapticFeedback | undefined;
}

export type SendAttachmentState = ReturnType<typeof createSendAttachmentState>;

/**
 * Who a share goes to, and the act of sending it. One owner for the inbox's
 * send sheet and the viewer's send mode: the two present the same selection in
 * different rooms (a drawer column, a stage beside a card), and the delivery
 * rules (one short code per share, sequential queueing, partial-failure
 * reporting) must not fork between them.
 */
export function createSendAttachmentState(
  inputs: SendAttachmentInputs,
  dependencies: SendAttachmentDependencies
) {
  const attachment = $derived(inputs.getAttachment());

  // Multi-recipient: one share, N destinations. Kept as two lists rather than
  // one union list because they resolve differently at send time - an existing
  // conversation already has an id, a searched user needs one created.
  let selectedConversations = $state<ConversationPreview[]>([]);
  let selectedUsers = $state<SendSelectedUser[]>([]);

  // The single-destination case is still THE common one. Deriving these keeps
  // the avatar/name/subtitle reading intact instead of special-casing length 1.
  const selectedConversation = $derived(
    selectedConversations.length === 1 && selectedUsers.length === 0
      ? selectedConversations[0]!
      : null
  );
  const selectedUser = $derived(
    selectedUsers.length === 1 && selectedConversations.length === 0
      ? selectedUsers[0]!
      : null
  );
  const destinationCount = $derived(
    selectedConversations.length + selectedUsers.length
  );
  let message = $state(inputs.initialNote ?? "");
  let phase = $state<"idle" | "sending">("idle");
  let searchResetKey = $state(0);
  let searchUserId = $state("");
  let searchUserDisplay = $state("");

  const currentUserId = $derived(authState.user?.uid ?? "");

  const sendLabel = $derived.by(() => {
    const noun = attachment.type === "image" ? "image" : "sequence";
    // The count is the confirmation. "Send image" while four people are
    // selected reads as sending to one of them.
    return destinationCount > 1
      ? `Send ${noun} to ${destinationCount}`
      : `Send ${noun}`;
  });
  const recentConversations = $derived(
    inboxState.conversations
      .filter(
        (conversation) =>
          conversation.type === "group" || !!conversation.otherParticipant
      )
      .slice(0, MAX_RECENT_CONVERSATIONS)
  );
  const selectedConversationIsGroup = $derived(
    selectedConversation?.type === "group"
  );
  const destinationName = $derived(
    selectedConversation
      ? conversationName(selectedConversation)
      : getUserIdentityLabels(selectedUser, "").primary
  );
  const destinationDetail = $derived.by(() => {
    if (selectedConversation?.type === "group") {
      const count =
        selectedConversation.participantCount ??
        selectedConversation.participantPreviews?.length ??
        0;
      return count > 0
        ? `${count} ${count === 1 ? "member" : "members"}`
        : "Group conversation";
    }
    if (selectedConversation) return "Existing conversation";
    if (selectedUser) return "New conversation";
    return "";
  });
  const hasDestination = $derived(destinationCount > 0);
  const canSend = $derived(hasDestination && phase === "idle");
  const excludeUserIds = $derived(
    [currentUserId, ...selectedUsers.map((user) => user.id)].filter(
      Boolean
    ) as string[]
  );

  /** Avatar + label for each chosen destination, in selection order. */
  const destinationChips = $derived<SendDestinationChip[]>([
    ...selectedConversations.map((conversation) => ({
      key: `c:${conversation.id}`,
      name: conversationName(conversation),
      avatar: conversation.otherParticipant?.avatar,
      isGroup: conversation.type === "group",
      remove: () => toggleConversation(conversation),
    })),
    ...selectedUsers.map((user) => ({
      key: `u:${user.id}`,
      name: getUserIdentityLabels(user).primary,
      avatar: user.avatar,
      isGroup: false,
      remove: () => removeUser(user.id),
    })),
  ]);

  // The conversation list may not have arrived yet on a cold share launch, so
  // resolve the direct-share target against it reactively rather than once.
  const directShareConversationId = inputs.directShareConversationId ?? null;
  let preselectionApplied = false;
  $effect(() => {
    if (preselectionApplied || !directShareConversationId) return;
    const match = inboxState.conversations.find(
      (conversation) => conversation.id === directShareConversationId
    );
    if (!match) return;
    preselectionApplied = true;
    // Not toggleConversation: this runs once on open, and a toggle would
    // DESELECT the target if anything had already put it in the list.
    if (!isConversationSelected(match.id)) {
      selectedConversations = [...selectedConversations, match];
    }
  });

  /** The attachment as it leaves: a sequence picks up the view on stage now. */
  function resolveOutgoingAttachment(): PendingMessageAttachment {
    if (attachment.type !== "sequence" || !inputs.getSequenceViewParams) {
      return attachment;
    }
    const viewParams = inputs.getSequenceViewParams();
    const { sequenceViewParams: _stale, ...payload } = attachment.payload;
    return {
      ...attachment,
      payload: viewParams
        ? { ...payload, sequenceViewParams: viewParams }
        : payload,
    };
  }

  function conversationName(conversation: ConversationPreview): string {
    return conversation.type === "group"
      ? conversation.groupName || "Unnamed group"
      : getUserIdentityLabels(conversation.otherParticipant, "Unknown").primary;
  }

  function isConversationSelected(id: string): boolean {
    return selectedConversations.some((entry) => entry.id === id);
  }

  /** Tapping a row adds it; tapping it again takes it back off the list. */
  function toggleConversation(conversation: ConversationPreview): void {
    if (phase !== "idle") return;
    dependencies.getHaptics()?.trigger("selection");
    selectedConversations = isConversationSelected(conversation.id)
      ? selectedConversations.filter((entry) => entry.id !== conversation.id)
      : [...selectedConversations, conversation];
  }

  function removeUser(id: string): void {
    if (phase !== "idle") return;
    selectedUsers = selectedUsers.filter((user) => user.id !== id);
  }

  function selectUser(user: {
    uid: string;
    displayName: string;
    username?: string;
    photoURL?: string;
  }): void {
    if (phase !== "idle") return;
    const displayName = user.displayName || user.username || "Unknown";
    if (!selectedUsers.some((entry) => entry.id === user.uid)) {
      selectedUsers = [
        ...selectedUsers,
        {
          id: user.uid,
          displayName,
          username: user.username,
          avatar: user.photoURL,
        },
      ];
    }
    // Clear the field rather than parking the name in it: the chosen person is
    // now shown as a chip, and leaving the input filled makes searching for the
    // NEXT recipient a delete-first chore.
    searchUserId = "";
    searchUserDisplay = "";
    searchResetKey++;
  }

  function clearDestination(): void {
    if (phase !== "idle") return;
    dependencies.getHaptics()?.trigger("selection");
    selectedConversations = [];
    selectedUsers = [];
    searchUserId = "";
    searchUserDisplay = "";
    searchResetKey++;
  }

  async function resolveConversationId(
    conversation: ConversationPreview | null,
    user: SendSelectedUser | null
  ): Promise<string> {
    if (conversation) return conversation.id;
    const created = await conversationService.getOrCreateConversation(
      user!.id,
      {
        silent: true,
      }
    );
    return created.conversation.id;
  }

  /**
   * Place the attachment in one already-resolved conversation's outbox.
   *
   * `sequenceAttachment` is built ONCE by the caller: the short code is a
   * network write, and minting a fresh one per recipient would scatter N codes
   * for a single share. The raw sequence stays on the outbox item for its
   * optimistic preview; the prepared attachment prevents the delivery
   * coordinator from creating another code.
   */
  async function deliverTo(
    conversationId: string,
    outgoing: PendingMessageAttachment,
    sequenceAttachment: ReturnType<typeof buildSequenceMessageAttachment> | null
  ): Promise<void> {
    // Each image recipient needs distinct stable IDs. Reusing the IDs on the
    // share-intake attachment would collapse several destinations into one
    // outbox row.
    const queuedAttachment: PendingMessageAttachment =
      outgoing.type === "image"
        ? {
            ...outgoing,
            messageId: crypto.randomUUID(),
            attachmentId: crypto.randomUUID(),
          }
        : outgoing;

    await dependencies.delivery.queueMessage({
      conversationId,
      content: message.trim(),
      attachment: queuedAttachment,
      preparedAttachments: sequenceAttachment
        ? [sequenceAttachment]
        : undefined,
    });
  }

  async function send(): Promise<void> {
    if (destinationCount === 0 || phase !== "idle") return;
    if (attachment.type === "sequence" && !authState.isFullAccount) {
      inputs.onGuestBlocked();
      authDrawerState.show("signup", "share-sequence");
      return;
    }

    const conversations = [...selectedConversations];
    const users = [...selectedUsers];
    const haptics = dependencies.getHaptics();
    const outgoing = resolveOutgoingAttachment();

    phase = "sending";

    try {
      await ensureGuestIdentity();

      // Short code first: creating the conversation and THEN failing would
      // leave an empty conversation behind. Built once for the whole send -
      // see deliverTo.
      let sequenceAttachment: ReturnType<
        typeof buildSequenceMessageAttachment
      > | null = null;
      if (outgoing.type === "sequence") {
        const { code } = await getShortCodeManager().createShortCode(
          outgoing.payload.sequence,
          { embedSequenceData: true }
        );
        sequenceAttachment = buildSequenceMessageAttachment(
          outgoing.payload.sequence,
          code,
          { viewParams: outgoing.payload.sequenceViewParams }
        );
      }

      // Sequential, not Promise.all. Each image recipient is a full upload of
      // the same bytes; firing four at once on a phone's uplink makes all four
      // slower and starves the rest of the app.
      const queuedFor: string[] = [];
      const failures: string[] = [];
      let firstError: unknown = null;

      const deliverOne = async (
        label: string,
        resolve: () => Promise<string>
      ): Promise<void> => {
        try {
          const id = await resolve();
          await deliverTo(id, outgoing, sequenceAttachment);
          queuedFor.push(id);
        } catch (caught) {
          failures.push(label);
          firstError ??= caught;
          console.error("[SendAttachment] Delivery failed:", caught);
        }
      };

      for (const conversation of conversations) {
        await deliverOne(conversationName(conversation), () =>
          resolveConversationId(conversation, null)
        );
      }
      for (const user of users) {
        await deliverOne(user.displayName, () =>
          resolveConversationId(null, user)
        );
      }

      // Nobody got it. Rethrow the UNDERLYING error rather than a summary, so
      // the report keeps the real cause ("permission denied") in
      // technicalDetails instead of a sentence we wrote.
      if (queuedFor.length === 0) {
        throw (
          firstError ?? new Error("Couldn't queue this for anyone you picked.")
        );
      }

      // Some got it, some did not. Do NOT re-send silently and do NOT discard
      // the share: name who missed out, and let the completed ones stand.
      if (failures.length > 0) {
        toast.error(
          failures.length === 1
            ? `Queued, but ${failures[0]} couldn't be added.`
            : `Queued for ${queuedFor.length}, but ${failures.length} couldn't be added.`
        );
      }

      haptics?.trigger("success");
      inputs.onSent(queuedFor);
    } catch (caught) {
      const failure =
        caught instanceof Error ? caught : new Error(String(caught));
      getErrorHandler().showUserError({
        message:
          getShortCodeShareMessage(caught) ??
          (attachment.type === "image"
            ? "The image couldn’t be saved to the outbox. Try again."
            : "The sequence couldn’t be saved to the outbox. Try again."),
        technicalDetails: failure.message,
        error: failure,
        severity: "warning",
        context: {
          module: "inbox",
          tab: "messages",
          action: attachment.type === "image" ? "sendImage" : "sendSequence",
        },
      });
      haptics?.trigger("error");
      phase = "idle";
    }
  }

  return {
    get attachment() {
      return attachment;
    },
    get selectedConversation() {
      return selectedConversation;
    },
    get selectedUser() {
      return selectedUser;
    },
    get selectedConversationIsGroup() {
      return selectedConversationIsGroup;
    },
    get destinationCount() {
      return destinationCount;
    },
    get destinationName() {
      return destinationName;
    },
    get destinationDetail() {
      return destinationDetail;
    },
    get destinationChips() {
      return destinationChips;
    },
    get hasDestination() {
      return hasDestination;
    },
    get canSend() {
      return canSend;
    },
    get sending() {
      return phase === "sending";
    },
    get sendLabel() {
      return sendLabel;
    },
    get recentConversations() {
      return recentConversations;
    },
    /** Recents are still on their way; an empty list means nothing yet. */
    get recentsLoading() {
      return !inboxState.conversationsLoaded;
    },
    get excludeUserIds() {
      return excludeUserIds;
    },
    get message() {
      return message;
    },
    set message(value: string) {
      message = value;
    },
    get searchResetKey() {
      return searchResetKey;
    },
    get searchUserId() {
      return searchUserId;
    },
    get searchUserDisplay() {
      return searchUserDisplay;
    },
    isConversationSelected,
    toggleConversation,
    selectUser,
    clearDestination,
    send,
  };
}
