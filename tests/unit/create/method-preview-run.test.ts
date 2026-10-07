/**
 * A scene's turn is one cancellable timeline. Ending the turn ends every
 * wait at once, lifts the demo finger, and runs the scene's cleanups.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  placeGhost,
  SCENE_TAP,
  sceneGhost,
  startSceneRun,
  tapAt,
  type SceneFinger,
} from "$lib/features/create/shared/components/method-previews/method-preview-run";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function fakeFinger() {
  const ghost = {
    x: 0,
    y: 0,
    pressed: false,
    visible: true,
    considering: false,
  };
  const glideTo = vi.fn(async (x: number, y: number) => {
    ghost.x = x;
    ghost.y = y;
  });
  return {
    ghost,
    glideTo,
    finger: { ghost, glideTo } as unknown as SceneFinger,
  };
}

describe("scene runs", () => {
  it("finishes a wait when its time passes", async () => {
    const { run } = startSceneRun();
    const done = run.wait(100);
    await vi.advanceTimersByTimeAsync(100);
    await expect(done).resolves.toBe(true);
  });

  it("ends every pending wait at once when the turn ends", async () => {
    const { run, abort } = startSceneRun();
    const first = run.wait(1000);
    const second = run.wait(5000);
    abort();
    await expect(first).resolves.toBe(false);
    await expect(second).resolves.toBe(false);
    expect(run.aborted).toBe(true);
    await expect(run.wait(10)).resolves.toBe(false);
  });

  it("runs cleanups once on abort, and at once when added after it", () => {
    const { run, abort } = startSceneRun();
    const early = vi.fn();
    run.onAbort(early);
    abort();
    abort();
    expect(early).toHaveBeenCalledTimes(1);
    const late = vi.fn();
    run.onAbort(late);
    expect(late).toHaveBeenCalledTimes(1);
  });
});

describe("demo taps", () => {
  it("glides to the point, leans in, presses, and lifts", async () => {
    const { ghost, glideTo, finger } = fakeFinger();
    const { run } = startSceneRun();
    const tap = tapAt(finger, run, 30, 12);
    await vi.advanceTimersByTimeAsync(0);
    expect(glideTo).toHaveBeenCalledWith(30, 12);
    expect(ghost.considering).toBe(true);
    await vi.advanceTimersByTimeAsync(SCENE_TAP.considerMs);
    expect(ghost).toMatchObject({ considering: false, pressed: true });
    await vi.advanceTimersByTimeAsync(SCENE_TAP.pressMs);
    await expect(tap).resolves.toBe(true);
    expect(ghost.pressed).toBe(false);
  });

  it("lets go when the turn ends mid-tap", async () => {
    const { ghost, finger } = fakeFinger();
    const { run, abort } = startSceneRun();
    const tap = tapAt(finger, run, 30, 12);
    await vi.advanceTimersByTimeAsync(SCENE_TAP.considerMs);
    expect(ghost.pressed).toBe(true);
    abort();
    await expect(tap).resolves.toBe(false);
    expect(ghost).toMatchObject({ considering: false, pressed: false });
  });

  it("gives a scene a live finger that vanishes when the turn ends", () => {
    const { run, abort } = startSceneRun();
    const finger = sceneGhost(run, () => null);
    placeGhost(finger, 10, 20);
    expect(finger.ghost).toMatchObject({ x: 10, y: 20, visible: true });
    abort();
    expect(finger.ghost.visible).toBe(false);
    expect(finger.halted()).toBe(true);
  });
});
