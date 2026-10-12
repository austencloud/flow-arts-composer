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
    expect(popIn).toBe(pkg.popIn);
    expect(arrive).toBe(pkg.arrive);
    expect(leave).toBe(pkg.leave);
    expect(reducedMotion).toBe(pkg.reducedMotion);
    expect(motionDuration).toBe(pkg.motionDuration);
    expect(flipDuration).toBe(pkg.flipDuration);
    expect(Crossfade).toBe(pkg.Crossfade);
  });

  it("keeps the Composer-only helpers", () => {
    expect(typeof growFade).toBe("function");
    expect(typeof opaqueFade).toBe("function");
  });
});
