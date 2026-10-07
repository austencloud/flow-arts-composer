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
  waitUntil,
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

  it("keeps running cleanups when one throws, and says so", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const { run, abort } = startSceneRun();
      const after = vi.fn();
      run.onAbort(() => {
        throw new Error("first cleanup failed");
      });
      run.onAbort(after);
      expect(() => abort()).not.toThrow();
      expect(after).toHaveBeenCalledTimes(1);
      expect(error).toHaveBeenCalledTimes(1);

      // A cleanup added after the turn ended fails just as quietly.
      expect(() =>
        run.onAbort(() => {
          throw new Error("late cleanup failed");
        })
      ).not.toThrow();
      expect(error).toHaveBeenCalledTimes(2);
    } finally {
      error.mockRestore();
    }
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

  it("gives a scene a live finger that vanishes when the turn ends", async () => {
    const { run, abort } = startSceneRun();
    const finger = sceneGhost(run, () => null);
    placeGhost(finger, 10, 20);
    expect(finger.ghost).toMatchObject({ x: 10, y: 20, visible: true });
    abort();
    expect(finger.ghost.visible).toBe(false);
    // The finger is halted: a glide asked for now returns without moving.
    await finger.glideTo(90, 90);
    expect(finger.ghost).toMatchObject({ x: 10, y: 20 });
  });
});

describe("the real attract ghost", () => {
  it("glides and taps for real, then stops dead when the turn ends", async () => {
    // The shared test setup stubs document.createElement with plain objects,
    // so build the real element through the namespaced factory.
    const root = document.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "div"
    ) as HTMLElement;
    document.body.appendChild(root);
    try {
      const { run, abort } = startSceneRun();
      const finger = sceneGhost(run, () => root);
      placeGhost(finger, 10, 10);

      const first = tapAt(finger, run, 40, 30);
      await vi.advanceTimersByTimeAsync(2000);
      await expect(first).resolves.toBe(true);
      expect(finger.ghost).toMatchObject({
        x: 40,
        y: 30,
        pressed: false,
        considering: false,
      });

      const second = tapAt(finger, run, 220, 160);
      await vi.advanceTimersByTimeAsync(200);
      const midGlide = { x: finger.ghost.x, y: finger.ghost.y };
      expect(midGlide).not.toEqual({ x: 40, y: 30 });
      abort();
      await vi.advanceTimersByTimeAsync(200);
      await expect(second).resolves.toBe(false);
      expect(finger.ghost.visible).toBe(false);

      const stopped = { x: finger.ghost.x, y: finger.ghost.y };
      await vi.advanceTimersByTimeAsync(2000);
      expect({ x: finger.ghost.x, y: finger.ghost.y }).toEqual(stopped);
    } finally {
      root.remove();
    }
  });
});

describe("waiting on a condition", () => {
  it("resolves true once the condition holds", async () => {
    const { run } = startSceneRun();
    let ready = false;
    setTimeout(() => {
      ready = true;
    }, 100);
    const waiting = waitUntil(run, () => ready, 500);
    await vi.advanceTimersByTimeAsync(150);
    await expect(waiting).resolves.toBe(true);
  });

  it("gives up after its timeout", async () => {
    const { run } = startSceneRun();
    const waiting = waitUntil(run, () => false, 200);
    await vi.advanceTimersByTimeAsync(250);
    await expect(waiting).resolves.toBe(false);
  });

  it("gives up when the turn ends", async () => {
    const { run, abort } = startSceneRun();
    const waiting = waitUntil(run, () => false, 5000);
    abort();
    await expect(waiting).resolves.toBe(false);
  });
});
