import { withRoute } from "$lib/shared/analytics/analytics-context";
import { captureWhenReady } from "$lib/shared/analytics/services/posthog";

export type SequenceViewerSource =
  | "browse_collection"
  | "browse_gallery"
  | "browse_library"
  | "create_workspace"
  | "creator_directory"
  | "creator_profile"
  | "deck_release"
  | "effects_lab"
  | "external_link"
  | "fuse"
  | "inbox_message"
  | "inbox_notification"
  | "lineage"
  | "qr"
  | "share_intake"
  | "shape_engine"
  | "spiroanim"
  | "tunnel_collection"
  | "url_restore";

export type ViewerAnalyticsValue = string | number | boolean | null;
export type ViewerAnalyticsProperties = Record<
  string,
  ViewerAnalyticsValue | undefined
>;

export interface ViewerAnalyticsContext {
  sequenceId: string;
  source: SequenceViewerSource;
}

interface PendingViewerEvent {
  eventName: string;
  properties: Record<string, unknown>;
  timer: ReturnType<typeof setTimeout>;
}

const pendingEvents = new Map<string, PendingViewerEvent>();

function baseProperties(
  context: ViewerAnalyticsContext,
  properties: ViewerAnalyticsProperties = {}
): Record<string, unknown> {
  const compact = Object.fromEntries(
    Object.entries(properties).filter(([, value]) => value !== undefined)
  );
  return withRoute({
    viewer_source: context.source,
    sequence_id: context.sequenceId,
    ...compact,
  });
}

function captureViewerEvent(
  eventName: string,
  context: ViewerAnalyticsContext,
  properties: ViewerAnalyticsProperties = {},
  coalesceKey?: string
): void {
  const payload = baseProperties(context, properties);
  if (!coalesceKey) {
    captureWhenReady(eventName, payload);
    return;
  }

  const key = `${context.sequenceId}:${context.source}:${coalesceKey}`;
  const pending = pendingEvents.get(key);
  if (pending) {
    clearTimeout(pending.timer);
    pending.properties = {
      ...pending.properties,
      ...payload,
      previous_value: pending.properties["previous_value"],
    };
    pending.timer = setTimeout(() => flushPendingEvent(key), 450);
    return;
  }

  pendingEvents.set(key, {
    eventName,
    properties: payload,
    timer: setTimeout(() => flushPendingEvent(key), 450),
  });
}

function flushPendingEvent(key: string): void {
  const pending = pendingEvents.get(key);
  if (!pending) return;
  pendingEvents.delete(key);
  captureWhenReady(pending.eventName, pending.properties);
}

export function trackSequenceViewed(context: ViewerAnalyticsContext): void {
  captureViewerEvent("sequence_view", context);
}

export function trackSequenceRemixStarted(
  context: ViewerAnalyticsContext
): void {
  captureViewerEvent("sequence_remix_started", context);
}

export function trackViewerAction(
  context: ViewerAnalyticsContext,
  action: string,
  properties: ViewerAnalyticsProperties = {}
): void {
  captureViewerEvent("viewer_action", context, { action, ...properties });
}

export function trackViewerExport(
  context: ViewerAnalyticsContext,
  exportKind: string,
  stage: string,
  properties: ViewerAnalyticsProperties = {}
): void {
  captureViewerEvent("viewer_export", context, {
    export_kind: exportKind,
    stage,
    ...properties,
  });
}

export function trackViewerPlaybackChanged(
  context: ViewerAnalyticsContext,
  properties: ViewerAnalyticsProperties
): void {
  const coalesce = properties["coalesce"] === true;
  const { coalesce: _coalesce, count: _count, ...payload } = properties;
  captureViewerEvent(
    "viewer_playback_changed",
    context,
    payload,
    coalesce
      ? `playback:${String(properties["action"])}:${String(properties["source"])}`
      : undefined
  );
}

export function trackViewerPracticeChanged(
  context: ViewerAnalyticsContext,
  action: string,
  properties: ViewerAnalyticsProperties = {},
  coalesce = false
): void {
  captureViewerEvent(
    "viewer_practice_changed",
    context,
    { action, ...properties },
    coalesce
      ? `practice:${action}:${String(properties["changed_fields"] ?? "")}`
      : undefined
  );
}

export function trackViewerSettingChanged(
  context: ViewerAnalyticsContext,
  properties: ViewerAnalyticsProperties
): void {
  if (properties["previous_value"] === properties["value"]) return;
  const coalesce = properties["coalesce"] === true;
  const { coalesce: _coalesce, count: _count, ...payload } = properties;
  captureViewerEvent(
    "viewer_setting_changed",
    context,
    payload,
    coalesce
      ? `setting:${String(properties["group"])}:${String(properties["setting"])}`
      : undefined
  );
}

export function trackViewerViewChanged(
  context: ViewerAnalyticsContext,
  fromMode: string,
  toMode: string,
  source: string
): void {
  if (fromMode === toMode) return;
  captureViewerEvent("viewer_view_changed", context, {
    from_mode: fromMode,
    to_mode: toMode,
    source,
  });
}
