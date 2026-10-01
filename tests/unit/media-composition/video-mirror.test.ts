import { describe, expect, it } from "vitest";
import {
  startVideoMirror,
  type VideoMirrorEnvironment,
} from "$lib/shared/media-composition/services/video-mirror";

class FakeVideo extends EventTarget {
  readyState = 4;
  videoWidth = 1080;
  videoHeight = 1920;
  paused = true;
  ended = false;
  private nextFrameId = 1;
  frameCallbacks = new Map<number, () => void>();

  requestVideoFrameCallback(callback: () => void): number {
    const id = this.nextFrameId++;
    this.frameCallbacks.set(id, callback);
    return id;
  }

  cancelVideoFrameCallback(id: number): void {
    this.frameCallbacks.delete(id);
  }

  presentFrame(): void {
    const callbacks = [...this.frameCallbacks.values()];
    this.frameCallbacks.clear();
    for (const callback of callbacks) callback();
  }

  emit(name: string): void {
    this.dispatchEvent(new Event(name));
  }
}

function setup(options: { boxWidth?: number; boxHeight?: number } = {}) {
  const video = new FakeVideo();
  const draws: number[][] = [];
  const clears: number[] = [];
  let failDraw = false;
  const context = {
    clearRect: () => clears.push(draws.length),
    drawImage: (_source: unknown, ...rect: number[]) => {
      if (failDraw) throw new DOMException("not ready", "InvalidStateError");
      draws.push(rect);
    },
  };
  const canvas = {
    width: 300,
    height: 150,
    getContext: () => context,
  };
  const frames = new Map<number, () => void>();
  let nextFrame = 1;
  let resize: ((width: number, height: number) => void) | null = null;
  let observing = false;
  const environment: VideoMirrorEnvironment = {
    requestFrame: (callback) => {
      frames.set(nextFrame, callback);
      return nextFrame++;
    },
    cancelFrame: (id) => frames.delete(id),
    pixelRatio: () => 1,
    observeSize: (_element, onResize) => {
      resize = onResize;
      observing = true;
      onResize(options.boxWidth ?? 270, options.boxHeight ?? 480);
      return () => {
        observing = false;
      };
    },
  };
  const stop = startVideoMirror(
    canvas as unknown as HTMLCanvasElement,
    video as unknown as HTMLVideoElement,
    "contain",
    environment
  );
  return {
    video,
    canvas,
    draws,
    clears,
    stop,
    frames,
    get observing() {
      return observing;
    },
    resize: (width: number, height: number) => resize?.(width, height),
    failDrawing: () => {
      failDraw = true;
    },
    runAnimationFrame: () => {
      const pending = [...frames.values()];
      frames.clear();
      for (const callback of pending) callback();
    },
  };
}

describe("video mirror", () => {
  it("draws the video at its own resolution, fitted as the video is", () => {
    const mirror = setup();
    expect([mirror.canvas.width, mirror.canvas.height]).toEqual([1080, 1920]);
    expect(mirror.draws.at(-1)).toEqual([0, 0, 1080, 1920]);

    // A square box letterboxes a portrait video, centred, as object-fit does.
    mirror.resize(480, 480);
    expect([mirror.canvas.width, mirror.canvas.height]).toEqual([1920, 1920]);
    expect(mirror.draws.at(-1)).toEqual([420, 0, 1080, 1920]);
  });

  it("follows playback on every animation frame and stops when paused", () => {
    const mirror = setup();
    mirror.video.paused = false;
    mirror.video.emit("play");
    const before = mirror.draws.length;
    for (let frame = 0; frame < 5; frame += 1) mirror.runAnimationFrame();
    expect(mirror.draws.length - before).toBe(5);

    mirror.video.paused = true;
    mirror.video.emit("pause");
    mirror.runAnimationFrame();
    expect(mirror.frames.size).toBe(0);
  });

  it("repaints a paused video after a seek and after a frame with no event", () => {
    const mirror = setup();
    const before = mirror.draws.length;
    mirror.video.emit("seeked");
    expect(mirror.draws.length).toBe(before + 1);
    mirror.video.presentFrame();
    expect(mirror.draws.length).toBe(before + 2);
    // Still watching for the next one.
    mirror.video.presentFrame();
    expect(mirror.draws.length).toBe(before + 3);
  });

  it("stays clear, showing the video beneath, whenever it has no picture", () => {
    const mirror = setup();
    mirror.video.readyState = 1;
    const drawn = mirror.draws.length;
    mirror.video.emit("seeked");
    expect(mirror.draws.length).toBe(drawn);

    const clears = mirror.clears.length;
    mirror.video.emit("emptied");
    expect(mirror.clears.length).toBe(clears + 1);

    mirror.video.readyState = 4;
    mirror.failDrawing();
    mirror.video.emit("seeked");
    expect(mirror.draws.length).toBe(drawn);
    expect(mirror.clears.length).toBe(clears + 3);
  });

  it("lets go of the video when it stops", () => {
    const mirror = setup();
    mirror.video.paused = false;
    mirror.video.emit("play");
    mirror.stop();
    expect(mirror.frames.size).toBe(0);
    expect(mirror.video.frameCallbacks.size).toBe(0);
    expect(mirror.observing).toBe(false);
    const drawn = mirror.draws.length;
    mirror.video.emit("seeked");
    mirror.video.emit("play");
    expect(mirror.draws.length).toBe(drawn);
    expect(mirror.frames.size).toBe(0);
  });
});
