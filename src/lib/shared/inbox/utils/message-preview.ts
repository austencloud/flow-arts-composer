import { t } from "#lib/shared/i18n/i18n.svelte.js";
import type { MessageAttachment, ReplyPreview } from "#lib/shared/messaging/domain/models/message-models.js";

// Presentation only: persisted previews must remain independent of sender locale.
export function getMessagePreviewText(content: string, attachments?: readonly MessageAttachment[]): string {
  const text = content.trim();
  if (text) return text.slice(0, 100);
  switch (attachments?.[0]?.type) {
    case "image": return t("inbox_preview_image");
    case "sequence": return t("inbox_preview_sequence");
    case "collection": return t("inbox_preview_collection");
    case "feedback": return t("inbox_preview_feedback");
    case "link": return t("inbox_preview_link");
    default: return t("inbox_preview_attachment");
  }
}

export function getReplyPreviewText(reply: ReplyPreview): string {
  const text = reply.content.trim();
  if (text) return text;
  switch (reply.attachmentType) {
    case "image": return t("inbox_ui_image");
    case "sequence": return t("inbox_ui_sequence");
    case "collection": return t("inbox_ui_collection");
    case "link": return t("inbox_ui_link");
    case "feedback": return t("inbox_ui_feedback");
    default: return t("inbox_ui_message");
  }
}
