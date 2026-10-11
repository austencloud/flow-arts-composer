import { describe, expect, it } from "vitest";
import {
  ThumbnailMetricsCollector,
  type ThumbnailRequestContext,
} from "#lib/shared/browse/services/thumbnail-metrics-collector.js";

function requestContext(
  overrides: Partial<ThumbnailRequestContext> = {}
): ThumbnailRequestContext {
  return {
    cacheKeyHash: "hash-1",
    sequenceId: "public-1",
    variant: "gallery",
    propKey: "fan",
    qrRequested: false,
    lightMode: false,
    usesDefaults: true,
    initialStepCount: 0,
    queueDepthAtEnqueue: null,
    activeAtEnqueue: null,
    workerEligible: null,
    ...overrides,
  };
}

describe("ThumbnailMetricsCollector", () => {
  it("records stage durations, progress, and the last timed-out stage", () => {
    let now = 0;
    const collector = new ThumbnailMetricsCollector(
      () => now,
      () => 1_000 + now
    );
    const requestId = collector.startRequest(true, requestContext());

    now = 5;
    collector.startStage(requestId, "queue_wait");
    collector.recordQueueState(requestId, { queued: 4, active: 3 });
    now = 15;
    collector.startStage(requestId, "sequence_load");
    now = 20;
    collector.recordProgress(requestId, {
      current: 2,
      total: 8,
      stage: "rendering",
    });
    now = 35;
    collector.startStage(requestId, "composition", {
      workerEligible: false,
    });
    now = 55;
    const failure = collector.endRequest(requestId, "failed", {
      queueWaitTime: 10,
      renderTime: 40,
      errorCode: "THUMBNAIL_RENDER_TIMEOUT",
    });

    expect(failure).toMatchObject({
      timeToUrl: 55,
      lastStage: "composition",
      lastStageElapsedTime: 20,
      stageDurations: {
        queue_wait: 10,
        sequence_load: 20,
        composition: 20,
      },
      latestProgress: {
        current: 2,
        total: 8,
        stage: "rendering",
      },
      context: {
        queueDepthAtEnqueue: 4,
        activeAtEnqueue: 3,
        workerEligible: false,
      },
    });

    const summary = collector.getSummary();
    expect(summary.timeoutCount).toBe(1);
    expect(summary.queueHighWaterMark).toBe(7);
    expect(summary.longestStage).toEqual({
      stage: "sequence_load",
      duration: 20,
    });
    expect(summary.stageDistributions.composition?.p95).toBe(20);
  });

  it("keeps request context to the production allowlist", () => {
    const collector = new ThumbnailMetricsCollector(
      () => 0,
      () => 0
    );
    const requestId = collector.startRequest(false, requestContext());
    const completed = collector.endRequest(requestId, "memory");

    expect(Object.keys(completed!.context).sort()).toEqual(
      [
        "activeAtEnqueue",
        "cacheKeyHash",
        "initialStepCount",
        "lightMode",
        "propKey",
        "qrRequested",
        "queueDepthAtEnqueue",
        "sequenceId",
        "usesDefaults",
        "variant",
        "workerEligible",
      ].sort()
    );
    expect(completed!.context).not.toHaveProperty("sequenceName");
    expect(completed!.context).not.toHaveProperty("steps");
  });

  it("keeps cancellation separate from render failures", () => {
    let now = 0;
    const collector = new ThumbnailMetricsCollector(
      () => now,
      () => now
    );
    const requestId = collector.startRequest(true, requestContext());
    now = 12;
    collector.cancelRequest(requestId);

    const summary = collector.getSummary();
    expect(summary.cancelRate).toBe(100);
    expect(summary.renderFailureRate).toBe(0);
    expect(summary.timeoutCount).toBe(0);
  });

  it("stores at most 1,000 completed requests", () => {
    let now = 0;
    const collector = new ThumbnailMetricsCollector(
      () => now,
      () => now
    );

    for (let index = 0; index < 1_005; index++) {
      const requestId = collector.startRequest(
        true,
        requestContext({ cacheKeyHash: `hash-${index}` })
      );
      now++;
      collector.endRequest(requestId, index < 5 ? "failed" : "memory", {
        errorCode: index === 0 ? "THUMBNAIL_RENDER_TIMEOUT" : undefined,
      });
    }

    const requests = collector.getCompletedRequests();
    const summary = collector.getSummary();
    expect(requests).toHaveLength(1_000);
    expect(requests[0]?.context.cacheKeyHash).toBe("hash-5");
    expect(summary.totalRequests).toBe(1_005);
    expect(summary.byLayer).toMatchObject({ failed: 5, memory: 1_000 });
    expect(summary.timeDistribution).toMatchObject({
      count: 1_005,
      mean: 1,
      min: 1,
      max: 1,
    });
    expect(summary.byVariantAndProp["gallery:fan"]).toBe(1_005);
    expect(summary.timeoutCount).toBe(1);
  });

  it("reset starts a clean benchmark iteration", () => {
    const collector = new ThumbnailMetricsCollector(
      () => 0,
      () => 0
    );
    const requestId = collector.startRequest(true, requestContext());
    collector.endRequest(requestId, "render");

    collector.reset();

    expect(collector.getSummary().totalRequests).toBe(0);
    expect(collector.getCompletedRequests()).toEqual([]);
  });
});
