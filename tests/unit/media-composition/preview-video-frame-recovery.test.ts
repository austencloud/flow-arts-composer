import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PreviewVideoFrameRecovery } from "$lib/shared/media-composition/services/preview-video-frame-recovery";

function harness(frameCallbacks = true) {
  const state = { playing: false, targetTime: 2.59, source: "blob:first" };
  const callbacks = new Map<number, () => void>();
  let nextId = 0;
  const video = {
    currentTime: state.targetTime,
    duration: 12,
    readyState: 3,
    videoWidth: 3840,
    videoHeight: 2160,
    seeking: false,
    paused: true,
    muted: true,
    playbackRate: 0.75,
    play: vi.fn(async () => {
      video.paused = false;
    }),
    pause: vi.fn(() => {
      video.paused = true;
    }),
    requestVideoFrameCallback: frameCallbacks
      ? vi.fn((callback: () => void) => {
          callbacks.set(++nextId, callback);
          return nextId;
        })
      : undefined,
    cancelVideoFrameCallback: vi.fn((id: number) => callbacks.delete(id)),
  };
  const drawImage = vi.fn();
  const canvas = { width: 0, height: 0, getContext: () => ({ drawImage }) };
  const onFrame = vi.fn();
  const onRestore = vi.fn();
  let current = true;
  const recovery = new PreviewVideoFrameRecovery({
    video: video as unknown as HTMLVideoElement,
    canvas: canvas as unknown as HTMLCanvasElement,
    readState: () => state,
    isCurrent: () => current,
    onFrame,
    onRestore,
  });
  const present = () => {
    const pending = [...callbacks.values()];
    callbacks.clear();
    pending.forEach((callback) => callback());
  };
  return {
    state,
    video,
    canvas,
    recovery,
    callbacks,
    present,
    drawImage,
    onFrame,
    onRestore,
    replaceElement: () => {
      current = false;
    },
  };
}

