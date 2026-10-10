import { flushSync } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mountPlaybackMediaLayer } from "./post-studio-media-layer-harness.svelte";
import { previewClockStep } from "#lib/shared/media-composition/services/post-preview-clock.js";
import { FOLLOW_AHEAD_SECONDS } from "#lib/shared/media-composition/services/video-preview-seek.js";

vi.mock(
  "#lib/shared/media-composition/state/media-composition-context.js",
  () => ({
    tryGetMediaCompositionContext: () => null,
  })
);
vi.mock(
  "#lib/shared/library/components/VisualSequenceSaveContextMenuHost.svelte",
  () => ({ default: () => ({}) })
);
vi.mock(
  "#lib/shared/share/components/post-studio/PostStudioSequenceAnimationLayer.svelte",
  () => ({ default: () => ({}) })
);
vi.mock(
  "#lib/shared/share/components/post-studio/PostStudioChoreoLayer.svelte",
  () => ({ default: () => ({}) })
);
vi.mock(
  "#lib/shared/share/components/post-studio/PostStudioTunnelLayer.svelte",
  () => ({ default: () => ({}) })
);
vi.mock(
  "#lib/shared/share/components/post-studio/PostStudioMandalaLayer.svelte",
  () => ({ default: () => ({}) })
);

const mounted: ReturnType<typeof mountPlaybackMediaLayer>[] = [];
let createElement: typeof document.createElement;
let nextFrame = 0;
const pendingFrames = new Map<number, VideoFrameRequestCallback>();
const cancelFrame = vi.fn((id: number) => pendingFrames.delete(id));
const drawImage = vi.fn();
const paused = new WeakMap<HTMLMediaElement, boolean>();

function present(mediaTime: number) {
  const callbacks = [...pendingFrames.values()];
  pendingFrames.clear();
  callbacks.forEach((callback) =>
    callback(performance.now(), { mediaTime } as VideoFrameCallbackMetadata)
  );
  flushSync();
}

beforeEach(() => {
  createElement = document.createElement;
  document.createElement =
    Object.getPrototypeOf(document).createElement.bind(document);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () => ({ drawImage }) as unknown as CanvasRenderingContext2D
  );
  vi.spyOn(HTMLMediaElement.prototype, "readyState", "get").mockReturnValue(4);
  vi.spyOn(HTMLMediaElement.prototype, "duration", "get").mockReturnValue(30);
  vi.spyOn(HTMLMediaElement.prototype, "paused", "get").mockImplementation(
    function (this: HTMLMediaElement) {
      return paused.get(this) ?? true;
    }
  );
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(
    async function (this: HTMLMediaElement) {
      paused.set(this, false);
    }
  );
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(function (
    this: HTMLMediaElement
  ) {
    paused.set(this, true);
  });
  vi.spyOn(HTMLVideoElement.prototype, "videoWidth", "get").mockReturnValue(
    406
  );
  vi.spyOn(HTMLVideoElement.prototype, "videoHeight", "get").mockReturnValue(
    720
  );
  Object.defineProperty(
    HTMLVideoElement.prototype,
    "requestVideoFrameCallback",
    {
      configurable: true,
      value: (callback: VideoFrameRequestCallback) => {
        pendingFrames.set(++nextFrame, callback);
        return nextFrame;
      },
    }
  );
  Object.defineProperty(
    HTMLVideoElement.prototype,
    "cancelVideoFrameCallback",
    {
      configurable: true,
      value: cancelFrame,
    }
  );
  pendingFrames.clear();
  cancelFrame.mockClear();
  drawImage.mockClear();
});

afterEach(async () => {
  for (const instance of mounted.splice(0)) await instance.destroy();
  document.createElement = createElement;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete (HTMLVideoElement.prototype as Partial<HTMLVideoElement>)
    .requestVideoFrameCallback;
  delete (HTMLVideoElement.prototype as Partial<HTMLVideoElement>)
    .cancelVideoFrameCallback;
});

