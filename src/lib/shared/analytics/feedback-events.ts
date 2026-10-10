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
