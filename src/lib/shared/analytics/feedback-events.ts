import { logActivity } from "#lib/shared/analytics/services/posthog-activity-logger.js";

export function trackFeedbackSubmitted(properties: {
  feedbackId: string;
  type: string;
  module: string;
  tab: string;
  imageCount: number;
}): void {
  void logActivity("feedback_submitted", "social", {
    feedback_id: properties.feedbackId,
    feedback_type: properties.type,
    module: properties.module,
    tab: properties.tab,
    image_count: properties.imageCount,
  });
}

/** Where a feedback thread message stopped: opening the thread, or sending into it. */
export type FeedbackThreadStage = "conversation" | "send";

/**
 * A feedback item whose message to the admin's inbox did not go through. Ids
 * and an error code only, never the feedback text, so the failures can be
 * counted and joined to `feedback_submitted` by `feedback_id`.
 */
export function trackFeedbackThreadFailed(properties: {
  feedbackId: string;
  stage: FeedbackThreadStage;
  errorCode: string;
  attempt: "submit" | "retry";
}): void {
  void logActivity("feedback_thread_failed", "social", {
    feedback_id: properties.feedbackId,
    stage: properties.stage,
    error_code: properties.errorCode,
    attempt: properties.attempt,
  });
}

/** A failed feedback message that a later app start delivered. */
export function trackFeedbackThreadRecovered(feedbackId: string): void {
  void logActivity("feedback_thread_recovered", "social", {
    feedback_id: feedbackId,
  });
}
