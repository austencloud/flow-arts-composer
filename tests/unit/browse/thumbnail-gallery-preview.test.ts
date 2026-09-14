import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import {
  deriveKey,
  type ThumbnailRenderInput,
} from "$lib/shared/browse/services/thumbnail-key-deriver";
import { ThumbnailRenderOrchestrator } from "$lib/shared/browse/services/thumbnail-render-orchestrator";
import { ThumbnailRenderQueue } from "$lib/shared/browse/services/thumbnail-render-queue";
import { ThumbnailMetricsCollector } from "$lib/shared/browse/services/thumbnail-metrics-collector";

vi.mock("$lib/shared/analytics/thumbnail-analytics", () => ({
  captureThumbnailRenderFailure: vi.fn(),
}));
vi.mock("$lib/shared/browse/services/cloud-thumbnail-cache", () => ({
  getCachedUrl: () => null,
  getUrl: vi.fn(async () => null),
  upload: vi.fn(async () => null),
}));

const input: ThumbnailRenderInput = {
  sequenceName: "BJEA",
  sequenceId: "BJEA",
  variant: "gallery",
  leftPropType: PropType.STAFF,
  rightPropType: PropType.STAFF,
  catDogModeEnabled: false,
  lightMode: false,
  visibility: { showQRCode: true, showMandala: true },
};
const sequence = {
  id: "BJEA",
  word: "BJEA",
  steps: [],
} as unknown as SequenceData;

function harness() {
  const local = new Map<string, Blob>();
  const cache = {
    get: vi.fn(async (hash: string) => local.get(hash) ?? null),
    set: vi.fn(async (hash: string, blob: Blob) => {
      local.set(hash, blob);
    }),
  };
  const render = vi.fn(
    async (
      _sequence: SequenceData,
      options: ThumbnailRenderInput,
      _renderOptions?: unknown,
      _progress?: unknown,
      signal?: AbortSignal
    ) => {
      // Reproduce a QR preparation that never finishes. Preview drawing is cheap.
      if (options.visibility?.showQRCode)
        return new Promise<never>((_resolve, reject) => {
          signal?.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true }
          );
        });
      await new Promise((resolve) => setTimeout(resolve, 20));
      return { blob: new Blob(["card"]), qrConsistent: true };
    }
  );
  const queue = new ThumbnailRenderQueue();
  const metrics = new ThumbnailMetricsCollector();
  const hasPreparedQR = vi.fn(async () => true);
  const orchestrator = new ThumbnailRenderOrchestrator(
    queue,
    { render, hasPreparedQR } as never,
    cache as never,
    metrics
  );
  return { local, cache, render, hasPreparedQR, queue, metrics, orchestrator };
}

