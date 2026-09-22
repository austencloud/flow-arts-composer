// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { WorkerEnvironmentRenderer } from "$lib/shared/3d/worker-renderer/services/worker-environment-renderer";

class FakeWorker {
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();
}

function fakeCanvas(kind: "render" | "poster") {
  const bitmapContext = { transferFromImageBitmap: vi.fn() };
  return {
    canvas: {
      className: "",
      style: {} as CSSStyleDeclaration,
      width: 300,
      height: 150,
      setAttribute: vi.fn(),
      transferControlToOffscreen: vi.fn(() => ({ width: 1, height: 1 })),
      getContext: vi.fn((type: string) =>
        kind === "poster" && type === "bitmaprenderer" ? bitmapContext : null
      ),
      remove: vi.fn(),
    } as unknown as HTMLCanvasElement,
    bitmapContext,
  };
}

describe("worker renderer adaptive quality", () => {
  let frames: Array<{ id: number; callback: FrameRequestCallback }>;
  let nextFrameId: number;

  beforeEach(() => {
    frames = [];
    nextFrameId = 1;
    vi.stubGlobal("Worker", FakeWorker);
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      const id = nextFrameId++;
      frames.push({ id, callback });
      return id;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => {
      frames = frames.filter((frame) => frame.id !== id);
    });
    vi.spyOn(document, "createElement");
    Object.defineProperty(
      window.HTMLCanvasElement.prototype,
      "transferControlToOffscreen",
      {
        configurable: true,
        value: vi.fn(),
      }
    );
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe = vi.fn();
        disconnect = vi.fn();
      }
    );
  });

  afterEach(() => {
    delete (
      window.HTMLCanvasElement.prototype as HTMLCanvasElement & {
        transferControlToOffscreen?: unknown;
      }
    ).transferControlToOffscreen;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function flushFrame() {
    frames.shift()?.callback(performance.now());
  }

  function fixture() {
    const workers: FakeWorker[] = [];
    const render = fakeCanvas("render");
    const poster = fakeCanvas("poster");
    vi.mocked(document.createElement)
      .mockReturnValueOnce(render.canvas)
      .mockReturnValueOnce(poster.canvas);
    const onSnapshot = vi.fn();
    const onFrame = vi.fn();
    const container = {
      append: vi.fn(),
      insertBefore: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      getBoundingClientRect: vi.fn(() => ({
        width: 640,
        height: 360,
        left: 0,
        top: 0,
      })),
    } as unknown as HTMLElement;
    const renderer = new WorkerEnvironmentRenderer({
      container,
      onSnapshot,
      onFrame,
      createWorker: () => {
        const worker = new FakeWorker();
        workers.push(worker);
        return worker as unknown as Worker;
      },
    });
    return { workers, render, poster, renderer, onSnapshot, onFrame };
  }

  function send(worker: FakeWorker, data: Record<string, unknown>): void {
    worker.onmessage?.(new MessageEvent("message", { data }));
  }

  function present(
    worker: FakeWorker,
    requestId: number,
    environment: string
  ): void {
    send(worker, {
      type: "first-frame",
      requestId,
      environment,
      metrics: {},
    });
    flushFrame();
  }

  it("prepares a likely choice without changing the selected scene or starting another worker", () => {
    const { workers, renderer } = fixture();
    renderer.switchTo("ocean");
    const worker = workers[0]!;
    renderer.prefetch("winter");
    expect(
      worker.postMessage.mock.calls.some(
        ([message]) => message.type === "prefetch-environment"
      )
    ).toBe(false);
    present(worker, 1, "ocean");
    renderer.prefetch("winter");
    expect(worker.postMessage).toHaveBeenLastCalledWith(
      { type: "prefetch-environment", requestId: 1, environment: "winter" },
      []
    );
    expect(renderer.snapshot).toMatchObject({
      active: "ocean",
      staging: null,
      phase: "idle",
      liveWorkers: 1,
    });
    expect(workers).toHaveLength(1);
    renderer.dispose();
  });

  it("respects Data Saver when preparing an unselected scene", () => {
    const { workers, renderer } = fixture();
    renderer.switchTo("ocean");
    const worker = workers[0]!;
    present(worker, 1, "ocean");
    vi.stubGlobal("navigator", {
      onLine: true,
      connection: { saveData: true },
    });
    worker.postMessage.mockClear();
    renderer.prefetch("winter");
    expect(worker.postMessage).not.toHaveBeenCalled();
    renderer.dispose();
  });

  it("reuses one worker while applying quality to this and later scenes", () => {
    const { workers, renderer } = fixture();
    renderer.switchTo("ocean");
    const worker = workers[0]!;

    renderer.setQualityTier("low");
    expect(worker.postMessage).toHaveBeenLastCalledWith(
      { type: "quality", requestId: 1, qualityTier: "low" },
      []
    );
    present(worker, 1, "ocean");

    renderer.switchTo("rainbow");
    expect(workers).toHaveLength(1);
    expect(worker.postMessage).toHaveBeenLastCalledWith(
      {
        type: "switch-environment",
        requestId: 2,
        environment: "rainbow",
        // Every environment start carries the motion preference now, not just
        // the first slot boot (5cb43b1e80). jsdom reports no reduce request.
        reducedMotion: false,
      },
      []
    );
    renderer.dispose();
  });

  it("reports cadence only while the worker canvas is the live surface", () => {
    const { workers, renderer, onFrame } = fixture();
    renderer.switchTo("ocean");
    const worker = workers[0]!;
    present(worker, 1, "ocean");

    send(worker, {
      type: "frame",
      requestId: 1,
      environment: "ocean",
      frame: 2,
      renderedAt: 100,
      deltaMs: 24,
    });
    renderer.switchTo("rainbow");
    send(worker, {
      type: "frame",
      requestId: 1,
      environment: "ocean",
      frame: 3,
      renderedAt: 120,
      deltaMs: 99,
    });

    expect(onFrame).toHaveBeenCalledOnce();
    expect(onFrame).toHaveBeenCalledWith(24);
    renderer.dispose();
  });

  it("holds a real bitmap poster while the same worker builds the next scene", () => {
    const { workers, poster, renderer } = fixture();
    renderer.switchTo("ocean");
    const worker = workers[0]!;
    present(worker, 1, "ocean");
    renderer.switchTo("rainbow");
    const bitmap = { close: vi.fn() } as unknown as ImageBitmap;

    send(worker, {
      type: "poster",
      requestId: 2,
      environment: "ocean",
      bitmap,
    });

    expect(workers).toHaveLength(1);
    expect(worker.terminate).not.toHaveBeenCalled();
    expect(poster.bitmapContext.transferFromImageBitmap).toHaveBeenCalledWith(
      bitmap
    );
    expect(renderer.snapshot).toMatchObject({
      active: "ocean",
      staging: "rainbow",
      heldFrame: "ocean",
      liveWorkers: 1,
    });
    flushFrame();
    expect(worker.postMessage).toHaveBeenLastCalledWith(
      { type: "poster-ready", requestId: 2 },
      []
    );

    present(worker, 2, "rainbow");
    expect(poster.canvas.style.opacity).toBe("0");
    expect(renderer.snapshot).toMatchObject({
      active: "rainbow",
      staging: null,
      heldFrame: null,
      liveWorkers: 1,
      lastMeasurement: {
        outgoingVisualMode: "held-frame",
        liveWorkersAtSwap: 1,
        liveWorkersAfterCleanup: 1,
        passedWorkerBound: true,
      },
    });
    renderer.dispose();
  });

  it("does not reveal a stale first frame from a different environment", () => {
    const { workers, poster, renderer } = fixture();
    renderer.switchTo("ocean");
    const worker = workers[0]!;
    present(worker, 1, "ocean");
    renderer.switchTo("rainbow");
    send(worker, {
      type: "poster",
      requestId: 2,
      environment: "ocean",
      bitmap: { close: vi.fn() } as unknown as ImageBitmap,
    });
    flushFrame();

    send(worker, {
      type: "first-frame",
      requestId: 2,
      environment: "celestial",
      metrics: {},
    });
    flushFrame();

    expect(poster.canvas.style.opacity).toBe("1");
    expect(renderer.snapshot).toMatchObject({
      active: "ocean",
      staging: "rainbow",
      heldFrame: "ocean",
    });
    renderer.dispose();
  });

  it("records request phases and ignores an obsolete worker failure", () => {
    const { workers, renderer } = fixture();
    renderer.switchTo("ocean");
    const worker = workers[0]!;
    send(worker, {
      type: "booting",
      requestId: 1,
      environment: "ocean",
      acceptedAt: 10,
    });
    send(worker, {
      type: "progress",
      requestId: 1,
      phase: "construct",
      fraction: 0.5,
    });
    present(worker, 1, "ocean");
    flushFrame();

    renderer.switchTo("rainbow");
    renderer.switchTo("celestial");
    send(worker, {
      type: "error",
      requestId: 2,
      environment: "rainbow",
      message: "obsolete build failed",
    });

    expect(renderer.snapshot.currentRequest).toMatchObject({
      requestId: 3,
      environment: "celestial",
      phase: "poster",
    });
    expect(renderer.snapshot.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "requested", requestId: 1 }),
        expect.objectContaining({ kind: "started", requestId: 1 }),
        expect.objectContaining({
          kind: "phase",
          requestId: 1,
          phase: "construct",
        }),
        expect.objectContaining({ kind: "ready", requestId: 1 }),
        expect.objectContaining({ kind: "cancelled", requestId: 2 }),
        expect.objectContaining({
          kind: "ignored",
          requestId: 2,
          environment: "rainbow",
          detail: "obsolete build failed",
        }),
      ])
    );
    renderer.dispose();
  });

  it("retries the same destination after its recovery budget is exhausted", () => {
    const { workers, poster, renderer } = fixture();
    renderer.switchTo("ocean");
    const firstWorker = workers[0]!;
    present(firstWorker, 1, "ocean");
    renderer.switchTo("rainbow");
    send(firstWorker, {
      type: "poster",
      requestId: 2,
      environment: "ocean",
      bitmap: { close: vi.fn() } as unknown as ImageBitmap,
    });
    flushFrame();

    const recoveryCanvas = fakeCanvas("render");
    const retryCanvas = fakeCanvas("render");
    vi.mocked(document.createElement)
      .mockReturnValueOnce(recoveryCanvas.canvas)
      .mockReturnValueOnce(retryCanvas.canvas);
    send(firstWorker, {
      type: "error",
      requestId: 2,
      environment: "rainbow",
      message: "first failure",
    });
    send(workers[1]!, {
      type: "error",
      requestId: 2,
      environment: "rainbow",
      message: "second failure",
    });

    expect(renderer.snapshot.phase).toBe("error");
    expect(poster.canvas.style.opacity).toBe("1");
    renderer.setPerformers([]);
    expect(renderer.snapshot.lastError).toBe("second failure");
    renderer.switchTo("rainbow");

    expect(workers).toHaveLength(3);
    expect(workers[2]?.postMessage.mock.calls[0]?.[0]).toMatchObject({
      type: "initialize",
      requestId: 3,
      environment: "rainbow",
    });
    expect(renderer.snapshot).toMatchObject({
      phase: "booting",
      staging: "rainbow",
      heldFrame: "ocean",
      currentRequest: { requestId: 3, environment: "rainbow" },
    });
    expect(renderer.snapshot.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "failed",
          requestId: 2,
          detail: "second failure",
        }),
        expect.objectContaining({ kind: "cancelled", requestId: 2 }),
        expect.objectContaining({
          kind: "retrying",
          requestId: 3,
          detail: "retry after failure",
        }),
      ])
    );
    renderer.dispose();
  });

  it("keeps only the latest bounded lifecycle diagnostics", () => {
    const { renderer } = fixture();
    const environments = ["ocean", "rainbow"] as const;

    for (let index = 0; index < 25; index += 1) {
      renderer.switchTo(environments[index % environments.length]!);
    }

    expect(renderer.snapshot.events).toHaveLength(40);
    expect(renderer.snapshot.events.at(-1)).toMatchObject({
      kind: "requested",
      requestId: 25,
      environment: "ocean",
    });
    renderer.dispose();
  });

  it("cancels obsolete rapid choices under the installed poster", () => {
    const { workers, poster, renderer } = fixture();
    renderer.switchTo("ocean");
    const worker = workers[0]!;
    present(worker, 1, "ocean");

    renderer.switchTo("rainbow");
    renderer.switchTo("celestial");
    const replacement = fakeCanvas("render");
    vi.mocked(document.createElement).mockReturnValueOnce(replacement.canvas);
    const bitmap = { close: vi.fn() } as unknown as ImageBitmap;
    send(worker, {
      type: "poster",
      requestId: 2,
      environment: "ocean",
      bitmap,
    });
    flushFrame();

    expect(workers).toHaveLength(2);
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(poster.canvas.style.opacity).toBe("1");
    expect(workers[1]?.postMessage.mock.calls[0]?.[0]).toMatchObject({
      type: "initialize",
      requestId: 3,
      environment: "celestial",
    });
    expect(renderer.snapshot).toMatchObject({
      active: "ocean",
      staging: "celestial",
      heldFrame: "ocean",
      liveWorkers: 1,
    });
    send(workers[1]!, {
      type: "first-frame",
      requestId: 3,
      environment: "celestial",
      metrics: {},
    });
    flushFrame();

    expect(poster.canvas.style.opacity).toBe("0");
    expect(renderer.snapshot).toMatchObject({
      active: "celestial",
      staging: null,
      heldFrame: null,
    });
    renderer.dispose();
  });

  it("retains the poster across the one allowed context-loss recovery", () => {
    const { workers, render, poster, renderer } = fixture();
    renderer.switchTo("ocean");
    const firstWorker = workers[0]!;
    present(firstWorker, 1, "ocean");
    renderer.switchTo("rainbow");
    send(firstWorker, {
      type: "poster",
      requestId: 2,
      environment: "ocean",
      bitmap: { close: vi.fn() } as unknown as ImageBitmap,
    });
    flushFrame();

    const replacement = fakeCanvas("render");
    vi.mocked(document.createElement).mockReturnValueOnce(replacement.canvas);
    send(firstWorker, {
      type: "context-lost",
      requestId: 2,
      environment: "rainbow",
    });

    expect(workers).toHaveLength(2);
    expect(firstWorker.terminate).toHaveBeenCalledOnce();
    expect(render.canvas.remove).toHaveBeenCalledOnce();
    expect(poster.canvas.remove).not.toHaveBeenCalled();
    expect(poster.canvas.style.opacity).toBe("1");
    expect(workers[1]?.postMessage.mock.calls[0]?.[0]).toMatchObject({
      type: "initialize",
      requestId: 2,
      environment: "rainbow",
    });
    renderer.dispose();
  });

  it("coalesces worker progress into one application update per frame", () => {
    const { workers, renderer, onSnapshot } = fixture();
    renderer.switchTo("ocean");
    const beforeProgress = onSnapshot.mock.calls.length;

    for (const fraction of [0.1, 0.2, 0.3, 0.4]) {
      send(workers[0]!, {
        type: "progress",
        requestId: 1,
        phase: "prime",
        fraction,
      });
    }

    expect(onSnapshot).toHaveBeenCalledTimes(beforeProgress);
    expect(frames).toHaveLength(1);
    flushFrame();
    expect(onSnapshot).toHaveBeenCalledTimes(beforeProgress + 1);
    expect(renderer.snapshot).toMatchObject({
      progressPhase: "prime",
      progress: 0.4,
    });
    renderer.dispose();
  });

  it("keeps the worker's authored Ocean defaults while applying tier gates", () => {
    const source = readFileSync(
      resolve(
        process.cwd(),
        "src/lib/shared/3d/worker-renderer/workers/environment-renderer.worker.ts"
      ),
      "utf8"
    );

    expect(source).toContain("enabled: quality.composerEnabled");
    expect(source).toContain("tierBloom: quality.tierBloom");
    expect(source).toContain("enableShadows: quality.enableShadows");
    expect(source).toContain(
      "tierBloomResolutionScale: quality.bloomResolutionScale"
    );
    expect(source).toContain("tierBloomLevels: quality.bloomLevels");
    expect(source).toContain("oceanBloom: true");
    expect(source).toContain("oceanWaterTint: true");
    expect(source).toContain("oceanWaterTintStrength: 0.8");
    expect(source).toContain("oceanUnderwaterDistortion: false");
    expect(source).toContain("? WORKER_PREPARATION_VIEWPORT");
    expect(source).toContain("preparingFirstFrame = false");
    expect(source.indexOf("preparingFirstFrame = false")).toBeLessThan(
      source.indexOf("const firstRenderStartedAt")
    );
    expect(source).toContain('case "quality":');
    expect(source).toContain(
      "activeRenderer.setRenderTarget(previousRenderTarget);"
    );
    expect(source).toMatch(
      /try \{[\s\S]*warmWorkerRenderer[\s\S]*finally \{[\s\S]*activeRenderer\.setRenderTarget\(previousRenderTarget\);/
    );
  });
});
