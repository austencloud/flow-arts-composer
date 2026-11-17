/**
 * What a feedback submission says in the sender's direct thread with the admin.
 *
 * Pure: no Firebase, no state. The submission service sends what this builds
 * through the ordinary messenger, so the thread holds a normal message from the
 * person, with the feedback card attached.
 */

import type { MessageAttachment } from "#lib/shared/messaging/domain/models/message-models.js";
import type { FeedbackType } from "./models/feedback-models";

/** The inbox's message ceiling, enforced again by the deliverMessage callable. */
export const FEEDBACK_MESSAGE_MAX_LENGTH = 2000;

/** The card keeps a short excerpt; the message itself carries the full words. */
const ATTACHMENT_DESCRIPTION_LENGTH = 200;
const ATTACHMENT_TITLE_LENGTH = 240;

/** The error handler titles automatic bug reports with this prefix. */
const AUTO_REPORT_PREFIX = "[Auto]";

const FEEDBACK_MESSAGE_ID_PREFIX = "feedback-";

/**
 * One feedback item maps to one stable message id, so a retry after a lost or
 * failed send can never put the same message in the thread twice: the callable
 * answers a repeated id with `alreadyDelivered`.
 */
export function feedbackMessageId(feedbackId: string): string {
  return `${FEEDBACK_MESSAGE_ID_PREFIX}${feedbackId}`;
}

export function isFeedbackMessageId(messageId: string): boolean {
  return messageId.startsWith(FEEDBACK_MESSAGE_ID_PREFIX);
}

/** The feedback id a feedback message id was made from. */
export function feedbackIdFromMessageId(messageId: string): string {
  return messageId.slice(FEEDBACK_MESSAGE_ID_PREFIX.length);
}

export function isAutomaticErrorReport(title: string): boolean {
  return title.trim().startsWith(AUTO_REPORT_PREFIX);
}

function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

/**
 * The message text: the person's own words in full, cut with an ellipsis past
 * the inbox limit. An automatic error report is one plain line naming what
 * failed; its technical report stays on the feedback item.
 */
export function buildFeedbackMessageText(input: {
  title: string;
  description: string;
}): string {
  if (isAutomaticErrorReport(input.title)) {
    const failure = input.title.trim().slice(AUTO_REPORT_PREFIX.length).trim();
    const line = failure
      ? `Automatic error report: ${failure}`
      : "Automatic error report from the app.";
    return clip(line.replace(/\s+/g, " "), FEEDBACK_MESSAGE_MAX_LENGTH);
  }

  const words = input.description.trim() || input.title.trim();
  return clip(words, FEEDBACK_MESSAGE_MAX_LENGTH);
}

export function buildFeedbackAttachment(input: {
  feedbackId: string;
  title: string;
  type: FeedbackType;
  description: string;
}): MessageAttachment {
  return {
    type: "feedback",
    url: `/feedback/${input.feedbackId}`,
    metadata: {
      feedbackId: input.feedbackId,
      // The callable refuses a card title over 240 characters, which would
      // fail the whole send. Generated titles stay far below that.
      feedbackTitle: clip(input.title, ATTACHMENT_TITLE_LENGTH),
      feedbackType: input.type,
      feedbackStatus: "new",
      feedbackDescription: input.description.slice(
        0,
        ATTACHMENT_DESCRIPTION_LENGTH
      ),
    },
  };
}
