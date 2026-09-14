import type { SequenceSharePayload } from "../domain/models/sequence-share-payload";
import type { PendingMessageAttachment } from "../domain/pending-message-attachment";
import { authState } from "$lib/shared/auth/state/auth-state.svelte";
import { authDrawerState } from "$lib/shared/auth/state/auth-drawer-state.svelte";
import { inboxState } from "./inbox-state.svelte";
import type { LibraryCollection } from "$lib/shared/library/domain/models/collection";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { buildSequenceSharePayload } from "../domain/build-sequence-share-payload";
export { buildSequenceSharePayload };

export function openSendSequenceSheet(p: SequenceSharePayload): void {
  if (!authState.isFullAccount) {
    authDrawerState.show("signup", "share-sequence");
    return;
  }
  inboxState.openSequenceShare(p);
}

/**
 * Opens the send sheet at once and drops a freshly drawn Choreo Card into its
 * preview when the render lands. This is the same card the Create module's
 * Send hands the sheet. Callers without a prepared card used to guess a
 * gallery thumbnail URL from word + prop instead; that skipped the renderer
 * revision in the real cloud keys and served pre-font cards.
 */
export function openSendSequenceSheetWithCard(
  sequence: SequenceData,
  renderCard: (sequence: SequenceData) => Promise<Blob>
): void {
  if (!authState.isFullAccount) {
    authDrawerState.show("signup", "share-sequence");
    return;
  }
  const payload = buildSequenceSharePayload(sequence);
  inboxState.openSequenceShare(payload);
  void renderCard(sequence)
    .then((blob) => attachSequencePreview(payload, blob))
    .catch(() => undefined);
}

/** The card arrives after the sheet opened; attach it only if that share is still up. */
export function attachSequencePreview(
  payload: SequenceSharePayload,
  blob: Blob
): void {
  const current = inboxState.shareAttachment;
  if (
    current?.type !== "sequence" ||
    current.payload.sequenceId !== payload.sequenceId
  ) {
    return;
  }
  inboxState.shareAttachment = {
    type: "sequence",
    payload: { ...current.payload, sequencePreviewBlob: blob },
  };
}

/**
 * The share-intake entry point, called by intake-router.ts (Task 10).
 * openSendSequenceSheet stays as the sequence-shaped convenience its four
 * existing call sites already use.
 *
 * The router goes through this function rather than poking `inboxState`
 * directly so both share paths - in-app and share-sheet - enter the picker the
 * same way. An earlier revision added this function and then never called it
 * from anywhere, which is a dead export, not an entry point.
 */
export function openSendAttachmentSheet(
  attachment: PendingMessageAttachment,
  options: { note?: string; receiptId?: string; conversationId?: string } = {}
): void {
  inboxState.openAttachmentShare(attachment, options);
}

type ShareableCollection = Pick<
  LibraryCollection,
  | "id"
  | "ownerId"
  | "name"
  | "sequenceCount"
  | "coverImageUrl"
  | "color"
  | "icon"
> &
  Partial<Pick<LibraryCollection, "systemType" | "kind">>;

export function openShareCollectionSheet(
  collection: ShareableCollection
): void {
  if (!authState.isFullAccount) {
    authDrawerState.show("signup", "share-collection");
    return;
  }
  if (collection.systemType || collection.kind === "smart") return;

  inboxState.openAttachmentShare({
    type: "collection",
    payload: {
      collectionId: collection.id,
      ownerId: collection.ownerId,
      name: collection.name,
      sequenceCount: collection.sequenceCount,
      coverImageUrl: collection.coverImageUrl,
      color: collection.color,
      icon: collection.icon,
    },
  });
}
