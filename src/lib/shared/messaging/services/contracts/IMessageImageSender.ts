import type { ReplyPreview } from "../../domain/models/message-models";

export type MessageImageSendPhase = "uploading" | "finalizing";

export interface MessageImageSendProgress {
  phase: MessageImageSendPhase;
  fraction: number;
}

export interface MessageImageSendRequest {
  conversationId: string;
  messageId: string;
  attachmentId: string;
  file: File;
  content: string;
  replyTo?: ReplyPreview;
  onProgress?: (progress: MessageImageSendProgress) => void;
  /**
   * The account this send belongs to.
   *
   * The sender reads `auth.currentUser` only after awaiting Firebase init, and
   * stages the upload under that uid — so a send queued by one account could be
   * staged, and later finalized, under whichever account is signed in by then.
   * When this is given, the sender refuses instead: once after init, and again
   * immediately before the callable that commits the message.
   */
  expectedUserId?: string;
}

export interface MessageImageSendResult {
  messageId: string;
  storagePath: string;
  width: number;
  height: number;
}

export interface MessageImageSendHandle {
  promise: Promise<MessageImageSendResult>;
  cancel(): void;
}

export interface IMessageImageSender {
  send(request: MessageImageSendRequest): MessageImageSendHandle;
}
