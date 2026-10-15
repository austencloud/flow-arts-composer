import { describe, expect, it, vi } from "vitest";
import {
  artworkSwapRatio,
  PropSwapRelease,
} from "#lib/shared/pictograph/prop/components/prop-swap-scale.js";

function scheduler() {
  let id = 0;
  const frames = new Map<number, FrameRequestCallback>();
  const release = new PropSwapRelease(
    (callback) => {
      frames.set(++id, callback);
      return id;
    },
    (key) => {
      frames.delete(key);
    }
  );
  return {
    release,
    frames,
    tick() {
      const due = [...frames.values()];
      frames.clear();
      due.forEach((callback) => callback(0));
    },
  };
}

describe("centered artwork swap", () => {
  it("starts larger and smaller artwork at its predecessor's width", () => {
    expect(artworkSwapRatio({ x: 50, y: 20 }, { x: 100, y: 40 })).toBe(0.5);
    expect(artworkSwapRatio({ x: 100, y: 40 }, { x: 50, y: 20 })).toBe(2);
  });

  it("skips missing, invalid, and effectively equal dimensions", () => {
    for (const x of [0, -1, NaN, Infinity, 50.1]) {
      expect(artworkSwapRatio({ x, y: 20 }, { x: 50, y: 20 })).toBe(1);
    }
    expect(artworkSwapRatio(null, { x: 50, y: 20 })).toBe(1);
    expect(artworkSwapRatio({ x: 50, y: 20 }, undefined)).toBe(1);
    expect(artworkSwapRatio({ x: 50, y: 20 }, { x: 0, y: 20 })).toBe(1);
  });

  it("holds the starting scale for two frames before releasing", () => {
    const { release, tick, frames } = scheduler();
    const update = vi.fn();
    release.start(0.5, false, update);
    expect(update.mock.calls).toEqual([[0.5, true]]);
    tick();
    expect(update).toHaveBeenCalledTimes(1);
    tick();
    expect(update.mock.calls).toEqual([
      [0.5, true],
      [1, false],
    ]);
    expect(frames.size).toBe(0);
  });

  it.each([false, true])(
    "cancels a rapid re-swap after first frame: %s",
    (advance) => {
      const { release, tick, frames } = scheduler();
      const oldUpdate = vi.fn();
      const nextUpdate = vi.fn();
      release.start(0.5, false, oldUpdate);
      if (advance) tick();
      const staleCallback = [...frames.values()][0]!;
      release.start(2, false, nextUpdate);
      staleCallback(0);
      tick();
      tick();
      expect(oldUpdate.mock.calls).toEqual([[0.5, true]]);
      expect(nextUpdate.mock.calls).toEqual([
        [2, true],
        [1, false],
      ]);
      expect(frames.size).toBe(0);
    }
  );

  it.each([false, true])(
    "cancels on destroy after first frame: %s",
    (advance) => {
      const { release, tick, frames } = scheduler();
      const update = vi.fn();
      release.start(0.5, false, update);
      if (advance) tick();
      const staleCallback = [...frames.values()][0]!;
      release.destroy();
      staleCallback(0);
      tick();
      expect(update.mock.calls).toEqual([[0.5, true]]);
      expect(frames.size).toBe(0);
    }
  );

  it("reduced motion cancels a pending swap and reaches the final size immediately", () => {
    const { release, frames } = scheduler();
    const update = vi.fn();
    release.start(0.5, false, update);
    release.start(2, true, update);
    expect(update.mock.calls).toEqual([
      [0.5, true],
      [1, false],
    ]);
    expect(frames.size).toBe(0);
  });
});
