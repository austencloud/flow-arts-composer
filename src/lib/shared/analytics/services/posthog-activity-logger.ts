/**
 * PostHog Activity Logger
 *
 * PostHog handles event buffering, batching, session tracking,
 * user identification, and offline event queuing.
 */

import { browser } from "$app/environment";
import { captureWhenReady } from "./posthog";
import { consumeSwUpdateReloadMarker } from "$lib/shared/offline/services/sw-update-manager";
import { takeChunkRecoveryReloadForSession } from "$lib/shared/offline/services/chunk-recovery-marker";
import type { ActivityQueryOptions } from "./types";
import type {
  ActivityEvent,
  ActivityEventType,
  ActivityCategory,
  ActivityMetadata,
  ActivitySummary,
} from "../domain/models/activity-event";

/** Log a single activity event to PostHog */
export async function logActivity(
  eventType: ActivityEventType,
  category: ActivityCategory,
  metadata?: ActivityMetadata
): Promise<void> {
  if (!browser) return;

  const properties: Record<string, unknown> = { category };

  if (metadata) {
    if (metadata.module !== undefined) properties.module = metadata.module;
    if (metadata.panel !== undefined) properties.panel = metadata.panel;
    if (metadata.previousModule !== undefined)
      properties.previous_module = metadata.previousModule;
    if (metadata.sequenceId !== undefined)
      properties.sequence_id = metadata.sequenceId;
    if (metadata.sequenceWord !== undefined)
      properties.word = metadata.sequenceWord;
    if (metadata.sequenceLength !== undefined)
      properties.sequence_length = metadata.sequenceLength;
    if (metadata.isPublic !== undefined)
      properties.is_public = metadata.isPublic;
    if (metadata.generationType !== undefined)
      properties.generation_type = metadata.generationType;
    if (metadata.loopType !== undefined)
      properties.cap_type = metadata.loopType;
    if (metadata.lessonId !== undefined)
      properties.lesson_id = metadata.lessonId;
    if (metadata.quizId !== undefined) properties.quiz_id = metadata.quizId;
    if (metadata.score !== undefined) properties.score = metadata.score;
    if (metadata.correct !== undefined) properties.correct = metadata.correct;
    if (metadata.settingKey !== undefined)
      properties.setting_key = metadata.settingKey;
    if (metadata.oldValue !== undefined)
      properties.old_value = metadata.oldValue;
    if (metadata.newValue !== undefined)
      properties.new_value = metadata.newValue;
    if (metadata.shareMethod !== undefined)
      properties.share_method = metadata.shareMethod;
    if (metadata.exportFormat !== undefined)
      properties.export_format = metadata.exportFormat;
    if (metadata.targetUserId !== undefined)
      properties.target_user_id = metadata.targetUserId;
    if (metadata.duration !== undefined)
      properties.duration_ms = metadata.duration;

    const mappedKeys = [
      "module",
      "panel",
      "previousModule",
      "sequenceId",
      "sequenceWord",
      "sequenceLength",
      "isPublic",
      "generationType",
      "loopType",
      "lessonId",
      "quizId",
      "score",
      "correct",
      "settingKey",
      "oldValue",
      "newValue",
      "shareMethod",
      "exportFormat",
      "targetUserId",
      "duration",
    ];

    for (const [key, value] of Object.entries(metadata)) {
      if (!mappedKeys.includes(key)) {
        properties[key] = value;
      }
    }
  }

  captureWhenReady(eventType, properties);
}

/** Log a session start event */
export async function logSessionStart(): Promise<void> {
  if (!browser) return;

  const navigation = performance.getEntriesByType("navigation")[0] as
    | PerformanceNavigationTiming
    | undefined;
  const swReload = consumeSwUpdateReloadMarker();
  const chunkReload = takeChunkRecoveryReloadForSession();
  const wasDiscarded =
    "wasDiscarded" in document
      ? Boolean(
          (document as Document & { wasDiscarded?: boolean }).wasDiscarded
        )
      : null;

  await logActivity("session_start", "session", {
    navigation_type: navigation?.type ?? "unknown",
    sw_update_reload: swReload.occurred,
    sw_update_reload_age_ms: swReload.ageMs,
    chunk_recovery_reload: chunkReload.occurred,
    chunk_recovery_reload_age_ms: chunkReload.ageMs,
    document_was_discarded: wasDiscarded,
  });
}

/** Log a module/page view */
export async function logModuleView(
  module: string,
  previousModule?: string
): Promise<void> {
  await logActivity("module_view", "navigation", { module, previousModule });
}

/** Log a sequence action */
export async function logSequenceAction(
  action: "create" | "save" | "delete" | "edit" | "view" | "play" | "generate",
  sequenceId: string,
  metadata?: Partial<ActivityMetadata>
): Promise<void> {
  const eventType = `sequence_${action}` as ActivityEventType;
  await logActivity(eventType, "sequence", { sequenceId, ...metadata });
}

/** Log a share action */
export async function logShareAction(
  action: "sequence_share" | "sequence_export" | "link_copy",
  metadata?: Partial<ActivityMetadata>
): Promise<void> {
  await logActivity(action, "share", metadata);
}

/** Log a settings change */
export async function logSettingChange(
  settingKey: string,
  oldValue: string | number | boolean,
  newValue: string | number | boolean
): Promise<void> {
  await logActivity("setting_change", "settings", {
    settingKey,
    oldValue,
    newValue,
  });
}

/**
 * Query activity events — not supported via PostHog client.
 * Use PostHog dashboard or API for event queries.
 */
export async function queryEvents(
  _options: ActivityQueryOptions
): Promise<ActivityEvent[]> {
  console.warn(
    "[posthog-activity-logger] queryEvents is not supported. " +
      "Use PostHog dashboard or API for event queries."
  );
  return [];
}

/**
 * Get activity summary — not supported via PostHog client.
 * Use PostHog dashboard or API for analytics.
 */
export async function getActivitySummary(
  _startDate: Date,
  _endDate: Date
): Promise<ActivitySummary[]> {
  console.warn(
    "[posthog-activity-logger] getActivitySummary is not supported. " +
      "Use PostHog dashboard or API for analytics."
  );
  return [];
}

/**
 * Get daily active users — not supported via PostHog client.
 * Access through PostHog dashboard.
 */
export async function getDailyActiveUsers(
  _startDate: Date,
  _days: number
): Promise<Map<string, number>> {
  console.warn(
    "[posthog-activity-logger] getDailyActiveUsers is not supported. " +
      "Use PostHog dashboard for DAU metrics."
  );
  return new Map();
}

/**
 * Get event counts — not supported via PostHog client.
 * Use PostHog dashboard insights.
 */
export async function getEventCounts(
  _startDate: Date,
  _endDate: Date
): Promise<Map<ActivityEventType, number>> {
  console.warn(
    "[posthog-activity-logger] getEventCounts is not supported. " +
      "Use PostHog dashboard or API for event counts."
  );
  return new Map();
}
