// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { BackgroundVideoEncoder } from "$lib/shared/animation-engine/services/background-video-encoder";

// Stub Worker that never posts "ready" — simulates a stalled configure().
class SilentWorker {
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  postMessage() {} // swallow config; never reply
  terminate() {}
}

describe("BackgroundVideoEncoder.initialize timeout", () => {
  beforeEach(() => {
    vi.stubGlobal("Worker", SilentWorker as unknown as typeof Worker);
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("rejects when the worker never reports ready", async () => {
    const enc = new BackgroundVideoEncoder();
    const p = enc.initialize({
      width: 1080,
      height: 1080,
      fps: 60,
      bitrate: 1_000_000,
      totalFrames: 60,
    });
    const assertion = expect(p).rejects.toThrow(/timed out|ready/i);
    // Must clear BackgroundVideoEncoder.READY_TIMEOUT_MS (30s since the
    // "pause render loop before encoder init" fix raised it from 15s — a cold
    // mediabunny load can legitimately take >15s). Advancing less than the
    // ceiling never fires the timer, so the rejection never arrives.
    await vi.advanceTimersByTimeAsync(35_000);
    await assertion;
  });
});

class ProgressWorker {
  static current: ProgressWorker | null = null;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;

  constructor() {
    ProgressWorker.current = this;
  }

  postMessage(message: { type: string }) {
    if (message.type === "config") {
      queueMicrotask(() => this.emit({ type: "ready" }));
    }
  }

  emit(data: unknown) {
    this.onmessage?.({ data } as MessageEvent);
  }

  terminate() {}
}

describe("BackgroundVideoEncoder frame queue", () => {
  beforeEach(() => {
    vi.stubGlobal("Worker", ProgressWorker as unknown as typeof Worker);
  });

  afterEach(() => {
    ProgressWorker.current = null;
    vi.unstubAllGlobals();
  });

  it("releases a queued frame when input drains despite delayed output", async () => {
    const encoder = new BackgroundVideoEncoder();
    await encoder.initialize({
      width: 2,
      height: 2,
      fps: 30,
      bitrate: 1_000_000,
      totalFrames: 1,
    });
    encoder.addFrame(
      { data: new Uint8ClampedArray(16) } as ImageData,
      0,
      0,
      true
    );

    let drained = false;
    const wait = encoder.waitForFrameQueue(0).then(() => (drained = true));
    await Promise.resolve();
    expect(drained).toBe(false);

    ProgressWorker.current?.emit({ type: "progress", frameIndex: 0 });
    await Promise.resolve();
    expect(drained).toBe(false);

    ProgressWorker.current?.emit({ type: "dequeued", frameCount: 1 });
    await wait;
    expect(drained).toBe(true);
  });

  it("rejects a blocked wait on abort and ignores later acknowledgements", async () => {
    const encoder = new BackgroundVideoEncoder();
    await encoder.initialize({
      width: 2,
      height: 2,
      fps: 30,
      bitrate: 1_000_000,
      totalFrames: 1,
    });
    encoder.addFrame(
      { data: new Uint8ClampedArray(16) } as ImageData,
      0,
      0,
      true
    );
    const controller = new AbortController();
    const wait = encoder.waitForFrameQueue(0, controller.signal);
    controller.abort();
    await expect(wait).rejects.toThrow("Export cancelled");
    ProgressWorker.current?.emit({ type: "dequeued", frameCount: 1 });
    await expect(
      encoder.waitForFrameQueue(0, controller.signal)
    ).rejects.toThrow("Export cancelled");
  });

  it("rejects queue pressure on worker error and allows finish to flush delayed output", async () => {
    const encoder = new BackgroundVideoEncoder();
    await encoder.initialize({
      width: 2,
      height: 2,
      fps: 30,
      bitrate: 1_000_000,
      totalFrames: 1,
    });
    encoder.addFrame(
      { data: new Uint8ClampedArray(16) } as ImageData,
      0,
      0,
      true
    );
    const wait = encoder.waitForFrameQueue(0);
    ProgressWorker.current?.emit({ type: "error", error: "codec failed" });
    await expect(wait).rejects.toThrow("codec failed");
    await expect(encoder.finish()).rejects.toThrow("codec failed");
  });

  it("rejects a blocked queue wait on encoder cancellation", async () => {
    const encoder = new BackgroundVideoEncoder();
    await encoder.initialize({
      width: 2,
      height: 2,
      fps: 30,
      bitrate: 1_000_000,
      totalFrames: 1,
    });
    encoder.addFrame(
      { data: new Uint8ClampedArray(16) } as ImageData,
      0,
      0,
      true
    );
    const wait = encoder.waitForFrameQueue(0);
    encoder.cancel();
    await expect(wait).rejects.toThrow("Export cancelled");
  });

  it("finishes while encoded output is still delayed", async () => {
    const encoder = new BackgroundVideoEncoder();
    await encoder.initialize({
      width: 2,
      height: 2,
      fps: 30,
      bitrate: 1_000_000,
      totalFrames: 1,
    });
    encoder.addFrame(
      { data: new Uint8ClampedArray(16) } as ImageData,
      0,
      0,
      true
    );
    ProgressWorker.current?.emit({ type: "dequeued", frameCount: 1 });
    await encoder.waitForFrameQueue(0);
    const finished = encoder.finish();
    ProgressWorker.current?.emit({
      type: "complete",
      buffer: new Uint8Array([1, 2, 3]).buffer,
    });
    expect(new Uint8Array(await (await finished).arrayBuffer())).toEqual(
      new Uint8Array([1, 2, 3])
    );
  });
});
