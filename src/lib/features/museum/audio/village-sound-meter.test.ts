/**
 * The village sound meter's arithmetic (village-sound-meter.ts): RMS and peak
 * of a window, dBFS that survives JSON, and a bed that leaves cue windows out.
 */

import { describe, expect, it } from "vitest";
import {
  measureWindow,
  summarize,
  toDbfs,
  type VillageSoundReading,
} from "./village-sound-meter";

const reading = (
  rms: number,
  peak: number,
  cue: string | null = null
): VillageSoundReading => ({
  time: 0,
  rms,
  peak,
  rmsDb: toDbfs(rms),
  peakDb: toDbfs(peak),
  distance: 11,
  cue,
});

describe("village sound meter", () => {
  it("reads a full-scale sine as RMS 1/sqrt 2 and peak 1", () => {
    const sine = Float32Array.from({ length: 4800 }, (_, i) =>
      Math.sin((2 * Math.PI * 100 * i) / 48000)
    );
    const { rms, peak } = measureWindow(sine);
    expect(rms).toBeCloseTo(Math.SQRT1_2, 3);
    expect(peak).toBeCloseTo(1, 3);
    expect(toDbfs(rms)).toBeCloseTo(-3.01, 1);
  });

  it("reads silence as -120 dBFS, not -Infinity", () => {
    expect(toDbfs(measureWindow(new Float32Array(10)).rms)).toBe(-120);
  });

  it("keeps cue windows out of the bed but counts their peaks", () => {
    const summary = summarize([
      reading(0.1, 0.3),
      reading(0.1, 0.3),
      reading(0.5, 0.9, "seed:lost"),
    ]);
    expect(summary.bedRms).toBeCloseTo(0.1, 6);
    expect(summary.peak).toBe(0.9);
  });
});
