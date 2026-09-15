<script lang="ts">
  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
  import { getErrorHandler } from "$lib/shared/application/get-error-handler";
  import type { HapticFeedback } from "$lib/shared/application/services/haptic-feedback";
  import { ensureGuestIdentity } from "$lib/shared/auth/services/guest-identity";
  import { authDrawerState } from "$lib/shared/auth/state/auth-drawer-state.svelte";
  import { authState } from "$lib/shared/auth/state/auth-state.svelte";
  import RobustAvatar from "$lib/shared/components/avatar/RobustAvatar.svelte";
  import type { ConversationPreview } from "$lib/shared/messaging/domain/models/conversation-models";
  import { conversationService } from "$lib/shared/messaging/services/conversation-manager";
  import type { PendingMessageAttachment } from "../../domain/pending-message-attachment";
  import { getShortCodeManager } from "$lib/shared/qr/get-short-code-manager";
  import { getShortCodeShareMessage } from "$lib/shared/qr/domain/short-code-error";
  import UserSearchInput from "$lib/shared/user-search/UserSearchInput.svelte";
  import { onMount } from "svelte";
  import { buildSequenceMessageAttachment } from "../../domain/message-attachment-builders";
  import { toast } from "$lib/shared/toast/state/toast-state.svelte";
  import { inboxState } from "../../state/inbox-state.svelte";
  import ConversationItem from "./ConversationItem.svelte";
  import GroupAvatarStack from "./GroupAvatarStack.svelte";
  import { getUserIdentityLabels } from "$lib/shared/community/domain/user-identity-labels";
  import { getMessageDeliveryContext } from "../../context/message-delivery-context";

  interface Props {
    attachment: PendingMessageAttachment;
    /** Prefilled note. Share intake passes the shared text that was not a code. */
    initialNote?: string;
    /**
     * The conversations that accepted it into their outbox, in queue order.
     * Plural because one share can now go to several people; a partial success
     * reports only the durable entries that were created.
     */
    onSent: (conversationIds: string[]) => void;
  }

  type SelectedUser = {
    id: string;
    displayName: string;
    username?: string | null;
    avatar?: string;
  };

  let { attachment, initialNote = "", onSent }: Props = $props();
  const messageDeliveryState = getMessageDeliveryContext();

  // Naming this `payload` is what keeps the nine existing payload.* references
  // in this file working across the generalization.
  const payload = $derived(
    attachment.type === "sequence" ? attachment.payload : null
  );
  const image = $derived(attachment.type === "image" ? attachment : null);

  const MESSAGE_MAX = 500;
  const MAX_RECENT_CONVERSATIONS = 8;

  // Multi-recipient: one share, N destinations. Kept as two lists rather than
  // one union list because they resolve differently at send time - an existing
  // conversation already has an id, a searched user needs one created.
  let selectedConversations = $state<ConversationPreview[]>([]);
  let selectedUsers = $state<SelectedUser[]>([]);

  // The single-destination case is still THE common one, and the whole sheet
  // used to be written against these two. Deriving them keeps that reading
  // (avatar, name, subtitle) intact instead of special-casing length 1
  // everywhere.
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
  let message = $state(initialNote);
  let phase = $state<"idle" | "sending">("idle");
  let thumbnailFailed = $state(false);
  let searchResetKey = $state(0);
  let searchUserId = $state("");
  let searchUserDisplay = $state("");
  let hapticService: HapticFeedback | undefined;

  const currentUserId = $derived(authState.user?.uid ?? "");
  const imagePreviewUrl = $derived(
    image ? URL.createObjectURL(image.file) : null
  );
  const sequencePreviewUrl = $derived(
    payload?.sequencePreviewBlob
      ? URL.createObjectURL(payload.sequencePreviewBlob)
      : null
  );
  // While the fresh card is rendering the cloud thumbnail stays out of the
  // frame: it can be a card from an older renderer, and flashing it before the
  // real one lands reads as the wrong card. It is the fallback only once the
  // render has failed.
  const previewPending = $derived(
    !!payload?.sequencePreviewPending && !sequencePreviewUrl
  );
  const previewThumbnailUrl = $derived(
    sequencePreviewUrl ||
      (previewPending ? null : payload?.sequenceThumbnail) ||
      null
  );

  // Revoke on swap and on unmount; a leaked blob: URL pins the whole image in
  // memory for the life of the tab. The send sheet owns both preview URLs so a
  // caller can unmount without breaking a sheet that is already open.
  $effect(() => {
    const urls = [imagePreviewUrl, sequencePreviewUrl].filter(
      (url): url is string => !!url
    );
    return () => {
      for (const url of urls) URL.revokeObjectURL(url);
    };
  });

  $effect(() => {
    if (previewThumbnailUrl) thumbnailFailed = false;
  });

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
  const destinationChips = $derived([
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

  // A Direct Share tap names the conversation before this sheet ever renders.
  //
  // Reads shareAttachmentConversationId, NOT pendingConversationId. The latter
  // means "navigate to this thread" and InboxDrawer owns it - its effect would
  // pull us out of this sheet and drop the attachment. An earlier revision won
  // that race by claiming the field at init; a dedicated field means there is no
  // race to win.
  const directShareConversationId = inboxState.shareAttachmentConversationId;

  // The conversation list may not have arrived yet on a cold share launch, so
  // resolve against it reactively rather than once.
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

  onMount(() => {
    hapticService = getHapticFeedback();
  });

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
    hapticService?.trigger("selection");
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
    hapticService?.trigger("selection");
    selectedConversations = [];
    selectedUsers = [];
    searchUserId = "";
    searchUserDisplay = "";
    searchResetKey++;
  }

  async function resolveConversationId(
    conversation: ConversationPreview | null,
    user: SelectedUser | null
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
   * Split out of send() so the multi-recipient loop has one place to call and
   * one place to fail. `sequenceAttachment` is built ONCE by the caller: the
   * short code is a network write, and minting a fresh one per recipient would
   * scatter N codes for a single share. The raw sequence stays on the outbox
   * item for its optimistic preview; the prepared attachment prevents the
   * delivery coordinator from creating another code.
   */
  async function deliverTo(
    conversationId: string,
    sequenceAttachment: ReturnType<typeof buildSequenceMessageAttachment> | null
  ): Promise<void> {
    // Each image recipient needs distinct stable IDs. Reusing the IDs on the
    // share-intake attachment would collapse several destinations into one
    // outbox row.
    const queuedAttachment: PendingMessageAttachment =
      attachment.type === "image"
        ? {
            ...attachment,
            messageId: crypto.randomUUID(),
            attachmentId: crypto.randomUUID(),
          }
        : attachment;

    await messageDeliveryState.queueMessage({
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
      inboxState.cancelSequenceShare();
      authDrawerState.show("signup", "share-sequence");
      return;
    }

    const conversations = [...selectedConversations];
    const users = [...selectedUsers];

    phase = "sending";

    try {
      await ensureGuestIdentity();

      // Short code first, exactly as before: creating the conversation and THEN
      // failing would leave an empty conversation behind. Built once for the
      // whole send - see deliverTo.
      let sequenceAttachment: ReturnType<
        typeof buildSequenceMessageAttachment
      > | null = null;
      if (attachment.type === "sequence") {
        const { code } = await getShortCodeManager().createShortCode(
          attachment.payload.sequence,
          { embedSequenceData: true }
        );
        sequenceAttachment = buildSequenceMessageAttachment(
          attachment.payload.sequence,
          code
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
          await deliverTo(id, sequenceAttachment);
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

      hapticService?.trigger("success");
      onSent(queuedFor);
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
      hapticService?.trigger("error");
      phase = "idle";
    }
  }
</script>

<!--
  The container lives on this wrapper, NOT on the sheet.

  An element is never matched by the container query of the container it
  establishes - only its descendants are. With `container-type` on the sheet
  itself, every @container rule targeting `.send-attachment-sheet` (the column
  template, the row template, the column gap) was silently dropped, and the
  two-column layout only appeared because the descendant `grid-column: 2` rules
  created IMPLICIT, auto-sized tracks. It looked right and was unsizable.
-->
<div class="sheet-shell">
  <div
    class="send-attachment-sheet"
    class:destination-selected={hasDestination}
    aria-busy={phase === "sending"}
  >
    <!-- The card IS the preview. The title says "Send sequence" and the card
         shows the word, so a caption repeating both only stole height from
         the card it captioned. -->
    <article class="sequence-preview" aria-label="Attachment being shared">
      <div class="preview-thumbnail">
        {#if payload && previewThumbnailUrl && !thumbnailFailed}
          <img
            src={previewThumbnailUrl}
            alt=""
            class="thumbnail-img"
            onerror={() => {
              thumbnailFailed = true;
            }}
          />
        {:else if imagePreviewUrl}
          <img src={imagePreviewUrl} alt="" class="thumbnail-img" />
        {:else if previewPending}
          <div class="thumbnail-fallback" role="status">
            <i class="fas fa-circle-notch fa-spin" aria-hidden="true"></i>
            <span>Preparing card…</span>
          </div>
        {:else}
          <div class="thumbnail-fallback" aria-hidden="true">
            <i class="fas {image ? 'fa-image' : 'fa-layer-group'}"></i>
          </div>
        {/if}
      </div>
    </article>

    <section
      class="destination-section"
      aria-labelledby="share-destination-title"
    >
      <div class="section-heading">
        <div>
          <span class="section-kicker">Destination</span>
          <h3 id="share-destination-title">Send to</h3>
        </div>
      </div>

      <div class="selected-slot" aria-live="polite">
        {#if destinationCount > 1}
          <!-- Two or more: chips, so every recipient is visible and individually
             removable. A single "3 people" summary hides WHO, which is the one
             thing worth double-checking before sending a photo. -->
          <div class="selected-destination selected-many">
            <div class="destination-chips">
              {#each destinationChips as chip (chip.key)}
                <span class="destination-chip">
                  {#if chip.isGroup}
                    <span class="chip-avatar group-fallback" aria-hidden="true">
                      <i class="fas fa-user-group"></i>
                    </span>
                  {:else}
                    <RobustAvatar
                      src={chip.avatar}
                      name={chip.name}
                      alt=""
                      customSize={28}
                    />
                  {/if}
                  <span class="chip-name">{chip.name}</span>
                  <button
                    type="button"
                    class="chip-remove"
                    onclick={chip.remove}
                    disabled={phase === "sending"}
                    aria-label={`Remove ${chip.name}`}
                  >
                    <i class="fas fa-xmark" aria-hidden="true"></i>
                  </button>
                </span>
              {/each}
            </div>
            <button
              type="button"
              class="clear-destination"
              onclick={clearDestination}
              disabled={phase === "sending"}
            >
              Clear
            </button>
          </div>
        {:else if hasDestination}
          <div class="selected-destination">
            <div class="selected-avatar">
              {#if selectedConversationIsGroup && selectedConversation}
                {#if selectedConversation.participantPreviews?.length}
                  <GroupAvatarStack
                    participants={selectedConversation.participantPreviews}
                    customAvatar={selectedConversation.groupAvatar}
                    size={44}
                    maxVisible={3}
                  />
                {:else}
                  <span class="group-fallback" aria-hidden="true">
                    <i class="fas fa-user-group"></i>
                  </span>
                {/if}
              {:else}
                <RobustAvatar
                  src={selectedConversation?.otherParticipant?.avatar ??
                    selectedUser?.avatar}
                  name={destinationName}
                  alt=""
                  customSize={44}
                />
              {/if}
            </div>
            <div class="selected-copy">
              <strong>{destinationName}</strong>
              <span>{destinationDetail}</span>
            </div>
            <button
              type="button"
              class="clear-destination"
              onclick={clearDestination}
              disabled={phase === "sending"}
            >
              Change
            </button>
          </div>
        {:else}
          <div class="destination-placeholder">
            <span class="placeholder-icon" aria-hidden="true">
              <i class="fas fa-paper-plane"></i>
            </span>
            <div>
              <strong>Choose a conversation</strong>
              <span>Pick a recent chat or find someone new.</span>
            </div>
          </div>
        {/if}
      </div>

      <!--
      Rendered unconditionally, then hidden by CSS in the narrow layout once a
      destination is chosen. The wide (two-column) layout keeps the list on
      screen next to the chosen destination, so switching recipient is one tap
      instead of Change-then-repick - and the sheet's column count no longer
      changes on select, which would have moved every element on the page.
    -->
      <div
        class="destination-browser"
        inert={phase === "sending"}
        aria-label="Share destinations"
      >
        {#if recentConversations.length > 0}
          <div class="destination-group">
            <h4>Recent conversations</h4>
            <div class="conversation-options">
              {#each recentConversations as conversation (conversation.id)}
                <ConversationItem
                  {conversation}
                  selectionMode
                  selected={isConversationSelected(conversation.id)}
                  onclick={() => toggleConversation(conversation)}
                />
              {/each}
            </div>
          </div>
        {/if}

        <div class="destination-group new-conversation">
          <h4>
            {recentConversations.length > 0
              ? "Start a new conversation"
              : "Find someone"}
          </h4>
          {#key searchResetKey}
            <UserSearchInput
              selectedUserId={searchUserId}
              selectedUserDisplay={searchUserDisplay}
              onSelect={selectUser}
              placeholder="Search by username or name"
              inlineResults
              {excludeUserIds}
              autofocus={recentConversations.length === 0 && !hasDestination}
            />
          {/key}
        </div>
      </div>
    </section>

    <div class="message-section">
      <textarea
        id="sequence-share-message"
        class="message-input"
        bind:value={message}
        aria-label="Note (optional)"
        placeholder="Add a note (optional)"
        maxlength={MESSAGE_MAX}
        rows={1}
        disabled={phase === "sending"}
      ></textarea>
      <span
        class="char-count"
        class:visible={message.length > MESSAGE_MAX * 0.8}
        aria-hidden={message.length <= MESSAGE_MAX * 0.8}
      >
        {message.length}/{MESSAGE_MAX}
      </span>
    </div>

    <button
      type="button"
      class="send-button"
      onclick={send}
      disabled={!canSend}
    >
      <i
        class="fas {phase === 'sending'
          ? 'fa-spinner fa-spin'
          : 'fa-paper-plane'}"
        aria-hidden="true"
      ></i>
      <span>{phase === "sending" ? "Sending…" : sendLabel}</span>
    </button>
  </div>
</div>

<style>
  .sheet-shell {
    container-type: inline-size;
    display: grid;
    height: 100%;
    min-height: 0;
  }

  .send-attachment-sheet {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto auto;
    gap: 0.875rem;
    height: 100%;
    min-height: 0;
    padding: 1rem;
    color: var(--theme-text);
  }

  .sequence-preview {
    display: grid;
    grid-template-rows: minmax(0, 1fr);
    justify-self: center;
    width: fit-content;
    max-width: 100%;
    min-height: 0;
    margin: 0;
    padding: 0.5rem;
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 1rem;
  }

  /* No fixed aspect ratio: the card sets its own shape and the box fits it.
     A forced 4:3 box cropped every card taller than a postcard. The single-
     column form caps the height so a 16-step card does not push the
     recipients below the fold; the two-column form removes the cap and lets
     the card fill its column instead. */
  .preview-thumbnail {
    --preview-cap: min(14rem, 32dvh);
    display: grid;
    place-items: center;
    width: 100%;
    min-height: 0;
    max-height: var(--preview-cap);
    overflow: hidden;
    background: color-mix(in srgb, var(--theme-panel-bg) 82%, transparent);
    border: 1px solid var(--theme-stroke);
    border-radius: 0.75rem;
  }

  /* The box above is auto-height here, so a 100% max-height on the image
     resolves to none; the image repeats the cap. Modes that give the box a
     definite height switch it back to 100%. */
  .thumbnail-img {
    display: block;
    width: auto;
    height: auto;
    max-width: 100%;
    max-height: var(--preview-cap);
    object-fit: contain;
  }

  .thumbnail-fallback {
    display: grid;
    place-items: center;
    gap: 0.5rem;
    /* The frame hugs its content, so the icon needs a box of its own. */
    min-width: 8rem;
    min-height: 6rem;
    padding: 0.75rem;
    color: var(--theme-text-dim);
    font-size: clamp(
      var(--font-size-xl, 1.25rem),
      6cqw,
      var(--font-size-3xl, 1.875rem)
    );
  }

  .thumbnail-fallback span {
    font-size: var(--font-size-sm, 0.875rem);
  }

  .section-kicker {
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 700;
    letter-spacing: 0.08em;
    line-height: 1.2;
    text-transform: uppercase;
  }

  .destination-section {
    display: grid;
    grid-template-rows: auto auto minmax(0, 1fr);
    gap: 0.625rem;
    min-height: 0;
  }

  .destination-selected .destination-section {
    grid-template-rows: auto auto;
  }

  .section-heading {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 1rem;
  }

  .section-heading h3 {
    margin: 0.1rem 0 0;
    color: var(--theme-text);
    font-size: var(--font-size-base, 1rem);
    line-height: 1.2;
  }

  .clear-destination {
    min-width: 4.5rem;
    min-height: var(--min-touch-target, 44px);
    padding: 0.5rem 0.875rem;
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 999px;
    color: var(--theme-accent, var(--semantic-info));
    font: inherit;
    font-size: var(--font-size-sm, 0.875rem);
    font-weight: 700;
    cursor: pointer;
  }

  .clear-destination:hover:not(:disabled) {
    border-color: var(--theme-accent, var(--semantic-info));
  }

  .clear-destination:focus-visible,
  .send-button:focus-visible {
    outline: 2px solid var(--theme-accent, var(--semantic-info));
    outline-offset: 2px;
  }

  .selected-slot {
    min-height: 4.5rem;
  }

  .selected-destination,
  .destination-placeholder {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    min-height: 4.5rem;
    padding: 0.625rem 0.75rem;
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 0.875rem;
  }

  .selected-destination {
    border-color: color-mix(
      in srgb,
      var(--theme-accent, var(--semantic-info)) 55%,
      var(--theme-stroke)
    );
  }

  .selected-many {
    align-items: start;
    padding-block: 0.5rem;
  }

  .destination-chips {
    display: flex;
    flex: 1;
    flex-wrap: wrap;
    gap: 0.375rem;
    min-width: 0;
  }

  .destination-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    max-width: 100%;
    padding: 0.25rem 0.25rem 0.25rem 0.3rem;
    background: color-mix(
      in srgb,
      var(--theme-accent, var(--semantic-info)) 14%,
      transparent
    );
    border: 1px solid
      color-mix(
        in srgb,
        var(--theme-accent, var(--semantic-info)) 42%,
        transparent
      );
    border-radius: 999px;
  }

  .chip-name {
    overflow: hidden;
    color: var(--theme-text);
    font-size: var(--font-size-sm, 0.875rem);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .chip-remove {
    display: grid;
    flex: 0 0 auto;
    place-items: center;
    /* Below the 44px floor on purpose: this is a secondary control INSIDE a
       chip, and the chip row sits beside a full-size Clear button that does
       the same job. Sizing it to 44px would make three recipients wrap to
       three lines. */
    width: 1.5rem;
    height: 1.5rem;
    padding: 0;
    background: transparent;
    border: 0;
    border-radius: 50%;
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 0.75rem);
    cursor: pointer;
  }

  .chip-remove:hover:not(:disabled) {
    background: color-mix(in srgb, var(--theme-text) 12%, transparent);
    color: var(--theme-text);
  }

  .chip-avatar {
    width: 28px;
    height: 28px;
    font-size: var(--font-size-compact, 0.75rem);
  }

  .selected-avatar,
  .placeholder-icon {
    display: grid;
    flex: 0 0 auto;
    place-items: center;
    width: 44px;
    height: 44px;
  }

  .group-fallback,
  .placeholder-icon {
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    background: color-mix(
      in srgb,
      var(--theme-accent, var(--semantic-info)) 14%,
      transparent
    );
    border-radius: 50%;
    color: var(--theme-accent, var(--semantic-info));
  }

  .selected-copy,
  .destination-placeholder > div:last-child {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-width: 0;
  }

  .selected-copy strong,
  .destination-placeholder strong {
    overflow: hidden;
    color: var(--theme-text);
    font-size: var(--font-size-base, 1rem);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .selected-copy span,
  .destination-placeholder span {
    margin-top: 0.15rem;
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 0.75rem);
  }

  .destination-browser {
    min-height: 0;
    overflow: auto;
    overscroll-behavior: contain;
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 0.875rem;
    scrollbar-width: thin;
    scrollbar-color: var(--theme-stroke) transparent;
  }

  .destination-browser[inert] {
    opacity: 0.65;
  }

  .destination-group {
    padding: 0.75rem;
  }

  .destination-group + .destination-group {
    border-top: 1px solid var(--theme-stroke);
  }

  .destination-group h4 {
    margin: 0 0 0.5rem;
    color: var(--theme-text-dim);
    font-size: var(--font-size-sm, 0.875rem);
    font-weight: 700;
  }

  .conversation-options {
    overflow: hidden;
    border: 1px solid var(--theme-stroke);
    border-radius: 0.75rem;
  }

  .conversation-options :global(.conversation-item:last-child) {
    border-bottom: 0;
  }

  .new-conversation {
    position: relative;
    z-index: 1;
  }

  .message-section {
    position: relative;
    display: grid;
  }

  /* One line until typed into; grows to a few, then scrolls. The note is
     optional and rarely used, so it no longer owns whatever height the card
     and the recipients leave over. */
  .message-input {
    width: 100%;
    min-height: 2.75rem;
    max-height: 7.5rem;
    padding: 0.75rem;
    resize: none;
    field-sizing: content;
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 0.75rem;
    color: var(--theme-text);
    font: inherit;
    font-size: var(--font-size-base, 1rem);
    line-height: 1.35;
  }

  .message-input::placeholder {
    color: var(--theme-text-dim);
  }

  .message-input:focus {
    border-color: var(--theme-accent, var(--semantic-info));
    outline: none;
    box-shadow: 0 0 0 2px
      color-mix(
        in srgb,
        var(--theme-accent, var(--semantic-info)) 22%,
        transparent
      );
  }

  .message-input:disabled {
    cursor: not-allowed;
    opacity: 0.65;
  }

  /* Overlaid in the corner of the input: only shown near the limit, so it
     must not reserve a row of its own the rest of the time. */
  .char-count {
    position: absolute;
    right: 0.75rem;
    bottom: 0.5rem;
    pointer-events: none;
    visibility: hidden;
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 0.75rem);
    font-variant-numeric: tabular-nums;
    text-align: right;
  }

  .char-count.visible {
    visibility: visible;
  }

  .send-button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.625rem;
    width: 100%;
    min-height: 3rem;
    padding: 0.75rem 1rem;
    background: var(--theme-accent, var(--semantic-info));
    border: 1px solid transparent;
    border-radius: 0.875rem;
    color: white;
    font: inherit;
    font-size: var(--font-size-sm, 0.875rem);
    font-weight: 800;
    cursor: pointer;
    transition:
      filter var(--duration-fast, 150ms) ease,
      transform var(--duration-fast, 150ms) ease,
      opacity var(--duration-fast, 150ms) ease;
  }

  .send-button:hover:not(:disabled) {
    filter: brightness(1.08);
    transform: translateY(-1px);
  }

  .send-button:active:not(:disabled) {
    transform: translateY(0);
  }

  .send-button:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }

  /* Narrow layout: choosing a destination collapses the browser, as before. */
  .destination-selected .destination-browser {
    display: none;
  }

  /* ...which leaves the destination section short while it still holds the
     sheet's 1fr row, so the space the list used to occupy became a void
     between the recipients and the note. Hand the slack to the note instead.

     Bounded by an explicit max-width rather than left to be overridden by the
     two-column block: both selectors carry one class plus Svelte's scope
     class, so they tie on specificity and the winner is decided by source
     order alone. That tie resolved the wrong way here and silently flattened
     the note in the wide layout. */
  @container (max-width: 41.999rem) {
    .destination-selected {
      grid-template-rows: minmax(0, 1fr) auto auto auto;
    }

    .destination-selected .preview-thumbnail {
      max-height: none;
      height: 100%;
    }

    .destination-selected .thumbnail-img {
      max-height: 100%;
    }
  }

  @container (min-width: 34rem) {
    .destination-group {
      padding: 0.875rem;
    }
  }

  /*
    Two columns once the sheet itself is wide enough to hold them.
    A CONTAINER query, not a media query: this sheet lives in a drawer whose
    width is set by --sheet-width, so viewport width says nothing useful about
    how much room it actually has.

    42rem (672px) is where the split starts paying off, and it lands on the
    real hardware seams:
      - Galaxy Z Fold unfolded is a 707x823 CSS viewport (1856x2160 @ 420dpi),
        under the 768px mobile seam, so the drawer is already full-width -
        44.2rem of sheet, and previously one narrow column down the middle.
      - 2560 desktop -> drawer 717px (44.8rem) -> two columns.
      - 3840 desktop -> drawer 1024px (64rem)  -> two columns.
      - 1920 desktop -> drawer  537px (33.6rem) -> stays single, correctly.
  */
  @container (min-width: 42rem) {
    .send-attachment-sheet {
      /* The recipient list needs a conversation's width and no more; every
         extra pixel goes to the card. */
      grid-template-columns: minmax(0, 1fr) clamp(20rem, 38%, 26rem);
      /* Card, note, send, then whatever is left. The recipients column spans
         every row, so the slack lands under the send button instead of
         between it and the card. */
      grid-template-rows: auto auto auto minmax(0, 1fr);
      column-gap: 1rem;
    }

    /* Left column: what you are sending, and the act of sending it. The
       frame hugs the card rather than stretching to the row: a portrait card
       in a 300px column is width-bound at ~400px tall, and a 1100px frame
       around it read as a broken image. */
    .sequence-preview {
      grid-row: 1;
      grid-column: 1;
      align-self: start;
    }

    .preview-thumbnail {
      /* Whatever height the header, note, and Send do not need. 18rem is
         their combined height with the sheet's padding and gaps. */
      --preview-cap: max(14rem, calc(100dvh - 18rem));
    }

    .message-section {
      grid-row: 2;
      grid-column: 1;
    }

    .send-button {
      grid-row: 3;
      grid-column: 1;
    }

    /* Right column: who it goes to, full height, always visible. */
    .destination-section,
    .destination-selected .destination-section {
      grid-row: 1 / -1;
      grid-column: 2;
      grid-template-rows: auto auto minmax(0, 1fr);
    }

    .destination-selected .destination-browser {
      display: block;
    }
  }

  @media (max-height: 31rem) {
    .send-attachment-sheet {
      gap: 0.375rem;
      padding: 0.375rem 0.5rem 0.5rem;
    }

    .sequence-preview {
      padding: 0.25rem 0.5rem;
    }

    /* A wide-AND-short window (e.g. 2560x400) satisfies the two-column
       container query as well as this block. A short card strip is all the
       room there is; the grid-area overrides below do the rest. */
    .preview-thumbnail {
      --preview-cap: 4.5rem;
      height: auto;
    }

    .section-kicker {
      display: none;
    }

    .section-heading h3 {
      margin-top: 0;
    }

    .destination-section {
      gap: 0.35rem;
    }

    .selected-slot,
    .selected-destination,
    .destination-placeholder {
      min-height: 3rem;
    }

    .selected-destination,
    .destination-placeholder {
      padding: 0.25rem 0.5rem;
    }

    .selected-avatar,
    .placeholder-icon,
    .group-fallback {
      width: 36px;
      height: 36px;
    }

    .clear-destination {
      min-width: 4.25rem;
    }

    .destination-browser {
      min-height: 5rem;
    }

    .destination-group {
      padding: 0.5rem;
    }

    .message-input {
      min-height: 2.75rem;
      max-height: 3.5rem;
      padding-block: 0.5rem;
    }

    .send-button {
      min-height: var(--min-touch-target, 44px);
      padding-block: 0.5rem;
    }
  }

  @media (max-height: 31rem) and (min-width: 40rem) {
    .send-attachment-sheet {
      grid-template-columns: minmax(0, 1fr) auto;
      grid-template-rows: auto minmax(0, 1fr) auto;
      column-gap: 0.5rem;
    }

    .sequence-preview,
    .destination-section {
      grid-column: 1 / -1;
    }

    .destination-section {
      grid-row: 2;
    }

    .destination-browser {
      min-height: 4.25rem;
    }

    .destination-group h4 {
      margin-bottom: 0.25rem;
    }

    .message-section {
      grid-column: 1;
      grid-row: 3;
    }

    .send-button {
      grid-column: 2;
      grid-row: 3;
      align-self: end;
      width: auto;
      min-width: 10rem;
    }
  }

  @media (max-height: 31rem) and (max-width: 39.999rem) {
    .send-attachment-sheet {
      grid-template-rows: auto auto auto auto;
      height: auto;
      min-height: 100%;
      overflow-y: auto;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .send-button {
      transition: none;
    }
  }
</style>
