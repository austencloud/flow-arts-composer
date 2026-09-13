/**
 * MediaPipeDetector session lifecycle.
 *
 * MediaPipe's WASM bundle and hand model come off a CDN, so the first
 * `startRealTimeDetection` can sit in `initialize()` for seconds. Everything
 * here is about what must NOT happen when the practice session ends (or is
 * replaced) inside that window: no frame loop may outlive the stop that was
 * already issued, and a dead session must never take the detector back from a
 * newer one. A fake landmarker and a hand-driven animation-frame queue
 * reproduce the orderings without MediaPipe or a camera.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { MediaPipeDetector } from "./media-pipe-detector";
import type { HandLandmarker } from "./hand-landmarker";
import type { HandTrackingStabilizer } from "./hand-tracking-stabilizer";
import type { DetectionFrame } from "$lib/shared/train/domain/detection-frame";

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 8; i++) await Promise.resolve();
}

function createFakeLandmarker() {
  const pending = deferred<void>();
  const fake = {
    isInitialized: false,
    initialize: vi.fn(() => pending.promise),
    detectForVideo: vi.fn(() => ({ landmarks: [], handedness: [] })),
    detect: vi.fn(() => ({ landmarks: [], handedness: [] })),
    dispose: vi.fn(() => {
      fake.isInitialized = false;
    }),
    /** Finish the model load the way MediaPipe would. */
    finishLoading: () => {
      fake.isInitialized = true;
      pending.resolve();
    },
  };
  return fake;
}

function createFakeStabilizer() {
  return {
    clearHistory: vi.fn(),
    resetAll: vi.fn(),
    hasHistory: vi.fn(() => false),
    getLastPosition: vi.fn(() => null),
    calculateDistance: vi.fn(() => 0),
    addPosition: vi.fn((_hand: string, x: number, y: number) => ({ x, y })),
    setAssignedHand: vi.fn(),
  };
}

function createFakeVideo(width: number, height: number) {
  return {
    readyState: 4,
    videoWidth: width,
    videoHeight: height,
    clientWidth: width,
    clientHeight: height,
  } as unknown as HTMLVideoElement;
}

describe("MediaPipeDetector session lifecycle", () => {
  let landmarker: ReturnType<typeof createFakeLandmarker>;
  let stabilizer: ReturnType<typeof createFakeStabilizer>;
  let detector: MediaPipeDetector;
  let frameQueue: Array<{ id: number; callback: FrameRequestCallback }>;
  let originalRaf: typeof globalThis.requestAnimationFrame;
  let originalCancelRaf: typeof globalThis.cancelAnimationFrame;

  /** Run whatever the detector has queued, n generations deep. */
  function runFrames(count: number): void {
    for (let i = 0; i < count; i++) {
      const due = frameQueue;
      frameQueue = [];
      for (const frame of due) frame.callback(performance.now());
    }
  }

  beforeEach(() => {
    landmarker = createFakeLandmarker();
    stabilizer = createFakeStabilizer();
    detector = new MediaPipeDetector(
      landmarker as unknown as HandLandmarker,
      stabilizer as unknown as HandTrackingStabilizer
    );

    frameQueue = [];
    let nextId = 1;
    originalRaf = globalThis.requestAnimationFrame;
    originalCancelRaf = globalThis.cancelAnimationFrame;
    globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => {
      const id = nextId++;
      frameQueue.push({ id, callback });
      return id;
    }) as typeof globalThis.requestAnimationFrame;
    globalThis.cancelAnimationFrame = ((id: number) => {
      frameQueue = frameQueue.filter((frame) => frame.id !== id);
    }) as typeof globalThis.cancelAnimationFrame;
  });

  afterEach(() => {
    globalThis.requestAnimationFrame = originalRaf;
    globalThis.cancelAnimationFrame = originalCancelRaf;
  });

  it("never starts a frame loop for a session stopped while the model was loading", async () => {
    const onFrame = vi.fn();
    const start = detector.startRealTimeDetection(
      createFakeVideo(640, 480),
      onFrame
    );

    // The user left Train before MediaPipe finished downloading.
    detector.stopDetection();

    landmarker.finishLoading();
    await start;
    await flushMicrotasks();
    runFrames(3);

    expect(detector.isDetecting).toBe(false);
    expect(onFrame).not.toHaveBeenCalled();
    expect(landmarker.detectForVideo).not.toHaveBeenCalled();
    expect(frameQueue).toHaveLength(0);
  });

  it("does not let a stopped session take the detector back from a newer one", async () => {
    const staleFrames = vi.fn();
    const staleStart = detector.startRealTimeDetection(
      createFakeVideo(640, 480),
      staleFrames
    );

    detector.stopDetection();
    landmarker.finishLoading();

    // A fresh session starts against a different camera feed before the
    // abandoned one resumes from its await.
    const liveFrames = vi.fn<(frame: DetectionFrame) => void>();
    const liveStart = detector.startRealTimeDetection(
      createFakeVideo(1280, 720),
      liveFrames
    );

    await Promise.all([staleStart, liveStart]);
    await flushMicrotasks();
    runFrames(2);

    expect(liveFrames).toHaveBeenCalled();
    expect(staleFrames).not.toHaveBeenCalled();
    expect(detector.getPerformanceStats().videoResolution).toBe("1280x720");
  });

  it("stops the frame loop and drops the video when detection stops", async () => {
    landmarker.finishLoading();
    const onFrame = vi.fn();
    await detector.startRealTimeDetection(createFakeVideo(640, 480), onFrame);

    // Starting delivers the first frame synchronously, then schedules the loop.
    expect(onFrame).toHaveBeenCalledTimes(1);
    runFrames(1);
    expect(onFrame).toHaveBeenCalledTimes(2);

    detector.stopDetection();
    runFrames(3);

    expect(onFrame).toHaveBeenCalledTimes(2);
    expect(detector.isDetecting).toBe(false);
    expect(frameQueue).toHaveLength(0);
    expect(detector.getPerformanceStats().videoResolution).toBe("N/A");
  });

  it("releases the landmarker and the loop on dispose", async () => {
    landmarker.finishLoading();
    const onFrame = vi.fn();
    await detector.startRealTimeDetection(createFakeVideo(640, 480), onFrame);

    detector.dispose();
    runFrames(3);

    expect(landmarker.dispose).toHaveBeenCalledTimes(1);
    expect(detector.isDetecting).toBe(false);
    expect(frameQueue).toHaveLength(0);
  });
});
