import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ASSET_WATCHDOG_MS,
  ROOM_HARD_CAP_MS,
  createMuseumRevealGate,
} from "./museum-reveal-gate";

// The curtain used to lift on a half-built Room of Collaboration: the 15 s
// watchdog forced the reveal while the forest and the villagers were still
// downloading. These pin that a room which says it is loading holds the
// curtain past that mark, and that the long cap still frees a stuck load.

describe("museum reveal gate", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function makeGate() {
    const onReveal = vi.fn();
    const warn = vi.fn();
    const gate = createMuseumRevealGate({ onReveal, warn });
    gate.start();
    return { gate, onReveal, warn };
  }

  it("does not reveal while the room is loading, even after the old 15 s mark", () => {
    const { gate, onReveal } = makeGate();
    gate.setRoom({ state: "loading", progress: 0.2 });
    gate.markTextures();
    gate.markMeshes();
    gate.markShaders();

    vi.advanceTimersByTime(ASSET_WATCHDOG_MS + 1);
    expect(onReveal).not.toHaveBeenCalled();

    vi.advanceTimersByTime(60_000 - ASSET_WATCHDOG_MS);
    expect(onReveal).not.toHaveBeenCalled();
    expect(gate.snapshot.revealed).toBe(false);
  });

  it("reveals as soon as the room reports ready", () => {
    const { gate, onReveal } = makeGate();
    gate.setRoom({ state: "loading", progress: 0 });
    gate.markTextures();
    gate.markMeshes();
    gate.markShaders();
    gate.setRoom({ state: "ready", progress: 1 });
    expect(onReveal).toHaveBeenCalledTimes(1);
  });

  it("holds the shader warm-up until the room is built", () => {
    const { gate } = makeGate();
    gate.setRoom({ state: "loading", progress: 0 });
    gate.markTextures();
    expect(gate.snapshot.assetsReady).toBe(false);
    gate.setRoom({ state: "ready", progress: 1 });
    expect(gate.snapshot.assetsReady).toBe(true);
  });

  it("the watchdog still forces stalled asset tracks when the room is ready", () => {
    const { gate, onReveal, warn } = makeGate();
    gate.markShaders();
    vi.advanceTimersByTime(ASSET_WATCHDOG_MS + 1);
    expect(warn).toHaveBeenCalled();
    expect(onReveal).toHaveBeenCalledTimes(1);
  });

  it("a room failure lifts the curtain", () => {
    const { gate, onReveal } = makeGate();
    gate.setRoom({ state: "loading", progress: 0.5 });
    gate.markTextures();
    gate.markMeshes();
    gate.markShaders();
    gate.setRoom({ state: "failed", progress: 0.5 });
    expect(onReveal).toHaveBeenCalledTimes(1);
  });

  it("the hard cap frees a room that never finishes", () => {
    const { gate, onReveal, warn } = makeGate();
    gate.setRoom({ state: "loading", progress: 0.1 });
    gate.markShaders();
    vi.advanceTimersByTime(ROOM_HARD_CAP_MS - 1);
    expect(onReveal).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2);
    expect(onReveal).toHaveBeenCalledTimes(1);
    expect(gate.snapshot.room.state).toBe("failed");
    expect(warn).toHaveBeenCalled();
  });

  it("reveals once, and ignores the room after the reveal", () => {
    const { gate, onReveal } = makeGate();
    gate.markTextures();
    gate.markMeshes();
    gate.markShaders();
    gate.setRoom({ state: "loading", progress: 0 });
    gate.forceAll();
    expect(onReveal).toHaveBeenCalledTimes(1);
  });
});
