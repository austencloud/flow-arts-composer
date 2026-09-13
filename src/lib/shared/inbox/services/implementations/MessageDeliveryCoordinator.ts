import type {
  IMessageImageSender,
  MessageImageSendHandle,
} from "$lib/shared/messaging/services/contracts/IMessageImageSender";
import type { MessageAttachment } from "$lib/shared/messaging/domain/models/message-models";
import type { Messenger } from "$lib/shared/messaging/services/messenger";
import type { ShortCodeManager } from "$lib/shared/qr/services/short-code-manager";
import { buildSequenceMessageAttachment } from "../../domain/message-attachment-builders";
import { createDeliveryCancelledError } from "../../domain/message-delivery-errors";
import { restoreMessageAttachment } from "../../domain/message-delivery-models";
import type { MessageOutboxRecord } from "../../domain/message-delivery-models";
import type {
  IMessageDeliveryCoordinator,
  MessageDeliveryHooks,
} from "../contracts/IMessageDeliveryCoordinator";

export class MessageDeliveryCoordinator implements IMessageDeliveryCoordinator {
  constructor(
    private readonly messenger: Messenger,
    private readonly imageSender: IMessageImageSender,
    private readonly shortCodeManager: ShortCodeManager
  ) {}

  /**
   * Stop before the network when the delivery's account has changed under it.
   * Every await in here is a place that can happen, and the seam below sends as
   * whoever is signed in at dispatch time.
   */
  private assertStillOwned(hooks: MessageDeliveryHooks, stage: string): void {
    if (hooks.isOwned?.() === false) {
      throw createDeliveryCancelledError(
        `Delivery abandoned before ${stage}: the signed-in account changed.`
      );
    }
  }

  async deliver(
    item: MessageOutboxRecord,
    hooks: MessageDeliveryHooks = {}
  ): Promise<void> {
    const attachment = item.attachment
      ? restoreMessageAttachment(item.attachment)
      : undefined;

    if (attachment?.type === "image") {
      this.assertStillOwned(hooks, "an image upload");
      // Held in a box so the progress callback can reach the handle it is about
      // to be given: the upload is the only place cancelling can be requested.
      const upload: { handle?: MessageImageSendHandle } = {};
      upload.handle = this.imageSender.send({
        conversationId: item.conversationId,
        messageId: item.id,
        attachmentId: attachment.attachmentId,
        file: attachment.file,
        content: item.content,
        replyTo: item.replyTo,
        onProgress: (progress) => {
          // The upload is the only window where stopping is still honest: the
          // image sender checks its own cancelled flag again before the
          // finalize call that commits the message. Once finalize is away,
          // cancel() is a no-op and this delivery is committed — see the image
          // path assessment in the audit report.
          if (hooks.isOwned?.() === false) upload.handle?.cancel();
          hooks.onProgress?.({
            label:
              progress.phase === "finalizing"
                ? "Preparing image"
                : `Uploading ${Math.round(progress.fraction * 100)}%`,
            fraction: progress.fraction,
          });
        },
      });
      try {
        await upload.handle.promise;
      } catch (error) {
        // A cancelled upload is an abandoned delivery, not a failed one: the
        // row goes back to its own account's queue untouched.
        if (hooks.isOwned?.() === false) {
          throw createDeliveryCancelledError(
            "Image delivery abandoned: the signed-in account changed."
          );
        }
        throw error;
      }
      return;
    }

    let preparedAttachments = item.preparedAttachments;
    if (attachment?.type === "sequence" && !preparedAttachments?.length) {
      hooks.onProgress?.({ label: "Preparing sequence" });
      const { code } = await this.shortCodeManager.createShortCode(
        attachment.payload.sequence,
        { embedSequenceData: true }
      );
      preparedAttachments = [
        buildSequenceMessageAttachment(attachment.payload.sequence, code),
      ];
      await hooks.onPrepared?.(preparedAttachments);
    }

    if (attachment?.type === "collection" && !preparedAttachments?.length) {
      const payload = attachment.payload;
      const metadata: NonNullable<MessageAttachment["metadata"]> = {
        collectionId: payload.collectionId,
        collectionOwnerId: payload.ownerId,
        collectionName: payload.name,
        collectionSequenceCount: payload.sequenceCount,
      };
      if (payload.icon) metadata.collectionIcon = payload.icon;
      if (payload.color) metadata.collectionColor = payload.color;

      const collectionAttachment: MessageAttachment = {
        type: "collection",
        name: payload.name,
        metadata,
      };
      if (payload.coverImageUrl) {
        collectionAttachment.thumbnailUrl = payload.coverImageUrl;
      }
      preparedAttachments = [collectionAttachment];
      await hooks.onPrepared?.(preparedAttachments);
    }

    // The last boundary before the network, and the one that matters most:
    // every await above — minting the short code, persisting the prepared
    // attachment — can outlive the account this row belongs to. Deliberately
    // placed AFTER onPrepared rather than between the two, so a share code that
    // was already minted is still persisted against its own account's row
    // instead of being thrown away and minted again.
    this.assertStillOwned(hooks, "sending");

    hooks.onProgress?.({ label: "Sending" });
    await this.messenger.sendMessage({
      messageId: item.id,
      conversationId: item.conversationId,
      content: item.content,
      attachments: preparedAttachments,
      replyTo: item.replyTo,
    });
  }
}
