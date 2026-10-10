<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { getErrorHandler } from "#lib/shared/application/get-error-handler.js";
  import { getHapticFeedback } from "#lib/shared/application/get-haptic-feedback.js";
  import { authState } from "#lib/shared/auth/state/auth-state.svelte.js";
  import RobustAvatar from "#lib/shared/components/avatar/RobustAvatar.svelte";
  import ConfirmDialog from "#lib/shared/foundation/ui/ConfirmDialog.svelte";
  import type { CollectionAccessRole } from "#lib/shared/library/domain/models/collection.js";
  import { getCollectionCollaborationManager } from "#lib/shared/library/get-collection-collaboration-manager.js";
  import type { CollectionShareAccessItem } from "#lib/shared/library/services/contracts/ICollectionCollaborationManager.js";
  import type { ConversationPreview } from "#lib/shared/messaging/domain/models/conversation-models.js";
  import { conversationService } from "#lib/shared/messaging/services/conversation-manager.js";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import UserSearchInput from "#lib/shared/user-search/UserSearchInput.svelte";
  import { onMount } from "svelte";
  import type { PendingMessageAttachment } from "../../domain/pending-message-attachment";
  import { inboxState } from "../../state/inbox-state.svelte";
  import { getUserIdentityLabels } from "#lib/shared/community/domain/user-identity-labels.js";

  interface Props {
    attachment: Extract<PendingMessageAttachment, { type: "collection" }>;
    initialNote?: string;
    onSent: (conversationIds: string[]) => void;
  }

  interface SelectedPerson {
    id: string;
    displayName: string;
    username?: string | null;
    avatar?: string;
    conversationId?: string;
  }

  const MESSAGE_MAX = 500;
  const MAX_RECENT_PEOPLE = 8;
  const roleOptions = $derived([
    { value: "viewer" as const, label: t("inbox_ui_can_view"), icon: "fa-solid fa-eye" },
    { value: "editor" as const, label: t("inbox_ui_can_edit"), icon: "fa-solid fa-pen" },
  ]);

  let { attachment, initialNote = "", onSent }: Props = $props();
  const payload = $derived(attachment.payload);
  const collaborationManager = getCollectionCollaborationManager();
  const haptic = getHapticFeedback();

  let selectedPeople = $state<SelectedPerson[]>([]);
  let accessItems = $state<CollectionShareAccessItem[]>([]);
  let accessLoading = $state(true);
  let accessError = $state(false);
  let role = $state<CollectionAccessRole>("viewer");
  let note = $state(initialNote);
  let phase = $state<"idle" | "sending">("idle");
  let searchResetKey = $state(0);
  let pendingRemoval = $state<CollectionShareAccessItem | null>(null);
  let removeDialogOpen = $state(false);
  let updatingRecipientId = $state<string | null>(null);

  const existingRecipientIds = $derived(
    accessItems.map((item) => item.grant.recipientId)
  );
  const excludeUserIds = $derived(
    [
      authState.user?.uid ?? "",
      ...existingRecipientIds,
      ...selectedPeople.map((person) => person.id),
    ].filter(Boolean)
  );
  const recentPeople = $derived.by(() => {
    const seen = new Set<string>();
    const people: SelectedPerson[] = [];
    for (const conversation of inboxState.conversations) {
      if (conversation.type === "group" || !conversation.otherParticipant)
        continue;
      const person = conversation.otherParticipant;
      if (
        !person.id ||
        seen.has(person.id) ||
        excludeUserIds.includes(person.id)
      )
        continue;
      seen.add(person.id);
      people.push({
        id: person.id,
        displayName: person.displayName || t("inbox_ui_unknown"),
        username: person.username,
        avatar: person.avatar,
        conversationId: conversation.id,
      });
      if (people.length === MAX_RECENT_PEOPLE) break;
    }
    return people;
  });
  const shareLabel = $derived(
    selectedPeople.length > 1
      ? t("inbox_share_count", { count: selectedPeople.length })
      : t("inbox_ui_share_collection")
  );

  onMount(() =>
    collaborationManager.subscribeToAccessList(
      payload.ownerId,
      payload.collectionId,
      (items) => {
        accessItems = items;
        accessLoading = false;
        accessError = false;
      },
      (error) => {
        accessLoading = false;
        accessError = true;
        showFailure(
          t("inbox_ui_people_with_access_could_not_be_loaded"),
          error,
          "loadAccessList"
        );
      }
    )
  );

  function isSelected(userId: string): boolean {
    return selectedPeople.some((person) => person.id === userId);
  }

  function togglePerson(person: SelectedPerson): void {
    if (phase !== "idle") return;
    haptic?.trigger("selection");
    selectedPeople = isSelected(person.id)
      ? selectedPeople.filter((entry) => entry.id !== person.id)
      : [...selectedPeople, person];
  }

  function selectSearchResult(user: {
    uid: string;
    displayName: string;
    username?: string;
    photoURL?: string;
  }): void {
    if (isSelected(user.uid)) return;
    selectedPeople = [
      ...selectedPeople,
      {
        id: user.uid,
        displayName: user.displayName || user.username || t("inbox_ui_unknown"),
        username: user.username,
        avatar: user.photoURL,
      },
    ];
    searchResetKey++;
  }

  function showFailure(message: string, error: unknown, action: string): void {
    const failure = error instanceof Error ? error : new Error(String(error));
    getErrorHandler().showUserError({
      message,
      technicalDetails: failure.message,
      error: failure,
      severity: "warning",
      context: { module: "inbox", tab: "messages", action },
    });
  }

  async function resolveConversation(person: SelectedPerson): Promise<string> {
    if (person.conversationId) return person.conversationId;
    const result = await conversationService.getOrCreateConversation(
      person.id,
      {
        silent: true,
      }
    );
    return result.conversation.id;
  }

  async function share(): Promise<void> {
    if (phase !== "idle" || selectedPeople.length === 0) return;
    phase = "sending";
    const sharedConversationIds: string[] = [];
    const failures: string[] = [];
    let firstError: unknown = null;

    for (const person of selectedPeople) {
      try {
        const conversationId = await resolveConversation(person);
        await collaborationManager.share({
          ownerId: payload.ownerId,
          collectionId: payload.collectionId,
          recipientId: person.id,
          conversationId,
          role,
          note: note.trim(),
        });
        sharedConversationIds.push(conversationId);
      } catch (error) {
        failures.push(person.displayName);
        firstError ??= error;
      }
    }

    if (sharedConversationIds.length === 0) {
      showFailure(
        t("inbox_ui_the_collection_wasn_t_shared_try_again"),
        firstError,
        "shareCollection"
      );
      haptic?.trigger("error");
      phase = "idle";
      return;
    }

    if (failures.length > 0) {
      showFailure(
        failures.length === 1
          ? t("inbox_share_failed_person", { name: failures[0] ?? "" })
          : t("inbox_share_failed_count", { count: failures.length }),
        firstError,
        "shareCollectionPartial"
      );
    }
    haptic?.trigger("success");
    onSent(sharedConversationIds);
  }

  async function changeRole(
    item: CollectionShareAccessItem,
    nextRole: string
  ): Promise<void> {
    if (nextRole !== "viewer" && nextRole !== "editor") return;
    updatingRecipientId = item.grant.recipientId;
    try {
      await collaborationManager.setRole(
        payload.ownerId,
        payload.collectionId,
        item.grant.recipientId,
        nextRole
      );
      haptic?.trigger("selection");
    } catch (error) {
      showFailure(
        t("inbox_ui_that_permission_could_not_be_changed"),
        error,
        "changeCollectionRole"
      );
    } finally {
      updatingRecipientId = null;
    }
  }

  function askToRemove(item: CollectionShareAccessItem): void {
    pendingRemoval = item;
    removeDialogOpen = true;
  }

  async function removeAccess(): Promise<void> {
    const item = pendingRemoval;
    pendingRemoval = null;
    if (!item) return;
    updatingRecipientId = item.grant.recipientId;
    try {
      await collaborationManager.removeAccess(
        payload.ownerId,
        payload.collectionId,
        item.grant.recipientId
      );
      haptic?.trigger("success");
    } catch (error) {
      showFailure(
        t("inbox_ui_access_could_not_be_removed"),
        error,
        "removeCollectionAccess"
      );
    } finally {
      updatingRecipientId = null;
    }
  }
