<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte";
  import type { MessageAttachment } from "$lib/shared/messaging/domain/models/message-models";
  import { goto } from "$app/navigation";
  import type { CollectionShareGrant } from "$lib/shared/library/domain/models/collection";
  import { getCollectionCollaborationManager } from "$lib/shared/library/get-collection-collaboration-manager";
  import {
    clearPendingBrowseIntent,
    createCollectionDetailIntent,
    setPendingBrowseIntent,
  } from "$lib/features/browse/state/pending-browse-intent.svelte";
  import { handleModuleChange } from "$lib/shared/navigation-coordinator/navigation-coordinator.svelte";
  import { inboxState } from "../../state/inbox-state.svelte";
  import { getErrorHandler } from "$lib/shared/application/get-error-handler";
  import { resolveCollectionMessageRole } from "../../domain/collection-message-access";

  interface Props {
    attachment: MessageAttachment;
    isOwn?: boolean;
    currentUserId?: string;
    recipientId?: string;
  }

  let {
    attachment,
    isOwn = false,
    currentUserId,
    recipientId,
  }: Props = $props();
  const collaborationManager = getCollectionCollaborationManager();
  const metadata = $derived(attachment.metadata);
  const collectionId = $derived(metadata?.collectionId);
  const ownerId = $derived(metadata?.collectionOwnerId);
  const collectionName = $derived(
    metadata?.collectionName || attachment.name || t("inbox_ui_collection")
  );
  const sequenceCount = $derived(metadata?.collectionSequenceCount ?? 0);
  let liveGrant = $state<CollectionShareGrant | null | undefined>(undefined);
  let isOpening = $state(false);

  $effect(() => {
    const owner = ownerId;
    const collection = collectionId;
    const recipient = recipientId;
    liveGrant = undefined;
    if (!owner || !collection || !recipient) return;

    return collaborationManager.subscribeToGrant(
      owner,
      collection,
      recipient,
      (grant) => {
        liveGrant = grant;
      },
      (error) => {
        console.warn(
          "[CollectionMessageCard] Could not resolve current access:",
          error
        );
      }
    );
  });

  const accessRole = $derived(
    resolveCollectionMessageRole(liveGrant, metadata?.collectionAccessRole)
  );
  const roleLabel = $derived(
    accessRole === null
      ? t("inbox_ui_access_removed")
      : accessRole === "editor"
        ? t("inbox_ui_can_edit")
        : t("inbox_ui_can_view")
  );
  const viewerIsOwner = $derived(Boolean(ownerId && currentUserId === ownerId));
  const hasTarget = $derived(
    Boolean((ownerId && collectionId) || attachment.url)
  );
  const canOpen = $derived(hasTarget && (viewerIsOwner || accessRole !== null));
  const iconClass = $derived.by(() => {
    const icon = metadata?.collectionIcon || "fa-folder";
    return icon.includes("fa-solid") || icon.includes("fas")
      ? icon
      : `fa-solid ${icon}`;
  });

  async function openCollection(): Promise<void> {
    if (!canOpen || isOpening) return;
    isOpening = true;

    try {
      if (ownerId && collectionId) {
        setPendingBrowseIntent(
          createCollectionDetailIntent({
            ownerId,
            collectionId,
            collectionName,
            viewerId: currentUserId,
          })
        );
        await handleModuleChange("browse", "library");
        inboxState.close();
        return;
      }

      if (attachment.url) {
        inboxState.close();
        await goto(attachment.url);
      }
    } catch (caught) {
      clearPendingBrowseIntent();
      const failure =
        caught instanceof Error ? caught : new Error(String(caught));
      console.error(
        "[CollectionMessageCard] Failed to open collection:",
        failure
      );
      getErrorHandler().showUserError({
        message: t("inbox_ui_this_collection_could_not_be_opened"),
        technicalDetails: failure.message,
        error: failure,
        severity: "error",
        context: {
          module: "inbox",
          tab: "messages",
          action: "openCollectionAttachment",
        },
      });
    } finally {
      isOpening = false;
    }
  }
</script>

<button
  type="button"
  class="collection-card"
  class:own={isOwn}
  onclick={openCollection}
  disabled={!canOpen || isOpening}
  aria-label={accessRole === null && !viewerIsOwner
    ? t("inbox_collection_access_removed", { name: collectionName })
    : t("inbox_open_collection", { name: collectionName })}
>
  <span
    class="collection-icon"
    style:--collection-color={metadata?.collectionColor ||
      "var(--theme-accent)"}
  >
    <i class={iconClass} aria-hidden="true"></i>
  </span>
  <span class="collection-info">
    <span class="kicker">{t("inbox_ui_shared_collection")}</span>
    <strong>{collectionName}</strong>
    <span class="details">
      {sequenceCount}
      {sequenceCount === 1 ? "sequence" : "sequences"}
      <span aria-hidden="true">•</span>
      {roleLabel}
    </span>
  </span>
  <span class="open-hint">
    {t("inbox_ui_open")}
    <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
  </span>
</button>

<style>
  .collection-card {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 12px;
    width: min(280px, 100%);
    min-width: 220px;
    padding: 12px;
    border: 1px solid var(--theme-stroke);
    border-radius: 14px;
    background: var(--theme-card-bg);
    color: var(--theme-text);
    cursor: pointer;
    text-align: left;
    transition:
      transform var(--duration-fast) ease,
      border-color var(--duration-fast) ease,
      background var(--duration-fast) ease;
  }

  .collection-card:hover:not(:disabled) {
    transform: translateY(-1px);
    border-color: var(--theme-accent);
    background: var(--theme-card-hover-bg);
  }

  .collection-card:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  .collection-card:disabled {
    cursor: default;
    opacity: 0.7;
  }

  .collection-card.own {
    border-color: rgba(255, 255, 255, 0.24);
    background: rgba(255, 255, 255, 0.1);
    color: white;
  }

  .collection-icon {
    display: grid;
    place-items: center;
    width: 48px;
    height: 48px;
    border-radius: 13px;
    background: color-mix(in srgb, var(--collection-color) 20%, transparent);
    color: var(--collection-color);
    font-size: 22px;
  }

  .collection-info {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .kicker,
  .details {
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 12px);
  }

  .own .kicker,
  .own .details {
    color: rgba(255, 255, 255, 0.76);
  }

  strong {
    margin-top: 2px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--font-size-sm, 14px);
  }

  .details {
    display: flex;
    gap: 6px;
    margin-top: 3px;
  }

  .open-hint {
    grid-column: 1 / -1;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 7px;
    min-height: 28px;
    padding-top: 8px;
    border-top: 1px solid var(--theme-stroke);
    color: var(--theme-accent);
    font-size: var(--font-size-compact, 12px);
    font-weight: 700;
  }

  .own .open-hint {
    color: white;
  }

  @media (prefers-reduced-motion: reduce) {
    .collection-card {
      transition: none;
    }
  }
</style>
