import { beforeEach, describe, expect, it, vi } from "vitest";

const analyticsMocks = vi.hoisted(() => ({
  captureEvent: vi.fn(),
  captureException: vi.fn(),
}));

vi.mock("#lib/shared/analytics/services/posthog.js", () => analyticsMocks);

import {
  captureThumbnailRenderFailure,
  installThumbnailAnalyticsSession,
  thumbnailFailureProperties,
} from "#lib/shared/analytics/thumbnail-analytics.js";
import {
  ThumbnailMetricsCollector,
  type ThumbnailRequestContext,
} from "#lib/shared/browse/services/thumbnail-metrics-collector.js";

const context: ThumbnailRequestContext = {
  cacheKeyHash: "hash-1",
  sequenceId: "public-1",
  variant: "gallery",
  propKey: "fan",
  qrRequested: true,
  lightMode: false,
  usesDefaults: true,
  initialStepCount: 0,
  queueDepthAtEnqueue: 6,
  activeAtEnqueue: 3,
  workerEligible: false,
};

function createTimedOutRequest() {
  let now = 0;
  const collector = new ThumbnailMetricsCollector(
    () => now,
    () => now
  );
  const requestId = collector.startRequest(true, context);
  collector.startStage(requestId, "composition", {
    workerEligible: false,
  });
  collector.recordProgress(requestId, {
    current: 3,
    total: 9,
    stage: "rendering",
  });
  now = 15_000;
  const request = collector.endRequest(requestId, "failed", {
    queueWaitTime: 20,
    renderTime: 14_980,
    errorCode: "THUMBNAIL_RENDER_TIMEOUT",
  });
  return { collector, request: request! };
}

describe("thumbnail analytics", () => {
  beforeEach(() => {
    analyticsMocks.captureEvent.mockClear();
    analyticsMocks.captureException.mockClear();
  });

  it("captures a timeout with bounded request, stage, and progress context", () => {
    const { request } = createTimedOutRequest();
    const error = new Error("Thumbnail render exceeded 15000ms");

    captureThumbnailRenderFailure(error, request);

    expect(analyticsMocks.captureException).toHaveBeenCalledWith(
      error,
      expect.objectContaining({
        thumbnail_failure_kind: "timeout",
        thumbnail_error_code: "THUMBNAIL_RENDER_TIMEOUT",
        thumbnail_sequence_id: "public-1",
        thumbnail_prop_key: "fan",
        thumbnail_last_stage: "composition",
        thumbnail_progress_current: 3,
        thumbnail_progress_total: 9,
      })
    );
    const properties = thumbnailFailureProperties(request);
    expect(properties).not.toHaveProperty("sequenceName");
    expect(properties).not.toHaveProperty("steps");
    expect(properties).not.toHaveProperty("notes");
  });

  it("emits one sendBeacon session summary on a real page exit", () => {
    const { collector } = createTimedOutRequest();
    const target = new EventTarget();
    const session = installThumbnailAnalyticsSession(
      () => collector.getSummary(),
      target
    );

    target.dispatchEvent(new Event("pagehide"));
    target.dispatchEvent(new Event("pagehide"));

    expect(analyticsMocks.captureEvent).toHaveBeenCalledTimes(1);
    expect(analyticsMocks.captureEvent).toHaveBeenCalledWith(
      "thumbnail_session_summary",
      expect.objectContaining({
        thumbnail_request_count: 1,
        thumbnail_timeout_count: 1,
        thumbnail_by_variant_and_prop: { "gallery:fan": 1 },
      }),
      { send_instantly: true, transport: "sendBeacon" }
    );
    session.dispose();
  });

  it("does not end the session for a bfcache pagehide", () => {
    const { collector } = createTimedOutRequest();
    const target = new EventTarget();
    const session = installThumbnailAnalyticsSession(
      () => collector.getSummary(),
      target
    );
    const pageHide = new Event("pagehide");
    Object.defineProperty(pageHide, "persisted", { value: true });

    target.dispatchEvent(pageHide);

    expect(analyticsMocks.captureEvent).not.toHaveBeenCalled();
    session.dispose();
  });
});
