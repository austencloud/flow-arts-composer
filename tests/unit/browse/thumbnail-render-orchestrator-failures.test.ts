import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import {
  deriveKey,
  type ThumbnailRenderInput,
} from "#lib/shared/browse/services/thumbnail-key-deriver.js";
import type {
  RenderProgressCallback,
  ThumbnailRenderResult,
} from "#lib/shared/browse/services/thumbnail-renderer.js";

const analyticsMocks = vi.hoisted(() => ({
  captureThumbnailRenderFailure: vi.fn(),
}));

vi.mock("#lib/shared/analytics/thumbnail-analytics.js", () => analyticsMocks);
vi.mock("#lib/shared/browse/services/cloud-thumbnail-cache.js", () => ({
  getCachedUrl: () => null,
  getUrl: vi.fn(async () => null),
  upload: vi.fn(async () => null),
  clearMemoryCache: () => {},
  invalidateUrl: () => {},
  markMissing: vi.fn(),
}));

import { ThumbnailMetricsCollector } from "#lib/shared/browse/services/thumbnail-metrics-collector.js";
import { ThumbnailRenderOrchestrator } from "#lib/shared/browse/services/thumbnail-render-orchestrator.js";
import {
  ThumbnailRenderQueue,
  ThumbnailRenderTimeoutError,
} from "#lib/shared/browse/services/thumbnail-render-queue.js";
import * as cloudThumbnailCache from "#lib/shared/browse/services/cloud-thumbnail-cache.js";

const sequence = {
  id: "seq-1",
  word: "AB",
  steps: [],
} as unknown as SequenceData;

const input: ThumbnailRenderInput = {
  sequenceName: "AB",
  sequenceId: "seq-1",
  leftPropType: PropType.STAFF,
  rightPropType: PropType.STAFF,
  catDogModeEnabled: false,
  lightMode: false,
  variant: "gallery",
};

