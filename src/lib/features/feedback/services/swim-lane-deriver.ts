import type { FeedbackItem } from "#lib/shared/feedback/domain/models/feedback-models.js";
import type { SwimLane } from "#lib/shared/feedback/domain/feedback-contract-types.js";

export function deriveLane(item: FeedbackItem): SwimLane {
  // Critical: High-priority bugs that need immediate attention
  if (item.priority === 'critical' && item.type === 'bug') {
    return 'critical';
  }

  // Internal: Dev work from terminal (CLI/dev log)
  if (item.source === 'terminal') {
    return 'internal';
  }

  // Backlog: Low priority or deferred items
  if (item.priority === 'low' || item.deferredUntil) {
    return 'backlog';
  }

  // Everything else is normal
  return 'normal';
}

export function groupByLane(items: FeedbackItem[]): Record<SwimLane, FeedbackItem[]> {
  const result: Record<SwimLane, FeedbackItem[]> = {
    critical: [],
    normal: [],
    internal: [],
    backlog: [],
  };

  for (const item of items) {
    const lane = deriveLane(item);
    result[lane].push(item);
  }

  return result;
}
