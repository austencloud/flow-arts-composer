import { logActivity } from "#lib/shared/analytics/services/posthog-activity-logger.js";

export function trackTikaQuestionSubmitted(properties: {
  mode: "single" | "compare";
  modelCount: number;
  authenticated: boolean;
}): void {
  void logActivity("tika_question_submitted", "learn", {
    mode: properties.mode,
    model_count: properties.modelCount,
    authenticated: properties.authenticated,
  });
}
