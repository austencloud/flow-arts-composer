import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBuildSequence } from "#lib/shared/transitions/build-sequence.js";

describe("build sequence", () => {
  beforeEach(() => {
    vi.useFakeTimers({
      toFake: [
        "setTimeout",
        "clearTimeout",
        "requestAnimationFrame",
        "cancelAnimationFrame",
        "performance",
      ],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    delete document.documentElement.dataset.motionPreference;
  });

  it("plays acts, pauses and tweens in order, then finishes", () => {
    const log: string[] = [];
    const tweened: number[] = [];
    createBuildSequence().play(
      [
        { act: () => log.push("grid") },
        { pause: 100 },
        { act: () => log.push("hand") },
        { tween: 200, step: (t) => tweened.push(t) },
      ],
      () => log.push("done")
    );

    expect(log).toEqual(["grid"]);
    vi.advanceTimersByTime(100);
    expect(log).toEqual(["grid", "hand"]);
    vi.advanceTimersByTime(300);
    expect(tweened[0]).toBe(0);
    expect(tweened.at(-1)).toBe(1);
    expect(log).toEqual(["grid", "hand", "done"]);
  });

  it("skips to the finished picture under reduced motion", () => {
    document.documentElement.dataset.motionPreference = "reduce";
    const act = vi.fn();
    const finish = vi.fn();
    createBuildSequence().play([{ act }, { pause: 500 }], finish);
    expect(act).not.toHaveBeenCalled();
    expect(finish).toHaveBeenCalledOnce();
  });

  it("stops a cancelled build before its next beat and never finishes it", () => {
    const act = vi.fn();
    const finish = vi.fn();
    const sequence = createBuildSequence();
    sequence.play([{ pause: 100 }, { act }], finish);
    sequence.cancel();
    vi.advanceTimersByTime(500);
    expect(act).not.toHaveBeenCalled();
    expect(finish).not.toHaveBeenCalled();
  });

  it("replaces a running build when played again", () => {
    const first = vi.fn();
    const second = vi.fn();
    const sequence = createBuildSequence();
    sequence.play([{ pause: 100 }], first);
    sequence.play([{ pause: 100 }], second);
    vi.advanceTimersByTime(200);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
  });
});
