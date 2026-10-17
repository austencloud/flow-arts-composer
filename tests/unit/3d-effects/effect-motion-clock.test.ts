import { describe, expect, it } from "vitest";
import { EffectMotionClock } from "#lib/shared/3d/effects/scene-effects/effect-motion-clock.js";

const STEPS_PER_SECOND = 1.5;

describe("effect motion clock", () => {
  it("times a frame by the step it shows when poses arrive a frame late", () => {
    const clock = new EffectMotionClock();
    // Every fifth frame is dropped. Playback poses after the render reads, so
    // the step a frame shows is the one from the end of the frame before.
    const deltas = Array.from({ length: 60 }, (_, f) => (f % 5 === 1 ? 2 : 1) / 60);
    let time = 0;
    let shownStep = 0;
    const timed: number[] = [];
    for (const delta of deltas) {
      timed.push(clock.advance(delta, shownStep, true));
      time += delta;
      shownStep = time * STEPS_PER_SECOND;
    }
    // The learned rate can sit a few percent off while it settles, which no
    // one sees; what must not happen is a frame reading half or double speed.
    const ratios = timed.slice(30).map((t, i) => t / deltas[29 + i]!);
    for (const ratio of ratios) expect(Math.abs(ratio - 1)).toBeLessThan(0.05);
    for (let i = 1; i < ratios.length; i++) {
      expect(Math.abs(ratios[i]! - ratios[i - 1]!)).toBeLessThan(0.01);
    }
  });

  it("falls back to the render delta while paused, scrubbed back or looping", () => {
    const clock = new EffectMotionClock();
    for (let f = 0; f < 20; f++) clock.advance(1 / 60, f * 0.025, true);
    expect(clock.advance(1 / 60, 0.1, true)).toBe(1 / 60);
    // Right after the loop the learned rate still holds.
    expect(clock.advance(2 / 60, 0.125, true)).toBeCloseTo(1 / 60, 6);
    expect(clock.advance(0.02, 0.2, false)).toBe(0.02);
  });
});
