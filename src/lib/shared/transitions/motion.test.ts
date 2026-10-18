import { describe, expect, it } from "vitest";
import * as pkg from "@austencloud/motion";
import { DURATION, STAGGER, SLIDE, SLIDE_DISTANCE } from "./transitions";
import {
  Crossfade,
  arrive,
  flipDuration,
  flyFade,
  growFade,
  leave,
  motionDuration,
  opaqueFade,
  popIn,
  reducedMotion,
  releaseSettle,
  STEP_DRIFT_PX,
} from "./motion";

describe("the Composer's motion surface is the shared package", () => {
  it("reads the clock from the package", () => {
    expect(DURATION).toBe(pkg.DURATION);
    expect(STAGGER).toBe(pkg.STAGGER);
    expect(SLIDE).toBe(pkg.SLIDE);
    expect(SLIDE_DISTANCE).toBe(pkg.SLIDE);
    expect(STEP_DRIFT_PX).toBe(pkg.STEP_DRIFT_PX);
  });

  it("re-exports the shared owners", () => {
    expect(flyFade).toBe(pkg.flyFade);
    expect(growFade).toBe(pkg.growFade);
    expect(popIn).toBe(pkg.popIn);
    expect(arrive).toBe(pkg.arrive);
    expect(leave).toBe(pkg.leave);
    expect(reducedMotion).toBe(pkg.reducedMotion);
    expect(motionDuration).toBe(pkg.motionDuration);
    expect(flipDuration).toBe(pkg.flipDuration);
    expect(Crossfade).toBe(pkg.Crossfade);
  });

  it("keeps the Composer-only helpers", () => {
    expect(typeof opaqueFade).toBe("function");
  });
});

describe("releaseSettle", () => {
  const openingSpeed = (velocity: number, distance: number) => {
    const settle = releaseSettle(velocity, distance)!;
    const y1 = Number(
      settle.easing.match(/cubic-bezier\(0\.333, ([\d.]+),/)![1]
    );
    // Opening slope 3·y1 is progress per unit time; scale it to px/ms.
    return { settle, speed: (3 * y1 * distance) / settle.durationMs };
  };

  it("leaves the release point at the hand's speed", () => {
    for (const velocity of [0.4, 1.2, 3]) {
      expect(openingSpeed(velocity, 660).speed).toBeCloseTo(velocity, 2);
    }
  });

  it("stays inside the drawer's slide time", () => {
    expect(releaseSettle(0.1, 660)!.durationMs).toBe(DURATION.dramatic);
    expect(releaseSettle(20, 660)!.durationMs).toBe(DURATION.normal);
    expect(releaseSettle(6, 660)!.durationMs).toBe(220);
  });

  it("starts from rest when the hand had stopped", () => {
    expect(releaseSettle(0, 400)!.easing).toBe(
      "cubic-bezier(0.333, 0.000, 0.667, 1)"
    );
  });

  it("has nothing to settle with no distance left", () => {
    expect(releaseSettle(1, 0)).toBeNull();
  });
});