beforeEach(() => {
  analyticsMocks.captureThumbnailRenderFailure.mockClear();
  vi.mocked(cloudThumbnailCache.upload).mockClear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("ThumbnailRenderOrchestrator failure boundaries", () => {
  it("returns a typed timeout failure with bounded stage context", async () => {
    const timeout = new ThumbnailRenderTimeoutError(15_000);
    const queue = {
      enqueue: vi.fn(async () => {
        throw timeout;
      }),
      getStats: () => ({ queued: 2, active: 3 }),
      cancel: () => {},
    };
    const metrics = new ThumbnailMetricsCollector();
    const statuses: string[] = [];
    const orchestrator = new ThumbnailRenderOrchestrator(
      queue as never,
      { render: vi.fn() } as never,
      { get: vi.fn(), set: vi.fn() } as never,
      metrics
    );

    const result = await orchestrator.getThumbnail({
      sequence,
      input,
      skipCache: true,
      onStatusChange: (status) => statuses.push(status.state),
    });

    expect(result).toMatchObject({
      url: null,
      fromCache: false,
      error: timeout,
    });
    expect(statuses.at(-1)).toBe("error");
    expect(metrics.getCompletedRequests()[0]).toMatchObject({
      errorCode: "THUMBNAIL_RENDER_TIMEOUT",
      lastStage: "queue_wait",
      context: {
        sequenceId: "seq-1",
        propKey: "staff",
        queueDepthAtEnqueue: 2,
        activeAtEnqueue: 3,
      },
    });
    expect(analyticsMocks.captureThumbnailRenderFailure).toHaveBeenCalledWith(
      timeout,
      expect.any(Object)
    );
  });

  it("keeps cancellation out of exception capture", async () => {
    const cancellation = new DOMException("Aborted", "AbortError");
    const queue = {
      enqueue: vi.fn(async () => {
        throw cancellation;
      }),
      getStats: () => ({ queued: 0, active: 1 }),
      cancel: () => {},
    };
    const metrics = new ThumbnailMetricsCollector();
    const orchestrator = new ThumbnailRenderOrchestrator(
      queue as never,
      { render: vi.fn() } as never,
      { get: vi.fn(), set: vi.fn() } as never,
      metrics
    );

    await expect(
      orchestrator.getThumbnail({
        sequence,
        input,
        skipCache: true,
      })
    ).rejects.toMatchObject({ name: "AbortError" });

    expect(analyticsMocks.captureThumbnailRenderFailure).not.toHaveBeenCalled();
    expect(metrics.getSummary()).toMatchObject({
      cancelRate: 100,
      renderFailureRate: 0,
    });
  });

  it("settles queued cancellation and closes its metrics request", async () => {
    const queue = new ThumbnailRenderQueue();
    queue.setMaxConcurrent(1);
    const metrics = new ThumbnailMetricsCollector();
    const renderer = {
      render: vi.fn(
        (
          _sequence: unknown,
          _input: unknown,
          _options: unknown,
          _onProgress: unknown,
          signal: AbortSignal
        ) =>
          new Promise<never>((_resolve, reject) => {
            signal.addEventListener(
              "abort",
              () => reject(new DOMException("Aborted", "AbortError")),
              { once: true }
            );
          })
      ),
    };
    const orchestrator = new ThumbnailRenderOrchestrator(
      queue,
      renderer as never,
      { get: vi.fn(), set: vi.fn() } as never,
      metrics
    );
    const secondInput = {
      ...input,
      sequenceName: "CD",
      sequenceId: "seq-2",
    };
    const secondSequence = {
      ...sequence,
      id: "seq-2",
      word: "CD",
    } as unknown as SequenceData;

    const firstRequest = orchestrator.getThumbnail({
      sequence,
      input,
      skipCache: true,
    });
    const firstHandled = firstRequest.catch((error) => error);
    const secondRequest = orchestrator.getThumbnail({
      sequence: secondSequence,
      input: secondInput,
      skipCache: true,
    });
    const secondHandled = secondRequest.catch((error) => error);

    expect(orchestrator.getQueueStats()).toMatchObject({
      active: 1,
      queued: 1,
    });
    orchestrator.cancel({ hash: deriveKey(secondInput).hash });

    await expect(secondHandled).resolves.toMatchObject({
      name: "AbortError",
    });
    expect(metrics.getSummary()).toMatchObject({
      totalRequests: 1,
      cancelRate: 100,
      renderFailureRate: 0,
    });

    orchestrator.cancel({ hash: deriveKey(input).hash });
    await expect(firstHandled).resolves.toMatchObject({
      name: "AbortError",
    });
    expect(metrics.getSummary().totalRequests).toBe(2);
    expect(orchestrator.getQueueStats()).toMatchObject({
      active: 0,
      queued: 0,
    });
    expect(analyticsMocks.captureThumbnailRenderFailure).not.toHaveBeenCalled();
  });

  it("cancels one shared-key caller without aborting the surviving render", async () => {
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:shared"),
      revokeObjectURL: vi.fn(),
    });
    let finishRender!: (result: ThumbnailRenderResult) => void;
    const deferredRender = new Promise<ThumbnailRenderResult>((resolve) => {
      finishRender = resolve;
    });
    const renderer = {
      render: vi.fn(() => deferredRender),
    };
    const queue = new ThumbnailRenderQueue();
    const metrics = new ThumbnailMetricsCollector();
    const orchestrator = new ThumbnailRenderOrchestrator(
      queue,
      renderer as never,
      { get: vi.fn(), set: vi.fn(async () => {}) } as never,
      metrics
    );
    const firstController = new AbortController();
    const secondController = new AbortController();

    const firstRequest = orchestrator.getThumbnail({
      sequence,
      input,
      skipCache: true,
      signal: firstController.signal,
    });
    const firstHandled = firstRequest.catch((error) => error);
    const secondRequest = orchestrator.getThumbnail({
      sequence,
      input,
      skipCache: true,
      signal: secondController.signal,
    });

    firstController.abort();

    await expect(firstHandled).resolves.toMatchObject({
      name: "AbortError",
    });
    expect(renderer.render).toHaveBeenCalledOnce();
    expect(orchestrator.getQueueStats()).toMatchObject({
      active: 1,
      queued: 0,
    });

    finishRender({
      blob: new Blob(["shared"], { type: "image/webp" }),
      qrConsistent: true,
    });

    await expect(secondRequest).resolves.toMatchObject({
      url: "blob:shared",
      fromCache: false,
    });
    expect(metrics.getSummary()).toMatchObject({
      totalRequests: 2,
      byLayer: { render: 1, failed: 1 },
      cancelRate: 50,
      renderFailureRate: 0,
    });
    expect(orchestrator.getQueueStats()).toMatchObject({
      active: 0,
      queued: 0,
    });
  });

  it("marks a visible QR-inconsistent render as intentionally uncached", async () => {
    const createObjectURL = vi.fn(() => "blob:qr-fallback");
    vi.stubGlobal("URL", {
      createObjectURL,
      revokeObjectURL: vi.fn(),
    });
    const localCache = {
      get: vi.fn(async () => null),
      set: vi.fn(async () => {}),
    };
    const orchestrator = new ThumbnailRenderOrchestrator(
      new ThumbnailRenderQueue(),
      {
        render: vi.fn(async () => ({
          blob: new Blob(["qr-fallback"], { type: "image/webp" }),
          qrConsistent: false,
        })),
      } as never,
      localCache as never
    );

    const result = await orchestrator.getThumbnail({
      sequence,
      input: {
        ...input,
        visibility: { showQRCode: true },
      },
      skipCache: true,
    });

    expect(result).toMatchObject({
      url: "blob:qr-fallback",
      fromCache: false,
      cacheWriteSkippedReason: "qr_inconsistent",
    });
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(localCache.set).not.toHaveBeenCalled();
    expect(cloudThumbnailCache.upload).not.toHaveBeenCalled();
  });

  it("blocks late progress and success side effects after a real queue timeout", async () => {
    vi.useFakeTimers();
    const createObjectURL = vi.fn(() => "blob:late");
    vi.stubGlobal("URL", {
      createObjectURL,
      revokeObjectURL: vi.fn(),
    });

    let emitProgress: RenderProgressCallback | undefined;
    let resolveRender!: (result: ThumbnailRenderResult) => void;
    const deferredRender = new Promise<ThumbnailRenderResult>((resolve) => {
      resolveRender = resolve;
    });
    const renderer = {
      render: vi.fn(
        (
          _sequence: unknown,
          _input: unknown,
          _options: unknown,
          onProgress: RenderProgressCallback | undefined
        ) => {
          emitProgress = onProgress;
          return deferredRender;
        }
      ),
    };
    const localCache = {
      get: vi.fn(async () => null),
      set: vi.fn(async () => {}),
    };
    const statuses: string[] = [];
    const orchestrator = new ThumbnailRenderOrchestrator(
      new ThumbnailRenderQueue(),
      renderer as never,
      localCache as never,
      new ThumbnailMetricsCollector()
    );

    const request = orchestrator.getThumbnail({
      sequence,
      input,
      skipCache: true,
      onStatusChange: (status) => statuses.push(status.state),
    });

    await vi.advanceTimersByTimeAsync(15_000);
    const result = await request;

    expect(result.error).toBeInstanceOf(ThumbnailRenderTimeoutError);
    expect(statuses).toEqual(["queued", "rendering", "error"]);

    emitProgress?.({ current: 2, total: 2, stage: "finalizing" });
    await Promise.resolve();
    expect(statuses).toEqual(["queued", "rendering", "error"]);

    resolveRender({
      blob: new Blob(["late"], { type: "image/webp" }),
      qrConsistent: true,
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(statuses).toEqual(["queued", "rendering", "error"]);
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(localCache.set).not.toHaveBeenCalled();
    expect(cloudThumbnailCache.upload).not.toHaveBeenCalled();
    expect(orchestrator.getQueueStats()).toEqual({
      queued: 0,
      active: 0,
      completed: 0,
    });
  });
});
