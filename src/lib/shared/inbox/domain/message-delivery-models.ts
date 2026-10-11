import type {
  MessageAttachment,
  ReplyPreview,
} from "#lib/shared/messaging/domain/models/message-models.js";
import type {
  CollectionSharePayload,
  PendingMessageAttachment,
} from "./pending-message-attachment";
import type { SequenceSharePayload } from "./models/sequence-share-payload";

export type MessageDeliveryStatus = "queued" | "sending" | "failed" | "sent";

export type PersistedMessageAttachment =
  | {
      type: "image";
      blob: Blob;
      fileName: string;
      mimeType: string;
      lastModified: number;
      messageId: string;
      attachmentId: string;
    }
  | {
      type: "sequence";
      payload: SequenceSharePayload;
    }
  | {
      type: "collection";
      payload: CollectionSharePayload;
    };

export interface MessageDraftRecord {
  id: string;
  userId: string;
  conversationId: string;
  content: string;
  replyTo?: ReplyPreview;
  attachment?: PersistedMessageAttachment;
  updatedAt: number;
}

export interface MessageDeliveryProgress {
  label: string;
  fraction?: number;
}

export interface MessageOutboxRecord {
  id: string;
  userId: string;
  conversationId: string;
  content: string;
  replyTo?: ReplyPreview;
  attachment?: PersistedMessageAttachment;
  preparedAttachments?: MessageAttachment[];
  createdAt: number;
  updatedAt: number;
  status: MessageDeliveryStatus;
  attemptCount: number;
  nextAttemptAt?: number;
  lastError?: string;
  /** Runtime-only upload detail. The repository deliberately does not need it. */
  progress?: MessageDeliveryProgress;
}

export interface QueueMessageInput {
  userId: string;
  conversationId: string;
  content: string;
  replyTo?: ReplyPreview;
  attachment?: PendingMessageAttachment;
  /**
   * A server-ready attachment already prepared by a shared-send flow. Keeping
   * it beside the local attachment preserves optimistic rendering without
   * minting another short code during delivery.
   */
  preparedAttachments?: MessageAttachment[];
}

export function getMessageDraftId(
  userId: string,
  conversationId: string
): string {
  return `${userId}:${conversationId}`;
}

export function persistMessageAttachment(
  attachment: PendingMessageAttachment
): PersistedMessageAttachment {
  if (attachment.type === "image") {
    return {
      type: "image",
      blob: attachment.file,
      fileName: attachment.file.name,
      mimeType: attachment.file.type,
      lastModified: attachment.file.lastModified,
      messageId: attachment.messageId,
      attachmentId: attachment.attachmentId,
    };
  }

  return attachment;
}

export function restoreMessageAttachment(
  attachment: PersistedMessageAttachment
): PendingMessageAttachment {
  if (attachment.type === "image") {
    return {
      type: "image",
      file: new File([attachment.blob], attachment.fileName, {
        type: attachment.mimeType,
        lastModified: attachment.lastModified,
      }),
      messageId: attachment.messageId,
      attachmentId: attachment.attachmentId,
    };
  }

  return attachment;
}
