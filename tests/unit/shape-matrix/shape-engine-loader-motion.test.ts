import { describe, expect, it } from "vitest";
import { loaderProgress } from "../../../packages/shape-engine/src/services/shape-loader-progress";
import {
  creepClockMs,
  flowerLengthAt,
  gridKeyframesCss,
  handAt,
  stageKeyframesCss,
} from "../../../packages/shape-engine/src/services/shape-loader-motion";

/* The server-rendered keyframes and the script share one clock: when the
   script takes over it reads the keyframes' time and must land on the same
   progress, or the drawing jumps. */
describe("shape loader motion", () => {
  it("keyframe clock is the exact inverse of the loading creep", () => {
    for (const p of [0.05, 0.3, 0.6, 0.85, 0.89]) {
      expect(loaderProgress(creepClockMs(p), null)).toBeCloseTo(p, 6);
    }
  });

  it("keyframes never draw a stroke all the way, and every stop is in order", () => {
    for (const css of [gridKeyframesCss(), stageKeyframesCss()]) {
      const stops = [...css.matchAll(/([\d.]+)%\{/g)].map((m) => Number(m[1]));
      expect(stops.length).toBeGreaterThan(0);
      for (const block of css.split("@keyframes").slice(1)) {
        const percents = [...block.matchAll(/([\d.]+)%\{/g)].map((m) => Number(m[1]));
        expect(percents[0]).toBe(0);
        expect(percents.at(-1)).toBe(100);
        expect(percents.every((v, i) => i === 0 || v > percents[i - 1]!)).toBe(true);
      }
      const offsets = [...css.matchAll(/stroke-dashoffset:([\d.]+)/g)].map((m) => Number(m[1]));
      // The last body diagonal is never finished while loading.
      expect(Math.min(...offsets.slice(-25))).toBeGreaterThan(0);
    }
  });

  it("the hand starts at the bottom and blue goes the other way to red", () => {
    expect(handAt(0, false)[1]).toBeGreaterThan(0);
    expect(Math.sign(handAt(0.1, false)[0])).toBe(-Math.sign(handAt(0.1, true)[0]));
    expect(flowerLengthAt(0, 0)).toBe(0);
    expect(flowerLengthAt(0, 1)).toBe(1);
  });
});
