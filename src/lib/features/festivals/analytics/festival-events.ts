import { logActivity } from "#lib/shared/analytics/services/posthog-activity-logger.js";

export function trackFestivalSubmitted(submissionId: string): void {
  void logActivity("festival_submitted", "social", {
    submission_id: submissionId,
  });
}

export function trackFestivalTrackerChanged(properties: {
  festivalId: string;
  status?: string;
  changedFields: string[];
}): void {
  void logActivity("festival_tracker_changed", "social", {
    festival_id: properties.festivalId,
    status: properties.status,
    changed_fields: properties.changedFields,
  });
}

export function trackFestivalTrackerRemoved(festivalId: string): void {
  void logActivity("festival_tracker_removed", "social", {
    festival_id: festivalId,
  });
}
