import type { Message } from "$lib/shared/messaging/domain/models/message-models";
import type {
  MessageOutboxRecord,
  PersistedMessageAttachment,
} from "./message-delivery-models";

interface SenderIdentity {
  id: string;
  name: string;
  avatar?: string;
}

function buildLocalAttachments(
  attachment: PersistedMessageAttachment | undefined,
  prepared: MessageOutboxRecord["preparedAttachments"]
): Message["attachments"] {
  if (prepared?.length) return prepared;
  if (!attachment) return undefined;

  if (attachment.type === "image") {
    return [
      {
        id: attachment.attachmentId,
        type: "image",
        name: attachment.fileName,
        contentType: attachment.mimeType,
        byteSize: attachment.blob.size,
      },
    ];
  }

  if (attachment.type === "sequence") {
    const payload = attachment.payload;
    return [
      {
        type: "sequence",
        name: payload.sequenceWord,
        thumbnailUrl: payload.sequenceThumbnail,
        metadata: {
          sequenceId: payload.sequenceId,
          sequenceWord: payload.sequenceWord,
          sequenceCloudWord: payload.sequenceCloudWord,
          sequenceName: payload.sequenceName,
          sequenceThumbnail: payload.sequenceThumbnail,
          sequenceAuthor: payload.sequenceAuthor,
          sequenceStepCount: payload.sequenceStepCount,
          sequenceViewParams: payload.sequenceViewParams,
        },
      },
    ];
  }

  const payload = attachment.payload;
  return [
    {
      type: "collection",
      name: payload.name,
      thumbnailUrl: payload.coverImageUrl,
      metadata: {
        collectionId: payload.collectionId,
        collectionOwnerId: payload.ownerId,
        collectionName: payload.name,
        collectionIcon: payload.icon,
        collectionColor: payload.color,
        collectionSequenceCount: payload.sequenceCount,
      },
    },
  ];
}

export function buildOutgoingMessage(
  item: MessageOutboxRecord,
  sender: SenderIdentity
): Message {
  return {
    id: item.id,
    conversationId: item.conversationId,
    senderId: sender.id,
    senderName: sender.name,
    senderAvatar: sender.avatar,
    content: item.content,
    createdAt: new Date(item.createdAt),
    readBy: [sender.id],
    attachments: buildLocalAttachments(
      item.attachment,
      item.preparedAttachments
    ),
    replyTo: item.replyTo,
  };
}