describe("Post Studio playback media lifetime", () => {
  it("starts the half-speed clip when its current frame is decoded", async () => {
    const h = mountPlaybackMediaLayer();
    mounted.push(h);
    await Promise.resolve();
    await Promise.resolve();
    h.setPlaybackRate(0.5);
    expect(h.video.playbackRate).toBe(0.5);
    const controller = h.controller!;
    controller.hold(true);
    expect(h.video.paused).toBe(true);
    Object.defineProperty(h.video, "readyState", {
      configurable: true,
      value: 2,
    });
    const step = previewClockStep(10, 1 / 60, [
      { ...controller.read(), targetTime: 0, playbackRate: 0.5 },
    ]);
    expect(step.waiting).toBe(false);
    controller.hold(step.waiting);
    await vi.waitFor(() => {
      controller.hold(step.waiting);
      expect(h.video.paused).toBe(false);
    });
    h.video.currentTime = 0.02;
    expect(
      previewClockStep(10, 1 / 60, [
        { ...controller.read(), targetTime: 0, playbackRate: 0.5 },
      ]).deltaSeconds
    ).toBeCloseTo(0.04);
  });

  it("stops the footage when pausing also moves it back to the playhead", async () => {
    const h = mountPlaybackMediaLayer();
    mounted.push(h);
    present(0);
    await vi.waitFor(() => expect(h.video.paused).toBe(false));
    h.video.currentTime = 4;
    h.pauseAt(1);
    expect(h.video.currentTime).toBe(1);
    expect(h.video.paused).toBe(true);
  });

  it("keeps retained pixels and pending frame callbacks across equivalent playback bindings", () => {
    const h = mountPlaybackMediaLayer();
    mounted.push(h);
    present(0);
    expect(h.canvas.style.visibility).toBe("visible");
    cancelFrame.mockClear();
    const requests = [...pendingFrames.keys()];
    for (let frame = 1; frame <= 60; frame += 1) {
      h.video.currentTime = frame / 60;
      h.tick(frame / 60);
      expect(h.canvas.style.visibility).toBe("visible");
    }
    expect(cancelFrame).not.toHaveBeenCalled();
    expect([...pendingFrames.keys()]).toEqual(requests);
    const paints = drawImage.mock.calls.length;
    present(1);
    expect(drawImage.mock.calls.length).toBeGreaterThan(paints);
    expect(h.video.playbackRate).toBe(1);
  });

  it("invalidates the old source's callbacks only when the source actually changes", () => {
    const h = mountPlaybackMediaLayer();
    mounted.push(h);
    present(0);
    const oldCallbacks = [...pendingFrames.values()];
    const paints = drawImage.mock.calls.length;
    cancelFrame.mockClear();
    h.changeSource("blob:replacement");
    expect(h.canvas.style.visibility).toBe("hidden");
    expect(cancelFrame).toHaveBeenCalled();
    oldCallbacks.forEach((callback) =>
      callback(performance.now(), {
        mediaTime: 0.1,
      } as VideoFrameCallbackMetadata)
    );
    flushSync();
    expect(drawImage.mock.calls.length).toBe(paints);
    present(0);
    expect(h.canvas.style.visibility).toBe("visible");
  });

  it("speeds muted footage up or slows it down to keep up with sounding music", async () => {
    const h = mountPlaybackMediaLayer();
    mounted.push(h);
    present(0);
    await vi.waitFor(() => expect(h.video.paused).toBe(false));
    const controller = h.controller!;
    expect(h.video.muted).toBe(true);
    controller.follow?.(FOLLOW_AHEAD_SECONDS - 0.015);
    expect(h.video.playbackRate).toBeCloseTo(1.1);
    // A frame's read keeps the change.
    controller.read();
    expect(h.video.playbackRate).toBeCloseTo(1.1);
    // Back in its place, the clip returns to its authored speed.
    controller.follow?.(FOLLOW_AHEAD_SECONDS - 0.0005);
    expect(h.video.playbackRate).toBe(1);
    controller.follow?.(FOLLOW_AHEAD_SECONDS - 0.015);
    controller.follow?.(FOLLOW_AHEAD_SECONDS - 0.015);
    expect(h.video.playbackRate).toBeCloseTo(1.1);
    // Music that stops setting the clock gives the authored speed back.
    controller.follow?.(null);
    expect(h.video.playbackRate).toBe(1);
    // Footage that sounds never bends its pitch.
    h.video.muted = false;
    controller.follow?.(FOLLOW_AHEAD_SECONDS - 0.015);
    expect(h.video.playbackRate).toBe(1);
  });

  it("keeps the authored speed while footage is held or the post is paused", async () => {
    const h = mountPlaybackMediaLayer();
    mounted.push(h);
    present(0);
    await vi.waitFor(() => expect(h.video.paused).toBe(false));
    const controller = h.controller!;
    controller.follow?.(FOLLOW_AHEAD_SECONDS + 0.03);
    expect(h.video.playbackRate).toBeCloseTo(0.85);
    controller.hold(true);
    controller.follow?.(FOLLOW_AHEAD_SECONDS + 0.03);
    expect(h.video.playbackRate).toBe(1);
    await vi.waitFor(() => {
      controller.hold(false);
      expect(h.video.paused).toBe(false);
    });
    controller.follow?.(FOLLOW_AHEAD_SECONDS + 0.03);
    expect(h.video.playbackRate).toBeCloseTo(0.85);
    h.setPlaying(false);
    expect(h.video.playbackRate).toBe(1);
  });
});
