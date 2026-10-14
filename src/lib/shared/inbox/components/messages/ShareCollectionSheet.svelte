<!--
ShareCollectionSheet.svelte — share a collection you own.

One screen at a time, like the sequence share sheet and the settings drill:
a landing with the collection and three choices (a public link, sending it to
people on Flow Arts Composer, who already has access), and each choice opens
as a full-height screen with a Back arrow. The drawer gives this sheet a
bounded box on every device (a full-height rail on desktop, a full-screen
sheet on phones), so every screen is sized to that box instead of stacking
three cards into one long scroll. On the landing the collection cover grows
to fill whatever is left above the choices; on the detail screens the list or
the QR code takes the room.

Motion: `Crossfade mode="swap" motion="step"` with `fill`, the canonical
sequential-screen transition (crossfade-primitive.md), direction +1 going in
and -1 coming back. Escape on a detail screen goes back before the drawer's
own Escape (which closes the sheet) gets a turn.
-->
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
  import { conversationService } from "#lib/shared/messaging/services/conversation-manager.js";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import SettingsDrillRow from "#lib/shared/ui/components/settings-drill/SettingsDrillRow.svelte";
  import UserSearchInput from "#lib/shared/user-search/UserSearchInput.svelte";
  import { onMount } from "svelte";
  import type { PendingMessageAttachment } from "../../domain/pending-message-attachment";
  import { inboxState } from "../../state/inbox-state.svelte";
  import { getUserIdentityLabels } from "#lib/shared/community/domain/user-identity-labels.js";
  import { collectionsState } from "#lib/features/library/state/collections-state.svelte.js";
  import { communityCollectionsState } from "#lib/features/browse/collections/state/community-collections-state.svelte.js";
  import { buildPublicCollectionUrl } from "#lib/shared/browse/navigation/browse-route-resolver.js";
  import { getUrlQRCodeGenerator } from "#lib/shared/qr/get-qr-code-generator.js";
  import { shareOrCopyLink } from "#lib/shared/share/services/link-share.js";
  import { toast } from "#lib/shared/toast/state/toast-state.svelte.js";
  import { Crossfade } from "#lib/shared/transitions/motion.js";
  import { DURATION } from "#lib/shared/transitions/transitions.js";

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

  type ShareRoute = "home" | "link" | "people" | "access";

  const MESSAGE_MAX = 500;
  const MAX_RECENT_PEOPLE = 8;
  // Words, not icons: an eye and a pencil on their own read as a mystery
  // toggle. SegmentedControl shows one or the other, so the icons go.
  const roleOptions = $derived([
    { value: "viewer" as const, label: t("inbox_ui_can_view") },
    { value: "editor" as const, label: t("inbox_ui_can_edit") },
  ]);

  let { attachment, initialNote = "", onSent }: Props = $props();
  const payload = $derived(attachment.payload);
  const collaborationManager = getCollectionCollaborationManager();
  const haptic = getHapticFeedback();

  // Which screen is up, and which way the next one slides in: +1 drilling
  // into a choice, -1 coming back to the landing.
  let route = $state<ShareRoute>("home");
  let direction = $state<1 | -1>(1);

  function go(next: ShareRoute): void {
    direction = next === "home" ? -1 : 1;
    route = next;
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key !== "Escape" || route === "home") return;
    // Back, not close: the drawer's window listener would close the whole
    // sheet, so the event stops here while a detail screen is up.
    event.preventDefault();
    event.stopPropagation();
    go("home");
  }

  // The sheet opens for collections you own, so the live copy of the
  // collection is in your library state. That copy knows whether it is
  // public, which the attachment payload does not carry.
  const ownCollection = $derived(
    collectionsState.collections.find(
      (collection) => collection.id === payload.collectionId
    )
  );
  const isPublic = $derived(ownCollection?.isPublic ?? false);
  const canPublish = $derived(
    !!ownCollection &&
      !ownCollection.systemType &&
      ownCollection.kind !== "smart"
  );
  const publicUrl = $derived(
    buildPublicCollectionUrl(payload.ownerId, payload.collectionId)
  );
  let linkCopied = $state(false);
  let copiedTimer: ReturnType<typeof setTimeout> | null = null;
  let publishing = $state(false);

  // The link screen also shows the address as a QR code, so a person standing
  // next to you can open it on their phone. Made once, the first time the
  // screen is up for a public collection; the box it lands in is reserved.
  let qrSrc = $state<string | null>(null);
  let qrFailed = $state(false);
  let qrRequested = false;
  $effect(() => {
    if (route !== "link" || !isPublic || qrRequested) return;
    qrRequested = true;
    const url = publicUrl;
    getUrlQRCodeGenerator()
      .generateUrlAsImage(url, 512)
      .then((image) => {
        qrSrc = image.src;
      })
      .catch(() => {
        qrFailed = true;
      });
  });

  /**
   * Hand the address on, on the press itself: the phone's own share sheet
   * where there is one, the clipboard everywhere else. Both need the gesture,
   * so nothing awaits before the call.
   */
  async function copyLink(): Promise<void> {
    const outcome = await shareOrCopyLink({
      url: publicUrl,
      title: payload.name,
    });
    if (outcome === "copied") {
      haptic?.trigger("success");
      toast.success(t("share_link_copied"));
      linkCopied = true;
      if (copiedTimer) clearTimeout(copiedTimer);
      copiedTimer = setTimeout(() => (linkCopied = false), 2000);
    } else if (outcome === "failed") {
      toast.error(t("share_copy_link_failed"));
    }
  }

  async function makePublic(): Promise<void> {
    if (publishing || !canPublish) return;
    publishing = true;
    try {
      const ok = await collectionsState.setPublic(payload.collectionId, true);
      // Same follow-up as the card menu: the Community feed re-normalizes
      // its public-member counts after a visibility change.
      if (ok) communityCollectionsState.invalidate();
    } finally {
      publishing = false;
    }
  }

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

  // One line under each landing row: the current state of that choice.
  const linkRowValue = $derived(
    isPublic
      ? t("inbox_share_link_row_public")
      : t("inbox_share_link_row_private")
  );
  const accessRowValue = $derived(
    accessLoading
      ? t("inbox_ui_loading_access")
      : accessError
        ? t("inbox_ui_people_with_access_could_not_be_loaded")
        : accessItems.length === 0
          ? t("inbox_share_access_only_you")
          : accessItems.length === 1
            ? t("inbox_share_access_one_person")
            : t("inbox_share_access_people", { count: accessItems.length })
  );
  const sequenceCountLabel = $derived(
    payload.sequenceCount === 1
      ? t("inbox_share_one_sequence")
      : t("inbox_share_sequences", { count: payload.sequenceCount })
  );

  onMount(() => {
    // No-op when the library is already live; the publish flag comes from it.
    collectionsState.ensureStarted();
    return () => {
      if (copiedTimer) clearTimeout(copiedTimer);
    };
  });

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

