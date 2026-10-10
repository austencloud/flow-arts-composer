import { t } from "#lib/shared/i18n/i18n.svelte.js";
import type {
  FeedbackPriority,
  FeedbackStatus,
  FeedbackType,
} from "#lib/shared/feedback/domain/models/feedback-models.js";

export function feedbackTypeLabel(type: FeedbackType, short = false): string {
  const keys = short
    ? ({
        bug: "feedback_type_bug_short",
        feature: "feedback_type_feature_short",
        general: "feedback_type_general_short",
      } as const)
    : ({
        bug: "feedback_type_bug",
        feature: "feedback_type_feature",
        general: "feedback_type_general",
      } as const);
  return t(keys[type]);
}

export function feedbackTypePlaceholder(type: FeedbackType): string {
  const keys = {
    bug: "feedback_placeholder_bug",
    feature: "feedback_placeholder_feature",
    general: "feedback_placeholder_general",
  } as const;
  return t(keys[type]);
}

export function feedbackStatusLabel(status: FeedbackStatus): string {
  const keys = {
    new: "feedback_status_new",
    "in-progress": "feedback_status_in_progress",
    "in-review": "feedback_status_in_review",
    completed: "feedback_status_completed",
    archived: "feedback_status_archived",
  } as const;
  return t(keys[status]);
}

export function feedbackPriorityLabel(priority: FeedbackPriority): string {
  const keys = {
    low: "feedback_priority_low",
    medium: "feedback_priority_medium",
    high: "feedback_priority_high",
    critical: "feedback_priority_critical",
  } as const;
  return t(keys[priority]);
}