describe("retained preview frames and lifecycle recovery", () => {
  const mounted: ReturnType<typeof harness>[] = [];
  const mount = (frameCallbacks = true) => {
    const instance = harness(frameCallbacks);
    mounted.push(instance);
    return instance;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  });

  afterEach(() => {
    mounted.splice(0).forEach(({ recovery }) => recovery.destroy());
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("retains a decoded frame across paused restore at the same time", () => {
    const h = mount();
    h.recovery.presentPausedFrame();
    h.present();
    expect(h.drawImage).toHaveBeenCalledOnce();
    expect(h.canvas).toMatchObject({ width: 1920, height: 1080 });
    window.dispatchEvent(new Event("pageshow"));
    window.dispatchEvent(new Event("focus"));
    expect(h.onRestore).toHaveBeenCalledOnce();
    expect(h.drawImage).toHaveBeenCalledOnce();
    h.present();
    expect(h.drawImage).toHaveBeenCalledTimes(2);
    expect(h.onFrame).toHaveBeenCalledOnce();
    expect(h.video.play).not.toHaveBeenCalled();
    expect(h.video.currentTime).toBe(2.59);
  });

  it("bounds a missing frame callback and restores the exact paused time", async () => {
    const h = mount();
    h.recovery.presentPausedFrame(true);
    await vi.advanceTimersByTimeAsync(400);
    expect(h.video.play).toHaveBeenCalledOnce();
    expect(h.video.muted).toBe(true);
    h.video.currentTime = 2.83;
    await vi.advanceTimersByTimeAsync(400);
    expect(h.video.paused).toBe(true);
    expect(h.video.currentTime).toBe(2.59);
    expect(h.video.playbackRate).toBe(0.75);
    expect(h.callbacks.size).toBe(0);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(h.video.play).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("restores time after a primed frame arrives without painting again indefinitely", async () => {
    const h = mount();
    h.recovery.presentPausedFrame();
    await vi.advanceTimersByTimeAsync(400);
    h.video.currentTime = 2.62;
    h.present();
    expect(h.drawImage).toHaveBeenCalledOnce();
    expect(h.video.currentTime).toBe(2.59);
    expect(h.video.paused).toBe(true);
    h.present();
    expect(h.drawImage).toHaveBeenCalledTimes(2);
    expect(h.callbacks.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("never primes a hidden preview and cancels a pending prime when hidden", async () => {
    const h = mount();
    h.recovery.presentPausedFrame();
    await vi.advanceTimersByTimeAsync(400);
    h.video.currentTime = 2.7;
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    h.recovery.presentPausedFrame(true);
    await vi.advanceTimersByTimeAsync(4000);
    expect(h.video.paused).toBe(true);
    expect(h.video.currentTime).toBe(2.59);
    expect(h.video.play).toHaveBeenCalledOnce();
    expect(h.callbacks.size).toBe(0);
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    h.present();
    expect(h.onRestore).toHaveBeenCalledOnce();
    expect(h.drawImage).toHaveBeenCalledOnce();
  });

  it.each(["source", "element", "destroy"])(
    "rejects stale frames and play promises after %s replacement",
    async (change) => {
      const h = mount();
      let resolvePlay!: () => void;
      h.video.play.mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            resolvePlay = resolve;
          })
      );
      h.recovery.presentPausedFrame();
      const oldCallback = [...h.callbacks.values()][0]!;
      await vi.advanceTimersByTimeAsync(400);
      if (change === "source") h.state.source = "blob:second";
      if (change === "element") h.replaceElement();
      if (change === "destroy") h.recovery.destroy();
      h.recovery.update();
      oldCallback();
      h.video.paused = false;
      resolvePlay();
      await Promise.resolve();
      expect(h.drawImage).not.toHaveBeenCalled();
      expect(h.onFrame).not.toHaveBeenCalled();
      expect(h.video.paused).toBe(true);
      expect(h.callbacks.size).toBe(0);
    }
  );

  it("does not pause or rewind an intentional playback resume", async () => {
    const h = mount();
    h.recovery.presentPausedFrame();
    await vi.advanceTimersByTimeAsync(400);
    h.state.playing = true;
    h.video.currentTime = 2.7;
    h.recovery.update();
    h.present();
    expect(h.video.paused).toBe(false);
    expect(h.video.currentTime).toBe(2.7);
    expect(h.video.pause).not.toHaveBeenCalled();
    expect(h.video.playbackRate).toBe(0.75);
    expect(h.drawImage).toHaveBeenCalledOnce();
    h.state.playing = false;
    h.recovery.update();
    expect(h.callbacks.size).toBe(0);
  });

  it("preserves a new scrub target when canceling paused priming", async () => {
    const h = mount();
    h.recovery.presentPausedFrame();
    await vi.advanceTimersByTimeAsync(400);
    h.video.currentTime = 2.8;
    h.state.targetTime = 6;
    h.recovery.update();
    expect(h.video.currentTime).toBe(6);
    expect(h.video.paused).toBe(true);
    expect(h.callbacks.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("refreshes a running decoder on restore even when its clock is on target", () => {
    const h = mount();
    h.state.playing = true;
    let position = 2.59;
    const seek = vi.fn((time: number) => {
      position = time;
    });
    Object.defineProperty(h.video, "currentTime", {
      get: () => position,
      set: seek,
    });
    window.dispatchEvent(new Event("pageshow"));
    expect(seek).toHaveBeenCalledWith(2.59);
    expect(h.video.playbackRate).toBe(0.75);
    expect(h.video.play).not.toHaveBeenCalled();
    h.present();
    expect(h.drawImage).toHaveBeenCalledOnce();
  });

  it("cleans up when the browser refuses playback and after destruction", async () => {
    const h = mount();
    h.video.play.mockRejectedValue(new Error("NotAllowedError"));
    h.recovery.presentPausedFrame();
    await vi.advanceTimersByTimeAsync(400);
    expect(h.callbacks.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    h.recovery.destroy();
    window.dispatchEvent(new Event("focus"));
    window.dispatchEvent(new Event("pageshow"));
    document.dispatchEvent(new Event("visibilitychange"));
    expect(h.onRestore).not.toHaveBeenCalled();
    expect(h.video.play).toHaveBeenCalledOnce();
  });

  it("supports browsers without video frame callbacks without background retries", async () => {
    const h = mount(false);
    h.recovery.presentPausedFrame(true);
    await vi.advanceTimersByTimeAsync(20);
    expect(h.drawImage).toHaveBeenCalledOnce();
    expect(h.video.play).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    h.state.playing = true;
    h.recovery.update();
    await vi.advanceTimersByTimeAsync(40);
    expect(h.drawImage.mock.calls.length).toBeGreaterThan(1);
    h.recovery.destroy();
    const count = h.drawImage.mock.calls.length;
    await vi.advanceTimersByTimeAsync(1000);
    expect(h.drawImage.mock.calls.length).toBe(count);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("leaves retained pixels intact when no decoded frame is available", () => {
    const h = mount();
    h.state.playing = true;
    h.recovery.update();
    h.present();
    h.video.readyState = 1;
    h.present();
    expect(h.drawImage).toHaveBeenCalledOnce();
    expect(h.canvas).toMatchObject({ width: 1920, height: 1080 });
  });
});
