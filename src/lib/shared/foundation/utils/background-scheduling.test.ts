import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  holdDeferredWorkForMotion,
  whenMotionSettled,
} from "./background-scheduling";

function track(work: Promise<void>): () => Promise<boolean> {
  let done = false;
  void work.then(() => (done = true));
  return async () => {
    await vi.advanceTimersByTimeAsync(1);
    return done;
  };
}

describe("deferred work during motion", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(async () => {
    // Runs out any hold a failed test left, so it cannot reach the next test.
    await vi.advanceTimersByTimeAsync(5000);
    vi.useRealTimers();
  });

  it("does not make work wait when nothing is moving", async () => {
    expect(await track(whenMotionSettled())()).toBe(true);
  });

  it("holds work until the motion lands", async () => {
    const land = holdDeferredWorkForMotion();
    const settled = track(whenMotionSettled());
    expect(await settled()).toBe(false);
    land();
    expect(await settled()).toBe(true);
  });

  it("keeps holding until the last of two overlapping motions lands", async () => {
    const landFirst = holdDeferredWorkForMotion();
    const landSecond = holdDeferredWorkForMotion();
    const settled = track(whenMotionSettled());
    landFirst();
    // A second release of the same hold must not count as the other's.
    landFirst();
    expect(await settled()).toBe(false);
    landSecond();
    expect(await settled()).toBe(true);
  });

  it("keeps waiting when another motion starts as the first one lands", async () => {
    const landFirst = holdDeferredWorkForMotion();
    const settled = track(whenMotionSettled());
    landFirst();
    const landSecond = holdDeferredWorkForMotion();
    expect(await settled()).toBe(false);
    landSecond();
    expect(await settled()).toBe(true);
  });

  it("lets needed work through a hold that allows it, and nothing else", async () => {
    const land = holdDeferredWorkForMotion({ neededWorkRuns: true });
    const needed = track(whenMotionSettled({ needed: true }));
    const prefetch = track(whenMotionSettled());
    expect(await needed()).toBe(true);
    expect(await prefetch()).toBe(false);
    land();
    expect(await prefetch()).toBe(true);
  });

  it("holds needed work behind a motion that does not allow it", async () => {
    const clearing = holdDeferredWorkForMotion({ neededWorkRuns: true });
    const flight = holdDeferredWorkForMotion();
    const needed = track(whenMotionSettled({ needed: true }));
    clearing();
    expect(await needed()).toBe(false);
    flight();
    expect(await needed()).toBe(true);
  });

  it("never strands work behind a motion that fails to report landing", async () => {
    holdDeferredWorkForMotion();
    const settled = track(whenMotionSettled());
    expect(await settled()).toBe(false);
    await vi.advanceTimersByTimeAsync(2000);
    expect(await settled()).toBe(true);
  });
});

describe("deferred work during an animation", () => {
  function animation(
    property: string,
    iterations = 1
  ): { anim: Animation; land: () => void } {
    let land = (): void => {};
    const finished = new Promise<void>((resolve) => (land = resolve));
    const anim = {
      playState: "running",
      finished,
      effect: {
        getKeyframes: () => [{ offset: 0, easing: "linear", [property]: "1" }],
        getComputedTiming: () => ({ iterations }),
      },
    } as unknown as Animation;
    return { anim, land };
  }

  function running(...animations: Animation[]): void {
    vi.stubGlobal("document", { getAnimations: () => animations });
  }

  beforeEach(() => vi.useFakeTimers());
  afterEach(async () => {
    vi.unstubAllGlobals();
    await vi.advanceTimersByTimeAsync(5000);
    vi.useRealTimers();
  });

  it("waits for a height ease to land", async () => {
    const { anim, land } = animation("height");
    running(anim);
    const settled = track(whenMotionSettled());
    expect(await settled()).toBe(false);
    running();
    land();
    expect(await settled()).toBe(true);
  });

  it("does not wait for what the compositor runs by itself", async () => {
    running(animation("opacity").anim, animation("transform").anim);
    expect(await track(whenMotionSettled())()).toBe(true);
  });

  it("does not wait for a looping animation", async () => {
    running(animation("backgroundPosition", Infinity).anim);
    expect(await track(whenMotionSettled())()).toBe(true);
  });

  it("stops waiting when animations keep coming", async () => {
    running(animation("height").anim);
    const settled = track(whenMotionSettled());
    expect(await settled()).toBe(false);
    await vi.advanceTimersByTimeAsync(4000);
    expect(await settled()).toBe(true);
  });
});

describe("deferred work during a press", () => {
  function pressable(): EventTarget {
    const target = new EventTarget();
    vi.stubGlobal("window", target);
    vi.stubGlobal("requestAnimationFrame", (run: () => void) =>
      setTimeout(run, 16)
    );
    return target;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
  });
  afterEach(async () => {
    await vi.advanceTimersByTimeAsync(5000);
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("holds work from the press until two frames after it comes up", async () => {
    const target = pressable();
    const { whenMotionSettled: settle } =
      await import("./background-scheduling");
    await settle();
    target.dispatchEvent(new Event("pointerdown"));
    const settled = track(settle());
    await vi.advanceTimersByTimeAsync(500);
    expect(await settled()).toBe(false);
    target.dispatchEvent(new Event("pointerup"));
    expect(await settled()).toBe(false);
    await vi.advanceTimersByTimeAsync(40);
    expect(await settled()).toBe(true);
  });

  it("waits out the quiet time again after each press", async () => {
    const target = pressable();
    const { whenInputQuiet } = await import("./background-scheduling");
    const quiet = track(whenInputQuiet(1000));
    await vi.advanceTimersByTimeAsync(800);
    target.dispatchEvent(new Event("pointerdown"));
    target.dispatchEvent(new Event("pointerup"));
    await vi.advanceTimersByTimeAsync(800);
    expect(await quiet()).toBe(false);
    await vi.advanceTimersByTimeAsync(300);
    expect(await quiet()).toBe(true);
  });

  it("starts the quiet time over when a press comes during a motion", async () => {
    const target = pressable();
    const { whenPageStill, holdDeferredWorkForMotion: hold } =
      await import("./background-scheduling");
    const land = hold();
    const still = track(whenPageStill(1000));
    await vi.advanceTimersByTimeAsync(1100);
    expect(await still()).toBe(false);
    target.dispatchEvent(new Event("pointerdown"));
    target.dispatchEvent(new Event("pointerup"));
    land();
    await vi.advanceTimersByTimeAsync(100);
    expect(await still()).toBe(false);
    await vi.advanceTimersByTimeAsync(1000);
    expect(await still()).toBe(true);
  });
});
