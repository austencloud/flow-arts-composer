/**
 * CameraManager lifecycle contract.
 *
 * These tests exercise the close/restart races that decide whether the camera
 * light goes out when the user leaves a camera surface. The browser only
 * releases a camera when every track of the stream is stopped, and
 * `getUserMedia` can resolve long after the panel that asked for it is gone
 * (a permission prompt sitting open, a slow USB camera). Fake tracks plus a
 * deferred `getUserMedia` reproduce those orderings deterministically; none of
 * this needs a real device.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { CameraManager } from "./camera-manager";

interface FakeTrack {
  kind: string;
  readyState: "live" | "ended";
  stop: () => void;
}

interface FakeStream {
  id: string;
  getTracks: () => FakeTrack[];
}

function createFakeStream(id: string): FakeStream {
  const track: FakeTrack = {
    kind: "video",
    readyState: "live",
    stop: () => {
      track.readyState = "ended";
    },
  };
  return { id, getTracks: () => [track] };
}

function isLive(stream: FakeStream): boolean {
  return stream.getTracks().some((track) => track.readyState === "live");
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Let every queued microtask (and promise chain) settle. */
async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 8; i++) await Promise.resolve();
}

function createFakeVideoElement() {
  let playDeferred: Deferred<void> | null = null;
  const element = {
    style: {} as Record<string, string>,
    muted: false,
    srcObject: null as unknown,
    videoWidth: 1280,
    videoHeight: 720,
    readyState: 4,
    setAttribute: vi.fn(),
    play: vi.fn(() => {
      playDeferred = deferred<void>();
      return playDeferred.promise;
    }),
    finishPlay: () => playDeferred?.resolve(),
    get isPlayPending() {
      return playDeferred !== null;
    },
  };
  return element;
}

describe("CameraManager lifecycle", () => {
  let getUserMedia: ReturnType<typeof vi.fn>;
  let videoElement: ReturnType<typeof createFakeVideoElement>;
  let originalCreateElement: typeof document.createElement;
  let originalOffscreenCanvas: unknown;

  beforeEach(() => {
    videoElement = createFakeVideoElement();
    originalCreateElement = document.createElement;
    // The shared jsdom setup returns a bare stub for every tag; the camera
    // needs a video element that can actually play.
    document.createElement = ((tagName: string) =>
      tagName.toLowerCase() === "video"
        ? videoElement
        : originalCreateElement.call(document, tagName)) as typeof document.createElement;

    getUserMedia = vi.fn();
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia,
        enumerateDevices: vi.fn(async () => []),
      },
    });

    originalOffscreenCanvas = (globalThis as { OffscreenCanvas?: unknown })
      .OffscreenCanvas;
    (globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas = class {
      width: number;
      height: number;
      constructor(width: number, height: number) {
        this.width = width;
        this.height = height;
      }
      getContext() {
        return { drawImage: vi.fn(), getImageData: vi.fn() };
      }
    };
  });

  afterEach(() => {
    document.createElement = originalCreateElement;
    (globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas =
      originalOffscreenCanvas;
    vi.restoreAllMocks();
  });

  it("releases a stream that arrives after the camera was stopped", async () => {
    const camera = new CameraManager();
    await camera.initialize();

    const pending = deferred<FakeStream>();
    getUserMedia.mockReturnValue(pending.promise);

    const start = camera.start().catch((error: unknown) => error);

    // The user closed the panel while the permission prompt was still open.
    camera.stop();

    const stream = createFakeStream("late");
    pending.resolve(stream);
    await flushMicrotasks();
    videoElement.finishPlay();
    await start;
    await flushMicrotasks();

    expect(isLive(stream)).toBe(false);
    expect(camera.isActive).toBe(false);
  });

  it("releases the stream of a start that a newer start superseded", async () => {
    const camera = new CameraManager();
    await camera.initialize();

    const first = deferred<FakeStream>();
    const second = deferred<FakeStream>();
    getUserMedia
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);

    const firstStart = camera.start().catch((error: unknown) => error);
    const secondStart = camera.start().catch((error: unknown) => error);

    const firstStream = createFakeStream("first");
    const secondStream = createFakeStream("second");
    first.resolve(firstStream);
    await flushMicrotasks();
    videoElement.finishPlay();
    await flushMicrotasks();
    second.resolve(secondStream);
    await flushMicrotasks();
    videoElement.finishPlay();
    await Promise.all([firstStart, secondStart]);
    await flushMicrotasks();

    expect(isLive(firstStream)).toBe(false);
    expect(isLive(secondStream)).toBe(true);
    expect(camera.isActive).toBe(true);
  });

  it("does not report an active camera when the stop arrives during playback", async () => {
    const camera = new CameraManager();
    await camera.initialize();

    const stream = createFakeStream("playing");
    getUserMedia.mockResolvedValue(stream);

    const start = camera.start().catch((error: unknown) => error);
    await flushMicrotasks();
    expect(videoElement.isPlayPending).toBe(true);

    camera.stop();
    videoElement.finishPlay();
    await start;
    await flushMicrotasks();

    expect(camera.isActive).toBe(false);
    expect(isLive(stream)).toBe(false);
  });

  it("can start again after the user denies permission", async () => {
    const camera = new CameraManager();
    await camera.initialize();

    const denial = Object.assign(new Error("denied"), {
      name: "NotAllowedError",
    });
    const stream = createFakeStream("after-retry");
    getUserMedia
      .mockRejectedValueOnce(denial)
      .mockResolvedValueOnce(stream);

    await expect(camera.start()).rejects.toThrow(/browser permissions/i);
    expect(camera.isActive).toBe(false);

    const retry = camera.start();
    await flushMicrotasks();
    videoElement.finishPlay();
    await retry;

    expect(camera.isActive).toBe(true);
    expect(isLive(stream)).toBe(true);
  });

  it("releases the previous stream when switching cameras", async () => {
    const camera = new CameraManager();
    await camera.initialize({ facingMode: "user" });

    const frontStream = createFakeStream("front");
    const backStream = createFakeStream("back");
    getUserMedia
      .mockResolvedValueOnce(frontStream)
      .mockResolvedValueOnce(backStream);

    const firstStart = camera.start();
    await flushMicrotasks();
    videoElement.finishPlay();
    await firstStart;

    const switching = camera.switchCamera();
    await flushMicrotasks();
    videoElement.finishPlay();
    await switching;

    expect(isLive(frontStream)).toBe(false);
    expect(isLive(backStream)).toBe(true);
    expect(camera.currentConfig.facingMode).toBe("environment");
    expect(camera.isActive).toBe(true);
  });
});
