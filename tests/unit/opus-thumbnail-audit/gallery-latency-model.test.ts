/**
 * Reproducible gallery workload: what the queue shape alone costs, before any
 * device-specific render cost is known.
 *
 * Methodology
 * -----------
 * - Real ThumbnailRenderOrchestrator, ThumbnailRenderQueue and
 *   ThumbnailMetricsCollector. Stubbed: the renderer (a fixed delay), the local
 *   IndexedDB tier, the cloud module, and `fetch` for the static manifest.
 * - One deterministic clock: vitest fake timers drive `Date`, `setTimeout` and
 *   `performance`, and the collector is constructed with `Date.now` for both of
 *   its clocks. Every number below is exact, not sampled.
 * - RENDER_COST_MS is a PARAMETER, not a measurement. Results are reported as
 *   multiples of it so they hold for any device: the field incident's 15s
 *   deadline and the spec's 12s p95 gate both live on this curve.
 * - Concurrency 3 is the production Browse value: `getThumbnailRenderQueue()`
 *   sets 3 whenever `CompositionDispatcher.canUseWorker()` is false, and Browse
 *   never probes the worker pool, so 3 is what a gallery-first session gets.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import {
  deriveKey,
  type ThumbnailRenderInput,
} from "$lib/shared/browse/services/thumbnail-key-deriver";

vi.mock("$lib/shared/analytics/thumbnail-analytics", () => ({
  captureThumbnailRenderFailure: vi.fn(),
}));

vi.mock("$lib/shared/browse/services/cloud-thumbnail-cache", () => ({
  getCachedUrl: () => null,
  getUrl: vi.fn(async () => null),
  upload: vi.fn(async () => null),
  clearMemoryCache: vi.fn(),
  invalidateUrl: vi.fn(),
  markMissing: vi.fn(),
}));

const GALLERY_SIZE = 40;
const RENDER_COST_MS = 800;
const PRODUCTION_CONCURRENCY = 3;

const sequence = (id: string): SequenceData =>
  ({
    id,
    word: id,
    steps: [{ id: `${id}-1`, motions: {} }],
  }) as unknown as SequenceData;

const input = (id: string): ThumbnailRenderInput => ({
  sequenceName: id,
  sequenceId: id,
  leftPropType: PropType.STAFF,
  rightPropType: PropType.STAFF,
  catDogModeEnabled: false,
  lightMode: false,
  variant: "gallery",
  startPositionLayout: "row",
  visibility: { showQRCode: false, showMandala: true },
});

const ids = Array.from({ length: GALLERY_SIZE }, (_, i) => `SEQ${i}`);

async function createHarness() {
  const [
    { ThumbnailRenderOrchestrator },
    { ThumbnailRenderQueue },
    { ThumbnailMetricsCollector },
  ] = await Promise.all([
    import("$lib/shared/browse/services/thumbnail-render-orchestrator"),
    import("$lib/shared/browse/services/thumbnail-render-queue"),
    import("$lib/shared/browse/services/thumbnail-metrics-collector"),
  ]);

  let peakConcurrent = 0;
  let active = 0;
  const render = vi.fn(
    async (
      _sequence: unknown,
      _input: unknown,
      _options: unknown,
      _onProgress: unknown,
      signal?: AbortSignal
    ) => {
      active++;
      peakConcurrent = Math.max(peakConcurrent, active);
      try {
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(resolve, RENDER_COST_MS);
          signal?.addEventListener(
            "abort",
            () => {
              clearTimeout(timer);
              reject(new DOMException("Aborted", "AbortError"));
            },
            { once: true }
          );
        });
      } finally {
        active--;
      }
      return {
        blob: new Blob(["rendered"], { type: "image/webp" }),
        qrConsistent: true,
      };
    }
  );

  // One clock for the whole measurement.
  const metrics = new ThumbnailMetricsCollector(
    () => Date.now(),
    () => Date.now()
  );
  const queue = new ThumbnailRenderQueue();
  queue.setMaxConcurrent(PRODUCTION_CONCURRENCY);
  const orchestrator = new ThumbnailRenderOrchestrator(
    queue,
    { render } as never,
    { get: vi.fn(async () => null), set: vi.fn(async () => {}) } as never,
    metrics
  );
  return {
    orchestrator,
    queue,
    metrics,
    render,
    stats: () => ({ peakConcurrent }),
  };
}

function stubManifest(keys: string[]) {
  const fetchMock = vi.fn(
    async () => new Response(JSON.stringify({ keys }), { status: 200 })
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers({
    toFake: [
      "setTimeout",
      "clearTimeout",
      "setInterval",
      "clearInterval",
      "Date",
      "performance",
    ],
  });
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:rendered");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  vi.spyOn(console, "debug").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  stubManifest([]);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("cold gallery: every card must render", () => {
  it("measures time-to-URL against the 3-slot queue", async () => {
    const h = await createHarness();

    const requests = ids.map((id) =>
      h.orchestrator.getThumbnail({ sequence: sequence(id), input: input(id) })
    );
    await vi.runAllTimersAsync();
    const results = await Promise.all(requests);

    expect(results.every((r) => r.url === "blob:rendered")).toBe(true);
    expect(h.render).toHaveBeenCalledTimes(GALLERY_SIZE);
    expect(h.stats().peakConcurrent).toBe(PRODUCTION_CONCURRENCY);

    const summary = h.metrics.getSummary();
    const waves = Math.ceil(GALLERY_SIZE / PRODUCTION_CONCURRENCY); // 14
    // The whole pass is serialized into ceil(n/3) waves of one render cost.
    expect(summary.timeDistribution.max).toBeCloseTo(
      waves * RENDER_COST_MS,
      -2
    );
    // p50 lands in the middle of the wave ladder; p95 near the last wave.
    expect(summary.timeDistribution.p50 / RENDER_COST_MS).toBeGreaterThan(6);
    expect(summary.timeDistribution.p50 / RENDER_COST_MS).toBeLessThan(8);
    expect(summary.timeDistribution.p95 / RENDER_COST_MS).toBeGreaterThan(12);
    // Queue wait, not render time, dominates the tail: the last card waits 13
    // render costs before its own work starts.
    expect(summary.queueWaitDistribution.max).toBeCloseTo(
      (waves - 1) * RENDER_COST_MS,
      -2
    );
    expect(summary.renderTimeDistribution.p95).toBeCloseTo(RENDER_COST_MS, -2);
    expect(summary.queueHighWaterMark).toBeGreaterThanOrEqual(GALLERY_SIZE - 1);
    expect(summary.byLayer.render).toBe(GALLERY_SIZE);
    expect(summary.timeoutCount).toBe(0);

    // The gate the spec sets (render p95 < 12s under the 15s breaker) is a
    // statement about ONE render. The queue tail is 13 of them: any per-card
    // cost above 15s/13 ≈ 1.15s puts the last cards of a 40-card cold pass
    // past the inactivity deadline's worth of waiting.
    expect((waves - 1) * RENDER_COST_MS).toBeGreaterThan(10_000);
  });
});

describe("warm gallery: the static tier answers", () => {
  it("CONTROL: a fully warmed pass costs no render and no queue wait", async () => {
    const h = await createHarness();
    const warmedKeys = ids.map((id) =>
      h.orchestrator.buildStaticKey(deriveKey(input(id)))
    );
    stubManifest(warmedKeys);

    const start = Date.now();
    const results = await Promise.all(
      ids.map((id) =>
        h.orchestrator.getThumbnail({
          sequence: sequence(id),
          input: input(id),
        })
      )
    );

    expect(results.every((r) => r.fromCache)).toBe(true);
    expect(h.render).not.toHaveBeenCalled();
    expect(Date.now() - start).toBe(0);

    const summary = h.metrics.getSummary();
    expect(summary.byLayer.static).toBe(GALLERY_SIZE);
    expect(summary.timeDistribution.max).toBe(0);
    expect(summary.queueWaitDistribution.count).toBe(0);
  });
});

describe("scroll churn: work discarded mid-render", () => {
  it("measures the renders thrown away when cards leave and return", async () => {
    const h = await createHarness();

    // A fling: every card is requested, then aborted one render-cost later
    // (the IntersectionObserver path), then requested again on the way back.
    const controllers = ids.map(() => new AbortController());
    const firstPass = ids.map((id, i) =>
      h.orchestrator
        .getThumbnail({
          sequence: sequence(id),
          input: input(id),
          signal: controllers[i]!.signal,
        })
        .catch(() => "cancelled" as const)
    );

    await vi.advanceTimersByTimeAsync(RENDER_COST_MS * 2);
    for (const controller of controllers) controller.abort();
    await vi.advanceTimersByTimeAsync(0);
    const firstPassOutcomes = await Promise.all(firstPass);
    const cancelled = firstPassOutcomes.filter((o) => o === "cancelled").length;
    const rendersDuringFling = h.render.mock.calls.length;

    // Scroll back: the same 40 cards ask again.
    const secondPass = ids.map((id) =>
      h.orchestrator
        .getThumbnail({ sequence: sequence(id), input: input(id) })
        .catch(() => "cancelled" as const)
    );
    await vi.runAllTimersAsync();
    const secondPassOutcomes = await Promise.all(secondPass);

    // Two full render passes were started for one gallery of thumbnails: the
    // aborted ones produced nothing, because no tier is written until a render
    // completes.
    expect(cancelled).toBeGreaterThanOrEqual(GALLERY_SIZE - 6);
    expect(rendersDuringFling).toBeGreaterThanOrEqual(PRODUCTION_CONCURRENCY);
    expect(h.render.mock.calls.length).toBeGreaterThan(rendersDuringFling);
    expect(
      secondPassOutcomes.filter((o) => o !== "cancelled").length
    ).toBeGreaterThan(0);

    const summary = h.metrics.getSummary();
    // Cancellations are counted separately from failures, so a churny session
    // does not look like an error rate — it looks like a slow session.
    expect(summary.cancelRate).toBeGreaterThan(0);
    expect(summary.renderFailureRate).toBe(0);
  });
});
