/**
 * Typed PostHog boundary for thumbnail failures and one page-lifetime summary.
 *
 * Payload construction stays here so renderer call sites cannot accidentally
 * add sequence content or turn every cache hit into an analytics event.
 */

import {
  captureEvent,
  captureException,
} from "#lib/shared/analytics/services/posthog.js";
import type {
  ThumbnailMetricsSummary,
  ThumbnailRequestMetrics,
} from "#lib/shared/browse/services/thumbnail-metrics-collector.js";

export type ThumbnailFailureKind = "timeout" | "render_failed";

export function thumbnailFailureProperties(
  request: ThumbnailRequestMetrics
): Record<string, unknown> {
  const progress = request.latestProgress;
  return {
    thumbnail_failure_kind:
      request.errorCode === "THUMBNAIL_RENDER_TIMEOUT"
        ? ("timeout" satisfies ThumbnailFailureKind)
        : ("render_failed" satisfies ThumbnailFailureKind),
    thumbnail_error_code: request.errorCode ?? "RENDER_FAILED",
    thumbnail_request_id: request.requestId,
    thumbnail_cache_key_hash: request.context.cacheKeyHash,
    thumbnail_sequence_id: request.context.sequenceId,
    thumbnail_variant: request.context.variant,
    thumbnail_prop_key: request.context.propKey,
    thumbnail_qr_requested: request.context.qrRequested,
    thumbnail_light_mode: request.context.lightMode,
    thumbnail_uses_defaults: request.context.usesDefaults,
    thumbnail_initial_step_count: request.context.initialStepCount,
    thumbnail_queue_depth: request.context.queueDepthAtEnqueue,
    thumbnail_active_count: request.context.activeAtEnqueue,
    thumbnail_worker_eligible: request.context.workerEligible,
    thumbnail_total_elapsed_ms: request.timeToUrl,
    thumbnail_queue_wait_ms: request.queueWaitTime ?? null,
    thumbnail_render_ms: request.renderTime ?? null,
    thumbnail_last_stage: request.lastStage ?? null,
    thumbnail_last_stage_elapsed_ms: request.lastStageElapsedTime ?? null,
    thumbnail_stage_durations_ms: request.stageDurations,
    thumbnail_progress_stage: progress?.stage ?? null,
    thumbnail_progress_current: progress?.current ?? null,
    thumbnail_progress_total: progress?.total ?? null,
  };
}

export function captureThumbnailRenderFailure(
  error: Error,
  request: ThumbnailRequestMetrics
): void {
  try {
    captureException(error, thumbnailFailureProperties(request));
  } catch (captureError) {
    // A broken analytics client must not replace the inline thumbnail failure
    // with a second application error.
    console.warn(
      "[thumbnail-analytics] Exception capture failed",
      captureError
    );
  }
}

export function thumbnailSessionProperties(
  summary: ThumbnailMetricsSummary
): Record<string, unknown> {
  return {
    thumbnail_request_count: summary.totalRequests,
    thumbnail_render_count: summary.renderRequests,
    thumbnail_outcomes_by_layer: summary.byLayer,
    thumbnail_time_to_url: summary.timeDistribution,
    thumbnail_queue_wait: summary.queueWaitDistribution,
    thumbnail_render_time: summary.renderTimeDistribution,
    thumbnail_stage_distributions: summary.stageDistributions,
    thumbnail_cancel_rate: summary.cancelRate,
    thumbnail_render_failure_rate: summary.renderFailureRate,
    thumbnail_queue_high_water_mark: summary.queueHighWaterMark,
    thumbnail_by_variant_and_prop: summary.byVariantAndProp,
    thumbnail_timeout_count: summary.timeoutCount,
    thumbnail_orphaned_sequence_count: summary.orphanedSequenceCount,
    thumbnail_orphaned_sequence_ids: summary.orphanedSequenceIds,
    thumbnail_longest_stage: summary.longestStage?.stage ?? null,
    thumbnail_longest_stage_ms: summary.longestStage?.duration ?? null,
    thumbnail_session_duration_ms: summary.sessionDuration,
  };
}

export interface ThumbnailAnalyticsSession {
  flush(): void;
  dispose(): void;
}

/**
 * Register one pagehide summary. A bfcache transition is a pause, so it keeps
 * the live page session open and emits when the document actually exits.
 */
export function installThumbnailAnalyticsSession(
  getSummary: () => ThumbnailMetricsSummary,
  target: EventTarget | null = typeof window === "undefined" ? null : window
): ThumbnailAnalyticsSession {
  let emitted = false;

  const flush = () => {
    if (emitted) return;
    const summary = getSummary();
    if (summary.totalRequests === 0) return;
    emitted = true;
    captureEvent(
      "thumbnail_session_summary",
      thumbnailSessionProperties(summary),
      { send_instantly: true, transport: "sendBeacon" }
    );
  };

  const onPageHide = (event: Event) => {
    if ((event as PageTransitionEvent).persisted) return;
    flush();
  };

  target?.addEventListener("pagehide", onPageHide, { capture: true });

  return {
    flush,
    dispose() {
      target?.removeEventListener("pagehide", onPageHide, { capture: true });
    },
  };
}
