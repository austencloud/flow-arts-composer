import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const motion = vi.hoisted(() => ({ reduced: false }));
vi.mock("#lib/shared/transitions/motion.js", () => ({
  reducedMotion: () => motion.reduced,
}));

const { CombinationPlayback } =
  await import("./combination-playback.svelte.js");

describe("CombinationPlayback", () => {
  let frames: FrameRequestCallback[];
  let now: number;

  function step(ms: number) {
    now += ms;
    const due = frames;
    frames = [];
    for (const callback of due) callback(now);
  }

  beforeEach(() => {
    motion.reduced = false;
    frames = [];
    now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("replays a finished cell from its start to its finished picture", () => {
    const playback = new CombinationPlayback();
    expect(playback.cellProgress("shift")).toBeNull();

    playback.replay("shift");
    expect(playback.cellProgress("shift")).toBe(0);
    step(500);
    expect(playback.cellProgress("shift")).toBeGreaterThan(0);
    expect(playback.cellProgress("shift")).toBeLessThan(1);
    step(600);
    expect(playback.cellProgress("shift")).toBe(1);
    expect(frames).toHaveLength(0);
  });

  it("does not restart a cell that is still playing", () => {
    const playback = new CombinationPlayback();
    playback.replay("dash");
    step(500);
    const midway = playback.cellProgress("dash");
    playback.replay("dash");
    expect(playback.cellProgress("dash")).toBe(midway);
  });

  it("keeps the finished picture under reduced motion", () => {
    motion.reduced = true;
    const playback = new CombinationPlayback();
    playback.replay("static");
    expect(playback.cellProgress("static")).toBeNull();
    expect(frames).toHaveLength(0);
  });
});