{#snippet screenHeader(title: string)}
  <div class="screen-header">
    <button
      type="button"
      class="back-button"
      onclick={() => go("home")}
      aria-label={t("inbox_share_back")}
    >
      <i class="fa-solid fa-arrow-left" aria-hidden="true"></i>
    </button>
    <h3>{title}</h3>
  </div>
{/snippet}

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="share-sheet" onkeydown={handleKeydown}>
  <Crossfade
    key={route}
    duration={DURATION.normal}
    mode="swap"
    motion="step"
    {direction}
    fill
  >
    {#if route === "home"}
      <div class="screen home">
        <!-- The cover takes whatever height the choices leave over, so the
             landing fills its box on a tall rail and stays one screen on a
             phone. -->
        <section
          class="hero"
          class:has-cover={!!payload.coverImageUrl}
          style:--collection-color={payload.color ?? "var(--theme-accent)"}
          aria-label={t("inbox_ui_collection_to_share")}
        >
          {#if payload.coverImageUrl}
            <img class="hero-cover" src={payload.coverImageUrl} alt="" />
          {/if}
          <div class="hero-copy">
            {#if !payload.coverImageUrl}
              <span class="hero-icon">
                <i
                  class={payload.icon || "fa-solid fa-folder"}
                  aria-hidden="true"
                ></i>
              </span>
            {/if}
            <span class="hero-text">
              <span class="eyebrow">{t("inbox_ui_collection")}</span>
              <h3>{payload.name}</h3>
              <p>{sequenceCountLabel}</p>
            </span>
          </div>
        </section>

        <div class="drill-list">
          <SettingsDrillRow
            label={t("inbox_share_link_title")}
            value={linkRowValue}
            disabled={!isPublic && !canPublish}
            disabledReason={t("inbox_share_link_row_locked")}
            onclick={() => go("link")}
          />
          <SettingsDrillRow
            label={t("inbox_ui_add_people")}
            value={t("inbox_share_people_row")}
            onclick={() => go("people")}
          />
          <SettingsDrillRow
            label={t("inbox_ui_people_with_access")}
            value={accessRowValue}
            onclick={() => go("access")}
          />
        </div>
      </div>
    {:else if route === "link"}
      <div class="screen">
        {@render screenHeader(t("inbox_share_link_title"))}
        <div class="screen-body">
          <!-- Public ↔ private is a structural swap the person asked for
               (Make public), so it crossfades through the shared owner. -->
          <Crossfade
            key={isPublic ? "link" : "locked"}
            duration={DURATION.normal}
            fill
          >
            {#if isPublic}
              <div class="link-screen">
                <p class="lede">{t("inbox_share_link_public")}</p>
                <span class="link-text" title={publicUrl}>{publicUrl}</span>
                <button
                  type="button"
                  class="share-button"
                  onclick={copyLink}
                  aria-label={linkCopied
                    ? t("share_link_copied")
                    : t("share_copy_link")}
                >
                  <i
                    class={linkCopied
                      ? "fa-solid fa-check"
                      : "fa-solid fa-link"}
                    aria-hidden="true"
                  ></i>
                  <!-- Both labels sit in one cell so the button keeps its
                       width when the words swap. -->
                  <span class="link-label">
                    <span class="ghost" aria-hidden="true"
                      >{t("share_copy_link")}</span
                    >
                    <span class="ghost" aria-hidden="true"
                      >{t("share_link_copied")}</span
                    >
                    <span class="live">
                      {linkCopied
                        ? t("share_link_copied")
                        : t("share_copy_link")}
                    </span>
                  </span>
                </button>
                <div class="qr-panel">
                  <!-- A square is reserved before the code arrives, so the
                       caption never moves. -->
                  <div class="qr-tile">
                    {#if qrSrc}
                      <img src={qrSrc} alt={t("inbox_share_qr_alt")} />
                    {:else if !qrFailed}
                      <i class="fa-solid fa-spinner fa-spin" aria-hidden="true"
                      ></i>
                    {/if}
                  </div>
                  <p class="qr-caption">
                    {qrFailed
                      ? t("inbox_share_qr_failed")
                      : t("inbox_share_qr_hint")}
                  </p>
                </div>
              </div>
            {:else}
              <div class="link-screen">
                <p class="lede">{t("inbox_share_link_private")}</p>
                <button
                  type="button"
                  class="share-button"
                  onclick={makePublic}
                  disabled={publishing || !canPublish}
                >
                  {#if publishing}
                    <i class="fa-solid fa-spinner fa-spin" aria-hidden="true"
                    ></i>
                    {t("inbox_share_making_public")}
                  {:else}
                    <i class="fa-solid fa-globe" aria-hidden="true"></i>
                    {t("inbox_share_make_public")}
                  {/if}
                </button>
              </div>
            {/if}
          </Crossfade>
        </div>
      </div>
    {:else if route === "people"}
      <div class="screen">
        {@render screenHeader(t("inbox_ui_add_people"))}
        <div class="screen-body">
          <p class="lede">
            {t(
              "inbox_ui_choose_what_they_can_do_then_send_the_collection_in_a_message"
            )}
          </p>

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
            <div
              class="selected-people"
              aria-label={t("inbox_ui_selected_people")}
            >
              {#each selectedPeople as person (person.id)}
                {@const identity = getUserIdentityLabels(person)}
                <button
                  class="person-chip"
                  type="button"
                  onclick={() => togglePerson(person)}
                  disabled={phase === "sending"}
                  aria-label={t("inbox_remove_person", {
                    name: identity.primary,
                  })}
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
        </div>

        <!-- The note and Send stay put at the bottom while the people list
             above scrolls, the way a message composer does. -->
        <div class="screen-footer">
          <label class="message-field">
            <span>{t("inbox_ui_optional_message")}</span>
            <textarea
              bind:value={note}
              maxlength={MESSAGE_MAX}
              rows="2"
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
        </div>
      </div>
    {:else}
      <div class="screen">
        {@render screenHeader(t("inbox_ui_people_with_access"))}
        <div class="screen-body">
          <p class="lede">
            {t("inbox_ui_you_control_access_to_this_collection")}
          </p>

          {#if accessLoading}
            <div class="access-state" role="status">
              <i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i>
              {t("inbox_ui_loading_access")}
            </div>
          {:else if accessError}
            <div class="access-state warning" role="status">
              <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"
              ></i>
              {t(
                "inbox_ui_access_could_not_be_loaded_close_this_sheet_and_try_again"
              )}
            </div>
          {:else if accessItems.length === 0}
            <div class="access-state">
              {t("inbox_ui_only_you_can_open_this_collection")}
            </div>
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
                    aria-label={t("inbox_permission_person", {
                      name: item.recipient.displayName,
                    })}
                    value={item.grant.role}
                    disabled={updatingRecipientId === item.grant.recipientId}
                    onchange={(event) =>
                      changeRole(item, event.currentTarget.value)}
                  >
                    <option value="viewer">{t("inbox_ui_can_view")}</option>
                    <option value="editor">{t("inbox_ui_can_edit")}</option>
                  </select>
                  <button
                    type="button"
                    class="remove-button"
                    onclick={() => askToRemove(item)}
                    disabled={updatingRecipientId === item.grant.recipientId}
                    aria-label={t("inbox_remove_access_person", {
                      name: item.recipient.displayName,
                    })}
                    title={t("inbox_ui_remove_access")}
                  >
                    <i class="fa-solid fa-user-minus" aria-hidden="true"></i>
                  </button>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      </div>
    {/if}
  </Crossfade>
</div>

<ConfirmDialog
  bind:isOpen={removeDialogOpen}
  title={t("inbox_ui_remove_access")}
  message={pendingRemoval
    ? t("inbox_remove_access_explanation", {
        name: pendingRemoval.recipient.displayName,
      })
    : t("inbox_ui_this_person_will_no_longer_have_access_to_the_collection")}
  confirmText={t("inbox_ui_remove_access")}
  variant="danger"
  onConfirm={removeAccess}
  onCancel={() => (pendingRemoval = null)}
/>

<style>
  /* The drawer gives this box a definite height on every device; the sheet
     names it as a size container so the landing can recompose when short. */
  .share-sheet {
    container: share-sheet / size;
    height: 100%;
    min-height: 0;
    padding: 16px;
    /* Clips the step drift while one screen slides out and the next in. */
    overflow: hidden;
  }

  .screen {
    display: flex;
    flex-direction: column;
    gap: 14px;
    height: 100%;
    min-height: 0;
  }

  /* ----- Landing ----- */

  .home {
    gap: 16px;
  }

  .hero {
    position: relative;
    flex: 1 1 auto;
    min-height: 7.5rem;
    display: grid;
    place-items: center;
    padding: 16px;
    border: 1px solid var(--theme-stroke);
    border-radius: 16px;
    background: linear-gradient(
      160deg,
      color-mix(in srgb, var(--collection-color) 26%, var(--theme-card-bg)),
      color-mix(in srgb, var(--collection-color) 6%, var(--theme-card-bg))
    );
    overflow: hidden;
    text-align: center;
  }

  .hero-cover {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .hero-copy {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    min-width: 0;
    max-width: 100%;
  }

  /* Over a cover the words sit at the bottom edge on a scrim that fades up
     into the picture, so the picture stays the point. */
  .hero.has-cover {
    place-items: end start;
    padding: 0;
    text-align: left;
  }

  .hero.has-cover .hero-copy {
    width: 100%;
    align-items: flex-start;
    padding: 40px 16px 16px;
    background: linear-gradient(
      to top,
      rgba(0, 0, 0, 0.72),
      rgba(0, 0, 0, 0.35) 55%,
      transparent
    );
  }

  .hero-icon {
    display: grid;
    place-items: center;
    width: 4.5rem;
    height: 4.5rem;
    border-radius: 20px;
    background: color-mix(in srgb, var(--collection-color) 22%, transparent);
    color: var(--collection-color);
    font-size: 2rem;
  }

  .hero-text {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }

  .hero-text h3 {
    font-size: var(--font-size-lg, 20px);
    line-height: 1.25;
    overflow-wrap: anywhere;
  }

  .hero.has-cover .hero-text h3,
  .hero.has-cover .hero-text p,
  .hero.has-cover .eyebrow {
    color: white;
  }

  .hero.has-cover .hero-text p,
  .hero.has-cover .eyebrow {
    opacity: 0.85;
  }

  /* A short box (a landscape phone, a small laptop window) has no room for
     a tall centred cover: icon and words go side by side instead. */
  @container share-sheet (max-height: 480px) {
    .hero {
      min-height: 5.5rem;
      text-align: left;
    }

    .hero-copy {
      flex-direction: row;
      align-items: center;
      gap: 14px;
    }

    .hero-icon {
      width: 3.25rem;
      height: 3.25rem;
      border-radius: 14px;
      font-size: 1.5rem;
    }

    .hero-text h3 {
      font-size: var(--font-size-base, 16px);
    }
  }

  .drill-list {
    flex: 0 0 auto;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  /* ----- Detail screens ----- */

  .screen-header {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  .screen-header h3 {
    flex: 1;
    min-width: 0;
    font-size: var(--font-size-base, 16px);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .back-button {
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    width: var(--min-touch-target, 44px);
    height: var(--min-touch-target, 44px);
    border: 1px solid var(--theme-stroke);
    border-radius: 12px;
    background: var(--theme-card-bg);
    color: var(--theme-text);
    font-size: var(--font-size-base, 16px);
    cursor: pointer;
  }

  .back-button:hover {
    border-color: var(--theme-stroke-strong, var(--theme-stroke));
    background: var(--theme-card-hover-bg);
  }

  .screen-body {
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    gap: 14px;
    min-height: 0;
    overflow-y: auto;
    /* Focus rings on the outermost controls would otherwise be clipped. */
    padding: 2px;
    margin: -2px;
  }

  .screen-footer {
    flex: 0 0 auto;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding-top: 12px;
    border-top: 1px solid var(--theme-stroke);
  }

  .lede {
    color: var(--theme-text-dim);
    font-size: var(--font-size-sm, 14px);
    line-height: 1.45;
  }

  /* ----- Link ----- */

  .link-screen {
    display: flex;
    flex-direction: column;
    gap: 12px;
    height: 100%;
    min-height: 0;
  }

  .link-text {
    /* A block, not a flex box: text-overflow only draws its ellipsis on a
       block container, and the line-height centres the single line. */
    display: block;
    min-width: 0;
    line-height: var(--min-touch-target, 44px);
    padding: 0 12px;
    border: 1px solid var(--theme-stroke);
    border-radius: 12px;
    background: var(--theme-input-bg, var(--theme-panel-bg));
    color: var(--theme-text);
    font-size: var(--font-size-sm, 14px);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    /* Reads as a URL field people may select, not a button. */
    user-select: all;
  }

  .link-label {
    display: grid;
  }

  .link-label > span {
    grid-area: 1 / 1;
    white-space: nowrap;
  }

  .link-label .ghost {
    visibility: hidden;
  }

  /* The code takes the room left under the button: a square no wider than
     the panel and no taller than what remains above its caption. */
  .qr-panel {
    container: qr-panel / size;
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    min-height: 9rem;
  }

  .qr-tile {
    display: grid;
    place-items: center;
    width: min(100cqw, calc(100cqh - 2.5rem), 22rem);
    aspect-ratio: 1;
    border: 1px solid var(--theme-stroke);
    border-radius: 16px;
    background: var(--theme-card-bg);
    color: var(--theme-text-dim);
    font-size: 1.25rem;
    overflow: hidden;
  }

  .qr-tile img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
    padding: 8%;
  }

  .qr-caption {
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 12px);
    text-align: center;
  }

  /* ----- Shared bits ----- */

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

  .hero-text h3,
  .screen-header h3 {
    color: var(--theme-text);
    font-weight: 700;
  }

  .hero-text p {
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 12px);
    line-height: 1.4;
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
    min-height: 64px;
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

  @container share-sheet (max-width: 360px) {
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