</script>

<div class="share-sheet">
  <section class="collection-summary" aria-label={t("inbox_ui_collection_to_share")}>
    <div
      class="collection-icon"
      style:--collection-color={payload.color ?? "var(--theme-accent)"}
    >
      <i class={payload.icon || "fa-solid fa-folder"} aria-hidden="true"></i>
    </div>
    <div class="collection-copy">
      <span class="eyebrow">{t("inbox_ui_collection")}</span>
      <h3>{payload.name}</h3>
      <p>
        {payload.sequenceCount}
        {payload.sequenceCount === 1 ? "sequence" : "sequences"}
      </p>
    </div>
  </section>

  <section class="add-people" aria-labelledby="add-people-title">
    <div class="section-heading">
      <div>
        <h3 id="add-people-title">{t("inbox_ui_add_people")}</h3>
        <p>{t("inbox_ui_choose_what_they_can_do_then_send_the_collection_in_a_message")}</p>
      </div>
    </div>

    <SegmentedControl
      options={roleOptions}
      value={role}
      onchange={(value) => (role = value)}
      ariaLabel={t("inbox_ui_permission_for_new_people")}
      semantics="radiogroup"
    />

    {#key searchResetKey}
      <UserSearchInput
        onSelect={selectSearchResult}
        placeholder={t("inbox_ui_search_by_username_or_name")}
        inlineResults
        {excludeUserIds}
        disabled={phase === "sending"}
      />
    {/key}

    {#if selectedPeople.length > 0}
      <div class="selected-people" aria-label={t("inbox_ui_selected_people")}>
        {#each selectedPeople as person (person.id)}
          {@const identity = getUserIdentityLabels(person)}
          <button
            class="person-chip"
            type="button"
            onclick={() => togglePerson(person)}
            disabled={phase === "sending"}
            aria-label={t("inbox_remove_person", { name: identity.primary })}
          >
            <RobustAvatar
              src={person.avatar}
              name={identity.primary}
              alt=""
              customSize={28}
            />
            <span>{identity.primary}</span>
            <i class="fa-solid fa-xmark" aria-hidden="true"></i>
          </button>
        {/each}
      </div>
    {/if}

    {#if recentPeople.length > 0}
      <div class="recent-people">
        <span class="field-label">{t("inbox_ui_recent")}</span>
        <div class="recent-list">
          {#each recentPeople as person (person.id)}
            {@const identity = getUserIdentityLabels(person)}
            <button
              type="button"
              class="recent-person"
              onclick={() => togglePerson(person)}
            >
              <RobustAvatar
                src={person.avatar}
                name={identity.primary}
                alt=""
                customSize={36}
              />
              <span>{identity.primary}</span>
              <i class="fa-solid fa-plus" aria-hidden="true"></i>
            </button>
          {/each}
        </div>
      </div>
    {/if}

    <label class="message-field">
      <span>{t("inbox_ui_optional_message")}</span>
      <textarea
        bind:value={note}
        maxlength={MESSAGE_MAX}
        rows="3"
        placeholder={t("inbox_ui_add_a_note")}
        disabled={phase === "sending"}
      ></textarea>
      <small>{note.length}/{MESSAGE_MAX}</small>
    </label>

    <button
      type="button"
      class="share-button"
      onclick={share}
      disabled={selectedPeople.length === 0 || phase === "sending"}
    >
      {#if phase === "sending"}
        <i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i>
        {t("inbox_ui_sharing")}
      {:else}
        <i class="fa-solid fa-paper-plane" aria-hidden="true"></i>
        {shareLabel}
      {/if}
    </button>
  </section>

  <section class="access-section" aria-labelledby="access-title">
    <div class="section-heading">
      <div>
        <h3 id="access-title">{t("inbox_ui_people_with_access")}</h3>
        <p>{t("inbox_ui_you_control_access_to_this_collection")}</p>
      </div>
    </div>

    {#if accessLoading}
      <div class="access-state" role="status">
        <i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i>
        {t("inbox_ui_loading_access")}
      </div>
    {:else if accessError}
      <div class="access-state warning" role="status">
        <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>
        {t("inbox_ui_access_could_not_be_loaded_close_this_sheet_and_try_again")}
      </div>
    {:else if accessItems.length === 0}
      <div class="access-state">{t("inbox_ui_only_you_can_open_this_collection")}</div>
    {:else}
      <div class="access-list">
        {#each accessItems as item (item.grant.recipientId)}
          <div class="access-row">
            <RobustAvatar
              src={item.recipient.avatar}
              name={item.recipient.displayName}
              alt=""
              customSize={40}
            />
            <span class="access-name">{item.recipient.displayName}</span>
            <select
              aria-label={t("inbox_permission_person", { name: item.recipient.displayName })}
              value={item.grant.role}
              disabled={updatingRecipientId === item.grant.recipientId}
              onchange={(event) => changeRole(item, event.currentTarget.value)}
            >
              <option value="viewer">{t("inbox_ui_can_view")}</option>
              <option value="editor">{t("inbox_ui_can_edit")}</option>
            </select>
            <button
              type="button"
              class="remove-button"
              onclick={() => askToRemove(item)}
              disabled={updatingRecipientId === item.grant.recipientId}
              aria-label={t("inbox_remove_access_person", { name: item.recipient.displayName })}
              title={t("inbox_ui_remove_access")}
            >
              <i class="fa-solid fa-user-minus" aria-hidden="true"></i>
            </button>
          </div>
        {/each}
      </div>
    {/if}
  </section>
</div>

<ConfirmDialog
  bind:isOpen={removeDialogOpen}
  title={t("inbox_ui_remove_access")}
  message={pendingRemoval
    ? t("inbox_remove_access_explanation", { name: pendingRemoval.recipient.displayName })
    : t("inbox_ui_this_person_will_no_longer_have_access_to_the_collection")}
  confirmText={t("inbox_ui_remove_access")}
  variant="danger"
  onConfirm={removeAccess}
  onCancel={() => (pendingRemoval = null)}
/>

<style>
  .share-sheet {
    container-type: inline-size;
    display: flex;
    flex-direction: column;
    gap: 20px;
    height: 100%;
    min-height: 0;
    padding: 16px;
    overflow-y: auto;
  }

  .collection-summary,
  .add-people,
  .access-section {
    border: 1px solid var(--theme-stroke);
    border-radius: 16px;
    background: var(--theme-card-bg);
  }

  .collection-summary {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 16px;
  }

  .collection-icon {
    display: grid;
    place-items: center;
    width: 52px;
    height: 52px;
    flex: 0 0 52px;
    border-radius: 14px;
    background: color-mix(in srgb, var(--collection-color) 18%, transparent);
    color: var(--collection-color);
    font-size: 24px;
  }

  .collection-copy,
  .section-heading > div {
    min-width: 0;
  }

  .eyebrow,
  .field-label,
  .message-field > span {
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 12px);
    font-weight: 650;
  }

  h3,
  p {
    margin: 0;
  }

  .collection-copy h3,
  .section-heading h3 {
    color: var(--theme-text);
    font-size: var(--font-size-base, 16px);
    line-height: 1.3;
  }

  .collection-copy p,
  .section-heading p {
    margin-top: 3px;
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 12px);
    line-height: 1.4;
  }

  .add-people,
  .access-section {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 16px;
  }

  .selected-people {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .person-chip {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: var(--min-touch-target, 44px);
    padding: 6px 12px 6px 6px;
    border: 1px solid
      color-mix(in srgb, var(--theme-accent) 45%, var(--theme-stroke));
    border-radius: 999px;
    background: color-mix(
      in srgb,
      var(--theme-accent) 12%,
      var(--theme-card-bg)
    );
    color: var(--theme-text);
    cursor: pointer;
  }

  .recent-people {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .recent-list {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .recent-person {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: var(--min-touch-target, 44px);
    padding: 8px 10px;
    border: 1px solid var(--theme-stroke);
    border-radius: 12px;
    background: transparent;
    color: var(--theme-text);
    cursor: pointer;
    text-align: left;
  }

  .recent-person:hover {
    border-color: var(--theme-accent);
    background: var(--theme-card-hover-bg);
  }

  .recent-person span,
  .access-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--font-size-sm, 14px);
  }

  .recent-person i {
    color: var(--theme-accent);
  }

  .message-field {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 7px;
  }

  textarea {
    width: 100%;
    min-height: 84px;
    resize: vertical;
    padding: 12px;
    border: 1px solid var(--theme-stroke);
    border-radius: 12px;
    background: var(--theme-input-bg, var(--theme-panel-bg));
    color: var(--theme-text);
    font: inherit;
    font-size: var(--font-size-sm, 14px);
  }

  textarea:focus,
  select:focus-visible,
  button:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  .message-field small {
    position: absolute;
    right: 10px;
    bottom: 8px;
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 12px);
  }

  .share-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: var(--min-touch-target, 44px);
    padding: 10px 18px;
    border: 1px solid color-mix(in srgb, var(--theme-accent) 75%, white);
    border-radius: 12px;
    background: var(--theme-accent);
    color: white;
    font-weight: 700;
    cursor: pointer;
  }

  .share-button:disabled,
  button:disabled,
  select:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }

  .access-state {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: 64px;
    color: var(--theme-text-dim);
    font-size: var(--font-size-sm, 14px);
  }

  .access-state.warning {
    color: var(--semantic-warning);
  }

  .access-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .access-row {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto auto;
    align-items: center;
    gap: 10px;
    min-height: 52px;
  }

  select {
    min-height: var(--min-touch-target, 44px);
    padding: 0 34px 0 12px;
    border: 1px solid var(--theme-stroke);
    border-radius: 10px;
    background: var(--theme-panel-bg);
    color: var(--theme-text);
    font-size: var(--font-size-compact, 12px);
  }

  .remove-button {
    display: grid;
    place-items: center;
    width: var(--min-touch-target, 44px);
    height: var(--min-touch-target, 44px);
    border: 1px solid transparent;
    border-radius: 10px;
    background: transparent;
    color: var(--theme-text-dim);
    cursor: pointer;
  }

  .remove-button:hover {
    border-color: color-mix(in srgb, var(--semantic-error) 45%, transparent);
    background: color-mix(in srgb, var(--semantic-error) 12%, transparent);
    color: var(--semantic-error);
  }

  @container (max-width: 360px) {
    .recent-list {
      grid-template-columns: 1fr;
    }

    .access-row {
      grid-template-columns: auto minmax(0, 1fr) auto;
    }

    .access-row select {
      grid-column: 2 / -1;
      width: 100%;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
      transition: none !important;
    }
  }
</style>
