// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkerEnvironmentRenderer } from "$lib/shared/3d/worker-renderer/services/worker-environment-renderer";

class FakeWorker {
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();
}

describe("live worker scene handoff", () => {
  let workers: FakeWorker[];
  let canvases: HTMLCanvasElement[];
  let frames: FrameRequestCallback[];

  beforeEach(() => {
    workers = [];
    canvases = [];
    frames = [];
    vi.stubGlobal("Worker", FakeWorker);
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe = vi.fn();
        disconnect = vi.fn();
      }
    );
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    Object.defineProperty(
      HTMLCanvasElement.prototype,
      "transferControlToOffscreen",
      {
        configurable: true,
        value: vi.fn(() => ({})),
      }
    );
    vi.spyOn(document, "createElement").mockImplementation((name: string) => {
      const element = document.createElementNS(
        "http://www.w3.org/1999/xhtml",
        name
      );
      if (name === "canvas") {
        const canvas = element as HTMLCanvasElement;
        vi.spyOn(canvas, "getContext").mockReturnValue(null);
        canvases.push(canvas);
      }
      return element;
    });
  });

  afterEach(() => {
    delete (
      HTMLCanvasElement.prototype as HTMLCanvasElement & {
        transferControlToOffscreen?: unknown;
      }
    ).transferControlToOffscreen;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function fixture() {
    const container = document.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "div"
    ) as HTMLElement;
    vi.spyOn(container, "getBoundingClientRect").mockReturnValue({
      width: 640,
      height: 360,
      left: 0,
      top: 0,
    } as DOMRect);
    const onFrame = vi.fn();
    const renderer = new WorkerEnvironmentRenderer({
      container,
      onFrame,
      createWorker: () => {
        const worker = new FakeWorker();
        workers.push(worker);
        return worker as unknown as Worker;
      },
    });
    return { renderer, onFrame };
  }

  function send(worker: FakeWorker, data: Record<string, unknown>) {
    worker.onmessage?.(new MessageEvent("message", { data }));
  }

  function flushFrame() {
    frames.shift()?.(performance.now());
  }

  function present(worker: FakeWorker, requestId: number, environment: string) {
    send(worker, { type: "first-frame", requestId, environment, metrics: {} });
    flushFrame();
  }

  function frame(worker: FakeWorker, requestId: number, environment: string) {
    send(worker, {
      type: "frame",
      requestId,
      environment,
      frame: 2,
      renderedAt: performance.now(),
      deltaMs: 16,
    });
  }

  it("keeps outgoing motion and state updates live throughout staging", () => {
    const { renderer, onFrame } = fixture();
    renderer.switchTo("ocean");
    present(workers[0]!, 1, "ocean");
    renderer.switchTo("rainbow");
    expect(workers).toHaveLength(2);
    expect(renderer.snapshot).toMatchObject({
      active: "ocean",
      staging: "rainbow",
      liveWorkers: 2,
      heldFrame: null,
    });
    renderer.setPerformers([]);
    expect(workers[0]!.postMessage.mock.calls.at(-1)?.[0]).toMatchObject({
      type: "performers",
      requestId: 1,
    });
    expect(workers[1]!.postMessage.mock.calls.at(-1)?.[0]).toMatchObject({
      type: "performers",
      requestId: 2,
    });
    frame(workers[0]!, 1, "ocean");
    expect(onFrame).toHaveBeenCalledOnce();
    expect(canvases[0]!.style.opacity).toBe("1");
    expect(canvases[2]!.style.opacity).toBe("0");
    present(workers[1]!, 2, "rainbow");
    expect(renderer.snapshot.lastMeasurement).toMatchObject({
      outgoingVisualMode: "animated",
      outgoingFrameSamples: 1,
    });
    renderer.dispose();
  });

  it("fans out camera, effects, quality, and viewport updates while staging", () => {
    const { renderer } = fixture();
    renderer.switchTo("ocean");
    present(workers[0]!, 1, "ocean");
    renderer.switchTo("rainbow");
    const camera = { fov: 50 } as Parameters<typeof renderer.setCamera>[0];
    renderer.setCamera(camera);
    renderer.setEffects({ playing: true, sources: [] });
    renderer.setQualityTier("low");
    renderer.setPixelRatio(1.5);
    for (const worker of workers) {
      const messages = worker.postMessage.mock.calls.map(
        ([message]) => message
      );
      expect(messages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: "camera", camera }),
          expect.objectContaining({
            type: "effects",
            effects: { playing: true, sources: [] },
          }),
          expect.objectContaining({ type: "quality", qualityTier: "low" }),
          expect.objectContaining({
            type: "resize",
            viewport: { width: 640, height: 360, dpr: 1.5 },
          }),
        ])
      );
    }
    expect(workers[1]!.postMessage.mock.calls[0]?.[0]).toMatchObject({
      type: "initialize",
      retainSceneCache: false,
    });
    renderer.dispose();
  });

  it("does not pass frame continuity when outgoing worker goes silent", () => {
    const { renderer } = fixture();
    renderer.switchTo("ocean");
    present(workers[0]!, 1, "ocean");
    renderer.switchTo("rainbow");
    present(workers[1]!, 2, "rainbow");
    expect(renderer.snapshot.lastMeasurement).toMatchObject({
      outgoingFrameSamples: 0,
      outgoingVisualMode: "held-frame",
      passedFrameGate: false,
    });
    renderer.dispose();
  });

  it("bounds rapid superseded choices to two live workers", () => {
    const { renderer } = fixture();
    renderer.switchTo("ocean");
    present(workers[0]!, 1, "ocean");
    renderer.switchTo("rainbow");
    renderer.switchTo("celestial");
    expect(workers).toHaveLength(3);
    expect(workers[1]!.terminate).toHaveBeenCalledOnce();
    expect(renderer.snapshot).toMatchObject({
      active: "ocean",
      staging: "celestial",
      liveWorkers: 2,
    });
    renderer.switchTo("ocean");
    expect(workers[2]!.terminate).toHaveBeenCalledOnce();
    expect(renderer.snapshot).toMatchObject({
      active: "ocean",
      staging: null,
      liveWorkers: 1,
    });
    renderer.dispose();
  });

  it("finishes an interrupted fade before staging another scene", () => {
    const { renderer } = fixture();
    renderer.switchTo("ocean");
    present(workers[0]!, 1, "ocean");
    renderer.switchTo("rainbow");
    present(workers[1]!, 2, "rainbow");
    expect(canvases[0]!.style.opacity).toBe("1");
    expect(canvases[2]!.style.zIndex).toBe("2");
    renderer.switchTo("celestial");
    expect(canvases[2]!.style.opacity).toBe("1");
    expect(canvases[2]!.style.transition).toBe("none");
    expect(renderer.snapshot.liveWorkers).toBe(2);
    renderer.dispose();
  });

  it("keeps the outgoing scene animated after staging failure and retries", () => {
    const { renderer, onFrame } = fixture();
    renderer.switchTo("ocean");
    present(workers[0]!, 1, "ocean");
    renderer.switchTo("rainbow");
    send(workers[1]!, {
      type: "error",
      requestId: 2,
      environment: "rainbow",
      message: "failed",
    });
    expect(workers[1]!.terminate).toHaveBeenCalledOnce();
    expect(workers).toHaveLength(3);
    frame(workers[0]!, 1, "ocean");
    expect(onFrame).toHaveBeenCalledOnce();
    send(workers[2]!, {
      type: "error",
      requestId: 2,
      environment: "rainbow",
      message: "failed again",
    });
    expect(renderer.snapshot).toMatchObject({
      active: "ocean",
      phase: "error",
      liveWorkers: 1,
    });
    frame(workers[0]!, 1, "ocean");
    expect(onFrame).toHaveBeenCalledTimes(2);
    renderer.dispose();
  });

  it("resumes a hidden previous world only after its next live frame", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { renderer } = fixture();
    renderer.switchTo("ocean");
    present(workers[0]!, 1, "ocean");
    renderer.switchTo("rainbow");
    present(workers[1]!, 2, "rainbow");
    vi.advanceTimersByTime(160);
    expect(renderer.snapshot.liveWorkers).toBe(2);
    renderer.switchTo("ocean");
    expect(workers).toHaveLength(2);
    expect(renderer.snapshot.active).toBe("rainbow");
    frame(workers[0]!, 1, "ocean");
    expect(renderer.snapshot.phase).toBe("booting");
    frame(workers[0]!, 3, "ocean");
    flushFrame();
    expect(renderer.snapshot.active).toBe("ocean");
    expect(renderer.snapshot.lastMeasurement?.workerBoot.warmReuse).toBe(true);
    renderer.dispose();
  });

  it("rebuilds a third scene in the idle worker without booting another context", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { renderer, onFrame } = fixture();
    renderer.switchTo("ocean");
    present(workers[0]!, 1, "ocean");
    renderer.switchTo("rainbow");
    present(workers[1]!, 2, "rainbow");
    vi.advanceTimersByTime(160);

    renderer.setEffects({ playing: true, sources: [] });
    renderer.switchTo("celestial");
    expect(workers).toHaveLength(2);
    expect(workers[0]!.terminate).not.toHaveBeenCalled();
    expect(
      workers[0]!.postMessage.mock.calls.map(([message]) => message)
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "camera",
          requestId: 3,
        }),
        expect.objectContaining({
          type: "switch-environment",
          requestId: 3,
          environment: "celestial",
          backgroundPreparation: true,
        }),
        expect.objectContaining({
          type: "effects",
          effects: { playing: true, sources: [] },
        }),
      ])
    );
    expect(renderer.snapshot).toMatchObject({
      active: "rainbow",
      staging: "celestial",
      liveWorkers: 2,
    });
    frame(workers[1]!, 2, "rainbow");
    expect(onFrame).toHaveBeenCalledOnce();

    send(workers[0]!, {
      type: "first-frame",
      requestId: 3,
      environment: "celestial",
      metrics: { warmReuse: false, rendererMs: 0 },
    });
    expect(renderer.snapshot.active).toBe("rainbow");
    expect(workers[0]!.postMessage.mock.calls.at(-1)?.[0]).toMatchObject({
      type: "visibility",
      requestId: 3,
      visible: true,
    });
    frame(workers[0]!, 1, "ocean");
    expect(renderer.snapshot.active).toBe("rainbow");
    frame(workers[0]!, 3, "celestial");
    flushFrame();
    expect(renderer.snapshot).toMatchObject({
      active: "celestial",
      liveWorkers: 2,
      lastMeasurement: {
        liveWorkersAtSwap: 2,
        workerBoot: { warmReuse: false },
      },
    });
    renderer.dispose();
  });

  it("cancels idle worker rebuilding when the active scene is reselected", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { renderer, onFrame } = fixture();
    renderer.switchTo("ocean");
    present(workers[0]!, 1, "ocean");
    renderer.switchTo("rainbow");
    present(workers[1]!, 2, "rainbow");
    vi.advanceTimersByTime(160);
    renderer.switchTo("celestial");
    renderer.switchTo("rainbow");
    expect(workers).toHaveLength(2);
    expect(workers[0]!.terminate).toHaveBeenCalledOnce();
    expect(renderer.snapshot).toMatchObject({
      active: "rainbow",
      staging: null,
      liveWorkers: 1,
    });
    frame(workers[1]!, 2, "rainbow");
    expect(onFrame).toHaveBeenCalledOnce();
    renderer.dispose();
  });

  it("retries a failed idle-worker rebuild without stopping the outgoing scene", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { renderer, onFrame } = fixture();
    renderer.switchTo("ocean");
    present(workers[0]!, 1, "ocean");
    renderer.switchTo("rainbow");
    present(workers[1]!, 2, "rainbow");
    vi.advanceTimersByTime(160);
    renderer.switchTo("celestial");
    send(workers[0]!, {
      type: "error",
      requestId: 3,
      environment: "celestial",
      message: "scene failed",
    });
    expect(workers[0]!.terminate).toHaveBeenCalledOnce();
    expect(workers).toHaveLength(3);
    expect(renderer.snapshot).toMatchObject({
      active: "rainbow",
      staging: "celestial",
      liveWorkers: 2,
    });
    frame(workers[1]!, 2, "rainbow");
    expect(onFrame).toHaveBeenCalledOnce();
    renderer.dispose();
  });

  it("discards a lost cached context before returning to that scene", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { renderer } = fixture();
    renderer.switchTo("ocean");
    present(workers[0]!, 1, "ocean");
    renderer.switchTo("rainbow");
    present(workers[1]!, 2, "rainbow");
    vi.advanceTimersByTime(160);
    send(workers[0]!, { type: "context-lost", requestId: 1 });
    expect(workers[0]!.terminate).toHaveBeenCalledOnce();
    renderer.switchTo("ocean");
    expect(workers).toHaveLength(3);
    expect(renderer.snapshot.liveWorkers).toBe(2);
    renderer.dispose();
  });

  it("clears a failed active worker so the caller can fall back", () => {
    const { renderer } = fixture();
    renderer.switchTo("ocean");
    present(workers[0]!, 1, "ocean");
    send(workers[0]!, {
      type: "context-lost",
      requestId: 1,
      environment: "ocean",
    });
    expect(workers[0]!.terminate).toHaveBeenCalledOnce();
    expect(renderer.snapshot).toMatchObject({
      active: null,
      phase: "error",
      liveWorkers: 0,
    });
    renderer.dispose();
  });

  it("keeps a live outgoing worker when creating staging fails", () => {
    const { renderer, onFrame } = fixture();
    renderer.switchTo("ocean");
    present(workers[0]!, 1, "ocean");
    vi.spyOn(document, "createElement").mockImplementationOnce(() => {
      throw new Error("no canvas");
    });
    renderer.switchTo("rainbow");
    expect(renderer.snapshot).toMatchObject({
      active: "ocean",
      phase: "error",
      liveWorkers: 1,
    });
    frame(workers[0]!, 1, "ocean");
    expect(onFrame).toHaveBeenCalledOnce();
    renderer.dispose();
  });
});
