// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkerRendererSlot } from "$lib/shared/3d/worker-renderer/services/worker-renderer-slot";

class FakeWorker {
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();
}

function fakeCanvas(kind: "render" | "poster") {
  const bitmapContext = { transferFromImageBitmap: vi.fn() };
  const canvas = {
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
  } as unknown as HTMLCanvasElement;
  return { canvas, bitmapContext };
}

describe("worker renderer slot", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(document, "createElement");
  });

  afterEach(() => {
    delete document.documentElement.dataset.motionPreference;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function fixture() {
    const workers: FakeWorker[] = [];
    const render = fakeCanvas("render");
    const poster = fakeCanvas("poster");
    vi.mocked(document.createElement)
      .mockReturnValueOnce(render.canvas)
      .mockReturnValueOnce(poster.canvas);
    const container = {
      append: vi.fn(),
      insertBefore: vi.fn(),
    } as unknown as HTMLElement;
    const onDestroyed = vi.fn();
    const onMessage = vi.fn();
    const slot = new WorkerRendererSlot({
      container,
      state: {
        id: "a",
        requestId: 7,
        environment: "rainbow",
        status: "booting",
      },
      viewport: { width: 640, height: 360, dpr: 1 },
      camera: { position: [0, 2, 8], target: [0, 0, 0], fov: 45 },
      qualityTier: "medium",
      createWorker: () => {
        const worker = new FakeWorker();
        workers.push(worker);
        return worker as unknown as Worker;
      },
      onMessage,
      onError: vi.fn(),
      onDestroyed,
    });
    return {
      workers,
      render,
      poster,
      container,
      onDestroyed,
      onMessage,
      slot,
    };
  }

  it("transfers one render canvas and keeps a separate hidden poster", () => {
    const { workers, render, poster, container } = fixture();

    expect(container.append).toHaveBeenCalledWith(render.canvas, poster.canvas);
    expect(workers[0]?.postMessage).toHaveBeenCalledTimes(1);
    expect(workers[0]?.postMessage.mock.calls[0]?.[0]).toMatchObject({
      type: "initialize",
      requestId: 7,
      environment: "rainbow",
      qualityTier: "medium",
    });
    expect(workers[0]?.postMessage.mock.calls[0]?.[1]).toHaveLength(1);
    expect(poster.canvas.style.opacity).toBe("0");
  });

  it("installs a transferred bitmap above the live render canvas", () => {
    const { poster, slot } = fixture();
    const bitmap = { close: vi.fn() } as unknown as ImageBitmap;

    slot.installPoster(bitmap);

    expect(poster.bitmapContext.transferFromImageBitmap).toHaveBeenCalledWith(
      bitmap
    );
    expect(poster.canvas.style.opacity).toBe("1");
    expect(bitmap.close).not.toHaveBeenCalled();

    slot.clearPoster();
    expect(poster.canvas.style.opacity).toBe("0");
  });

  it("fades a completed poster while keeping it available for an interrupted switch", () => {
    const { poster, slot } = fixture();
    const bitmap = { close: vi.fn() } as unknown as ImageBitmap;
    const replacement = fakeCanvas("render");
    vi.mocked(document.createElement).mockReturnValueOnce(replacement.canvas);
    slot.installPoster(bitmap);

    slot.clearPoster();
    expect(poster.canvas.style.opacity).toBe("0");
    expect(slot.isPosterVisible).toBe(true);

    slot.restart({
      state: {
        id: "a",
        requestId: 8,
        environment: "ocean",
        status: "booting",
      },
      viewport: { width: 800, height: 450, dpr: 1 },
      camera: { position: [0, 3, 9], target: [0, 0, 0], fov: 50 },
      qualityTier: "high",
    });
    vi.advanceTimersByTime(200);

    expect(poster.canvas.style.opacity).toBe("1");
    expect(slot.isPosterVisible).toBe(true);
  });

  it("reveals immediately when reduced motion is requested", () => {
    const { poster, slot } = fixture();
    slot.installPoster({ close: vi.fn() } as unknown as ImageBitmap);
    document.documentElement.dataset.motionPreference = "reduce";

    slot.clearPoster();

    expect(poster.canvas.style.opacity).toBe("0");
    expect(slot.isPosterVisible).toBe(false);
  });

  it("keeps the poster while replacing a failed worker session", () => {
    const { workers, poster, render, container, slot } = fixture();
    const replacement = fakeCanvas("render");
    vi.mocked(document.createElement).mockReturnValueOnce(replacement.canvas);
    const bitmap = { close: vi.fn() } as unknown as ImageBitmap;
    slot.installPoster(bitmap);

    slot.restart({
      state: {
        id: "a",
        requestId: 8,
        environment: "ocean",
        status: "booting",
      },
      viewport: { width: 800, height: 450, dpr: 1 },
      camera: { position: [0, 3, 9], target: [0, 0, 0], fov: 50 },
      qualityTier: "high",
    });

    expect(workers).toHaveLength(2);
    expect(workers[0]?.terminate).toHaveBeenCalledOnce();
    expect(render.canvas.remove).toHaveBeenCalledOnce();
    expect(container.insertBefore).toHaveBeenCalledWith(
      replacement.canvas,
      poster.canvas
    );
    expect(poster.canvas.remove).not.toHaveBeenCalled();
    expect(poster.canvas.style.opacity).toBe("1");
    expect(workers[1]?.postMessage.mock.calls[0]?.[0]).toMatchObject({
      type: "initialize",
      requestId: 8,
      environment: "ocean",
    });
  });

  it("passes session messages to the one persistent worker", () => {
    const { workers, slot } = fixture();

    slot.post({
      type: "quality",
      requestId: 7,
      qualityTier: "low",
    });

    expect(workers[0]?.postMessage).toHaveBeenLastCalledWith(
      {
        type: "quality",
        requestId: 7,
        qualityTier: "low",
      },
      []
    );
  });

  it("keeps the current canvas when a non-cloneable session update is rejected", () => {
    const { workers, render, slot } = fixture();
    workers[0]?.postMessage.mockImplementationOnce(() => {
      throw new DOMException("Could not be cloned", "DataCloneError");
    });

    const sent = slot.post({
      type: "performers",
      requestId: 7,
      performers: [],
    });

    expect(sent).toBe(false);
    expect(render.canvas.remove).not.toHaveBeenCalled();
    expect(workers[0]?.terminate).not.toHaveBeenCalled();
  });

  it("destroys once when the worker acknowledges terminal disposal", () => {
    const { workers, render, poster, onDestroyed, slot } = fixture();
    const after = vi.fn();

    slot.destroy(after);
    workers[0]?.onmessage?.(
      new MessageEvent("message", {
        data: { type: "disposed", requestId: 7 },
      })
    );
    vi.advanceTimersByTime(200);

    expect(workers[0]?.terminate).toHaveBeenCalledOnce();
    expect(render.canvas.remove).toHaveBeenCalledOnce();
    expect(poster.canvas.remove).toHaveBeenCalledOnce();
    expect(onDestroyed).toHaveBeenCalledOnce();
    expect(after).toHaveBeenCalledOnce();
  });

  it("force-terminates a worker that does not acknowledge disposal", () => {
    const { workers, onDestroyed, slot } = fixture();
    const after = vi.fn();

    slot.destroy(after);
    vi.advanceTimersByTime(100);

    expect(workers[0]?.terminate).toHaveBeenCalledOnce();
    expect(onDestroyed).toHaveBeenCalledOnce();
    expect(after).toHaveBeenCalledOnce();
  });
});