beforeEach(() => {
  vi.useFakeTimers();
  let next = 0;
  vi.stubGlobal("URL", {
    createObjectURL: () => `blob:preview-${next++}`,
    revokeObjectURL: vi.fn(),
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => [] }))
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("gallery previews under a cold QR backlog", () => {
  it("paints the preview, admits new foreground work, then upgrades to a cached QR", async () => {
    const h = harness();
    let finishQR!: () => void;
    const qrGate = new Promise<void>((resolve) => {
      finishQR = resolve;
    });
    h.render.mockImplementation(async (_sequence, options) => {
      if (options.visibility?.showQRCode) await qrGate;
      return {
        blob: new Blob([options.visibility?.showQRCode ? "QR" : "preview"]),
        qrConsistent: true,
      };
    });
    const onPreview = vi.fn();
    const statuses: string[] = [];
    const upgrading = h.orchestrator.getThumbnail({
      sequence,
      input,
      skipCache: true,
      qrPolicy: "background",
      onPreview,
      onStatusChange: (s) => statuses.push(s.state),
    });
    await vi.advanceTimersByTimeAsync(110);
    expect(onPreview).toHaveBeenCalledOnce();
    expect(h.orchestrator.getBackgroundQueueStats()).toEqual({
      active: 1,
      queued: 0,
    });
    expect(h.local.has(deriveKey(input).hash)).toBe(false);
    const previewStatuses = [...statuses];
    const nextInput = {
      ...input,
      sequenceId: "new-row",
      sequenceName: "new-row",
      visibility: { showQRCode: false },
    };
    const next = await h.orchestrator.getThumbnail({
      sequence: { ...sequence, id: "new-row" },
      input: nextInput,
      skipCache: true,
    });
    expect(next.url).toBeTruthy();
    expect(statuses).toEqual(previewStatuses);
    finishQR();
    const final = await upgrading;
    expect(final.key.inputs.visibility?.showQRCode).toBe(true);
    expect(final.url).not.toBe(onPreview.mock.calls[0]![0].url);
    expect(h.local.has(deriveKey(input).hash)).toBe(true);
    expect(h.orchestrator.getBackgroundQueueStats()).toEqual({
      active: 0,
      queued: 0,
    });
  });

  it("cancels QR work when its preview leaves view and continues the next visible card", async () => {
    const h = harness();
    const controller = new AbortController();
    const first = h.orchestrator.getThumbnail({
      sequence,
      input,
      skipCache: true,
      qrPolicy: "background",
      signal: controller.signal,
    });
    const handled = first.catch((error) => error);
    await vi.advanceTimersByTimeAsync(150);
    expect(h.orchestrator.getBackgroundQueueStats().active).toBe(1);
    controller.abort();
    expect(await handled).toMatchObject({ name: "AbortError" });
    h.render.mockResolvedValue({ blob: new Blob(["QR"]), qrConsistent: true });
    // Returning to the same card must be able to upgrade, not join its old abort.
    await vi.advanceTimersByTimeAsync(1);
    const revisit = await h.orchestrator.getThumbnail({
      sequence,
      input,
      qrPolicy: "background",
    });
    expect(revisit.key.inputs.visibility?.showQRCode).toBe(true);
    expect(h.orchestrator.getBackgroundQueueStats()).toEqual({
      active: 0,
      queued: 0,
    });
  });

  it("keeps the preview if background QR generation fails", async () => {
    const h = harness();
    h.render.mockImplementation(async (_sequence, options) => ({
      blob: new Blob(["card"]),
      qrConsistent: !options.visibility?.showQRCode,
    }));
    const onPreview = vi.fn();
    const result = await h.orchestrator.getThumbnail({
      sequence,
      input,
      skipCache: true,
      qrPolicy: "background",
      onPreview,
    });
    expect(result.url).toBe(onPreview.mock.calls[0]![0].url);
    expect(h.local.has(deriveKey(input).hash)).toBe(false);
    expect(URL.revokeObjectURL).toHaveBeenCalledOnce();
  });

  it("upgrades a gallery preview only when prepared QR artwork is available", async () => {
    const h = harness();
    h.render.mockImplementation(
      async (_sequence, _input, renderOptions?: { qrLookup?: string }) => ({
        blob: new Blob([
          renderOptions?.qrLookup === "prepared-only" ? "QR" : "preview",
        ]),
        qrConsistent: true,
      })
    );
    const onPreview = vi.fn();

    const result = await h.orchestrator.getThumbnail({
      sequence,
      input,
      skipCache: true,
      qrPolicy: "prepared-only",
      onPreview,
    });

    expect(onPreview).toHaveBeenCalledOnce();
    expect(result.key.hash).toBe(deriveKey(input).hash);
    expect(h.render).toHaveBeenLastCalledWith(
      sequence,
      expect.objectContaining({
        visibility: expect.objectContaining({ showQRCode: true }),
      }),
      { qrLookup: "prepared-only" },
      expect.any(Function),
      expect.any(AbortSignal),
      expect.any(Function),
      expect.any(Function)
    );
  });

  it("keeps the no-QR preview and leaves the QR key empty on a prepared miss", async () => {
    const h = harness();
    h.hasPreparedQR.mockResolvedValue(false);
    h.render.mockImplementation(
      async (_sequence, _input, renderOptions?: { qrLookup?: string }) => ({
        blob: new Blob([renderOptions?.qrLookup ? "preview" : "preview"]),
        qrConsistent: !renderOptions?.qrLookup,
      })
    );
    const onPreview = vi.fn();

    const result = await h.orchestrator.getThumbnail({
      sequence,
      input,
      skipCache: true,
      qrPolicy: "prepared-only",
      onPreview,
    });

    const qrKey = deriveKey(input);
    expect(onPreview).toHaveBeenCalledOnce();
    expect(result.key.inputs.visibility?.showQRCode).toBe(false);
    expect(h.local.has(qrKey.hash)).toBe(false);
    expect(h.orchestrator.getCached(qrKey.hash)).toBeNull();
    expect(h.render).toHaveBeenCalledOnce();
  });

  it("keeps the preview when prepared QR lookup fails", async () => {
    const h = harness();
    h.render.mockResolvedValue({
      blob: new Blob(["preview"]),
      qrConsistent: true,
    });
    h.hasPreparedQR.mockRejectedValue(new Error("offline"));
    const onPreview = vi.fn();

    const result = await h.orchestrator.getThumbnail({
      sequence,
      input,
      skipCache: true,
      qrPolicy: "prepared-only",
      onPreview,
    });

    expect(onPreview).toHaveBeenCalledOnce();
    expect(result.key.inputs.visibility?.showQRCode).toBe(false);
    expect(h.render).toHaveBeenCalledOnce();
  });

  it("propagates cancellation while checking prepared QR artwork", async () => {
    const h = harness();
    const controller = new AbortController();
    h.hasPreparedQR.mockImplementation(
      (_sequence, _input, signal?: AbortSignal) =>
        new Promise<boolean>((_resolve, reject) => {
          signal?.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true }
          );
        })
    );
    const pending = h.orchestrator.getThumbnail({
      sequence,
      input,
      skipCache: true,
      qrPolicy: "prepared-only",
      signal: controller.signal,
    });
    const handled = pending.catch((error) => error);

    await vi.advanceTimersByTimeAsync(150);
    expect(h.hasPreparedQR).toHaveBeenCalledOnce();
    controller.abort();

    await expect(handled).resolves.toMatchObject({ name: "AbortError" });
  });

  it("finishes a large batch without starting QR work or poisoning QR keys", async () => {
    const h = harness();
    const requests = Array.from({ length: 24 }, (_, index) => {
      const id = `card-${index}`;
      return h.orchestrator.getThumbnail({
        sequence: { ...sequence, id },
        input: { ...input, sequenceId: id, sequenceName: id },
        skipCache: true,
        qrPolicy: "cache-only",
      });
    });
    await vi.advanceTimersByTimeAsync(200);
    const results = await Promise.all(requests);
    expect(results.every((result) => result.url && !result.error)).toBe(true);
    expect(h.queue.getStats()).toMatchObject({ active: 0, queued: 0 });
    expect(h.render).toHaveBeenCalledTimes(24);
    expect(h.metrics.getSummary()).toMatchObject({
      totalRequests: 24,
      cancelRate: 0,
      renderFailureRate: 0,
    });
    for (const result of results) {
      expect(result.key.inputs.visibility?.showQRCode).toBe(false);
      expect(h.local.has(result.key.hash)).toBe(true);
      const qrKey = deriveKey({
        ...result.key.inputs,
        visibility: { ...result.key.inputs.visibility, showQRCode: true },
      });
      expect(h.local.has(qrKey.hash)).toBe(false);
      expect(h.orchestrator.getCached(qrKey.hash)).toBeNull();
    }
  });

  it("reuses a cached QR image without replacing it with a preview", async () => {
    const h = harness();
    const key = deriveKey(input);
    h.local.set(key.hash, new Blob(["scannable QR card"]));
    const result = await h.orchestrator.getThumbnail({
      sequence,
      input,
      qrPolicy: "cache-only",
    });
    expect(result).toMatchObject({ fromCache: true, key: { hash: key.hash } });
    expect(h.render).not.toHaveBeenCalled();
  });

  it("shares a preview's cache with no-QR callers on later visits", async () => {
    const h = harness();
    const request = h.orchestrator.getThumbnail({
      sequence,
      input,
      qrPolicy: "cache-only",
      skipCache: true,
    });
    await vi.advanceTimersByTimeAsync(25);
    const preview = await request;
    const revisit = await h.orchestrator.getThumbnail({
      sequence,
      input,
      qrPolicy: "cache-only",
    });
    expect(revisit.url).toBe(preview.url);
    expect(revisit.fromCache).toBe(true);
    expect(h.render).toHaveBeenCalledOnce();
  });

  it("keeps the full QR path for warmers and explicit card renders", async () => {
    const h = harness();
    h.render.mockResolvedValue({ blob: new Blob(["QR"]), qrConsistent: true });
    const result = await h.orchestrator.getThumbnail({
      sequence,
      input,
      skipCache: true,
    });
    expect(result.key.inputs.visibility?.showQRCode).toBe(true);
    expect(h.local.has(deriveKey(input).hash)).toBe(true);
    expect(h.render).toHaveBeenCalledWith(
      sequence,
      expect.objectContaining({
        visibility: expect.objectContaining({ showQRCode: true }),
      }),
      undefined,
      expect.any(Function),
      expect.any(AbortSignal),
      expect.any(Function),
      expect.any(Function)
    );
  });
});
