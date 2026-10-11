import { afterEach, describe, expect, it, vi } from "vitest";
import { tick } from "svelte";
import type { ResolvedTakeTiming } from "#lib/shared/media-composition/domain/take-timing.js";
import { createPostTimingSessionHarness } from "./post-timing-session-harness.svelte";

const resolved = {
  sections: [
    {
      landings: [
        { position: 1, seconds: 1.25 },
        { position: 2, seconds: 2.8 },
      ],
    },
  ],
} as ResolvedTakeTiming;

describe("mapped step playback", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("plays video to the landing, dwells 300 ms, and cancels the dwell on pause", async () => {
    vi.useFakeTimers();
    const frames = new Map<number, FrameRequestCallback>();
    let frameId = 0;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      frames.set(++frameId, callback);
      return frameId;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
    const harness = createPostTimingSessionHarness(resolved);
    const session = harness.session;
    const video = document.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "video"
    ) as HTMLVideoElement;
    let currentTime = 0;
    Object.defineProperty(video, "currentTime", {
      get: () => currentTime,
      set: (seconds: number) => (currentTime = seconds),
    });
    video.load = vi.fn();
    Object.defineProperty(video, "ended", { value: false });
    let paused = true;
    let playCount = 0;
    Object.defineProperty(video, "paused", { get: () => paused });
    video.play = vi.fn(() => {
      paused = false;
      playCount += 1;
      session.notePlaying(true);
      return Promise.resolve();
    });
    video.pause = vi.fn(() => {
      paused = true;
      session.notePlaying(false);
    });
    session.video = video;
    await tick();
    session.playbackMode = "step";
    expect(session.takeId).toBe("take-a");
    expect(session.resolved).toBe(resolved);
    expect(session.video).not.toBeNull();
    expect(session.playbackMode).toBe("step");
    expect(session.video?.paused).toBe(true);
    expect(session.durationSeconds).toBe(60);
    expect(session.video?.ended).toBe(false);
    expect(session.video?.currentTime).toBe(0);
    session.togglePlay();
    await Promise.resolve();
    expect(playCount).toBe(1);

    session.video!.currentTime = 1.26;
    expect(session.video?.currentTime).toBe(1.26);
    expect(frames.size).toBeGreaterThan(0);
    const queued = [...frames.values()];
    frames.clear();
    queued.forEach((callback) => callback(0));
    expect(paused).toBe(true);
    expect(session.mediaSeconds).toBe(1.25);
    await vi.advanceTimersByTimeAsync(299);
    expect(playCount).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(playCount).toBe(2);

    session.video!.currentTime = 2.81;
    const next = [...frames.values()];
    frames.clear();
    next.forEach((callback) => callback(0));
    session.pause();
    await vi.advanceTimersByTimeAsync(500);
    expect(playCount).toBe(2);
    // Restart just before the final landing. Its dwell resumes trailing video.
    session.video!.currentTime = 2.7;
    session.togglePlay();
    await Promise.resolve();
    expect(playCount).toBe(3);
    session.video!.currentTime = 2.81;
    const finalFrames = [...frames.values()];
    frames.clear();
    finalFrames.forEach((callback) => callback(0));
    await vi.advanceTimersByTimeAsync(300);
    expect(playCount).toBe(4);
    expect(paused).toBe(false);
    // Disposing the session stops native playback and its frame loop.
    harness.dispose();
    expect(paused).toBe(true);
    expect(frames.size).toBe(0);
  });
});
