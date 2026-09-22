/**
 * Message domain models for the peer-to-peer messaging system
 */

/**
 * Attachment types that can be included in messages
 */
export type MessageAttachmentType =
  | "image"
  | "sequence"
  | "collection"
  | "link"
  | "feedback";

/**
 * Feedback-specific metadata for message attachments
 */
export interface FeedbackAttachmentMetadata {
  feedbackId: string;
  feedbackTitle: string;
  feedbackType: "bug" | "feature" | "general";
  feedbackStatus: string;
  feedbackDescription?: string;
}

/**
 * An attachment on a message (images, sequence links, feedback, etc.)
 */
export interface MessageAttachment {
  /** Stable attachment ID for storage-backed attachments. */
  id?: string;
  type: MessageAttachmentType;
  /** Internal app route for navigable attachments. */
  url?: string;
  thumbnailUrl?: string;
  /** Display name for the attachment (e.g., filename, sequence word) */
  name?: string;
  /** Private Firebase Storage object path. Never a public download URL. */
  storagePath?: string;
  contentType?: string;
  byteSize?: number;
  width?: number;
  height?: number;
  metadata?: {
    title?: string;
    description?: string;
    width?: number;
    height?: number;
    // Sequence-specific fields
    sequenceId?: string;
    sequenceShortCode?: string;
    sequenceWord?: string;
    /** The raw sequence.word used as the cloud thumbnail storage key */
    sequenceCloudWord?: string;
    sequenceName?: string;
    sequenceThumbnail?: string;
    sequenceAuthor?: string;
    sequenceStepCount?: number;
    /**
     * The sender's viewer state as a share-link query (`pane=...&s=...`).
     * Opening the attachment seeds the viewer with it, as a followed link
     * would; absent on messages sent before it existed.
     */
    sequenceViewParams?: string;
    // Collection-specific fields
    collectionId?: string;
    collectionOwnerId?: string;
    collectionName?: string;
    collectionIcon?: string;
    collectionColor?: string;
    collectionSequenceCount?: number;
    collectionAccessRole?: "viewer" | "editor";
    // Feedback-specific fields
    feedbackId?: string;
    feedbackTitle?: string;
    feedbackType?: "bug" | "feature" | "general";
    feedbackStatus?: string;
    feedbackDescription?: string;
  };
}

/**
 * A reaction on a message (emoji + list of users who reacted)
 */
export interface MessageReaction {
  emoji: string;
  userIds: string[];
}

/**
 * Preview of a replied-to message
 */
export interface ReplyPreview {
  messageId: string;
  /** Present on new replies. Older stored replies predate this field. */
  senderId?: string;
  senderName: string;
  /** Snapshot of the complete original text at the time the reply was sent. */
  content: string;
  /** Enough attachment context to make an attachment-only quote meaningful. */
  attachmentType?: MessageAttachmentType;
}

/**
 * A historical edit of a message (for abuse prevention)
 */
export interface MessageEdit {
  content: string;
  editedAt: Date;
}

/**
 * A single message in a conversation
 */
export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string;
  content: string;
  createdAt: Date;
  editedAt?: Date;
  readBy: string[]; // User IDs who have read this message
  readAt?: Record<string, Date>; // Timestamps when each user read the message
  attachments?: MessageAttachment[];
  isDeleted?: boolean; // Soft delete flag
  reactions?: MessageReaction[]; // Emoji reactions on this message
  replyTo?: ReplyPreview; // Message this is replying to
  editHistory?: MessageEdit[]; // Previous versions for abuse prevention
  /** Local Firestore writes can appear before the server acknowledges them. */
  hasPendingWrites?: boolean;
  /** True when this snapshot is currently being served from the local cache. */
  fromCache?: boolean;
}

/**
 * Input for creating a new message
 */
export interface CreateMessageInput {
  /** Stable client ID used by the durable outbox for idempotent retries. */
  messageId?: string;
  conversationId: string;
  content: string;
  attachments?: MessageAttachment[];
  replyTo?: ReplyPreview; // Optional reply to another message
}

/**
 * Preview of a message for display in conversation list
 */
export interface MessagePreview {
  messageId?: string;
  content: string;
  senderId: string;
  senderName: string;
  createdAt: Date;
  hasAttachment?: boolean;
}

/**
 * Options for fetching messages with pagination
 */
export interface MessageFetchOptions {
  limit?: number;
  beforeId?: string; // For cursor-based pagination
  afterId?: string;
}
