/**
 * The visitor's moment sounds (village-moment-sounds.ts) are seeded, never
 * clip, and have the shape their names promise: embers catching build, the
 * hearth's breath swells in the middle, embers dying thin out.
 */

import { describe, expect, it } from "vitest";
import { VILLAGE_MOMENT_EFFECTS, momentSamples } from "./village-moment-sounds";

const RATE = 8000;

// RMS of each third of the sound.
function thirds(samples: Float32Array): [number, number, number] {
  const size = Math.floor(samples.length / 3);
  const rms = (from: number) => {
    let sum = 0;
    for (let i = from; i < from + size; i++) sum += samples[i]! ** 2;
    return Math.sqrt(sum / size);
  };
  return [rms(0), rms(size), rms(2 * size)];
}

describe("village moment sounds", () => {
  it("are seeded, peak at 0.9 and are as long as the cue", () => {
    for (const effect of VILLAGE_MOMENT_EFFECTS) {
      const a = momentSamples(effect, RATE, 4);
      expect(momentSamples(effect, RATE, 4)).toEqual(a);
      expect(a.length).toBe(RATE * 4);
      let peak = 0;
      for (const s of a) peak = Math.max(peak, Math.abs(s));
      expect(peak, effect).toBeCloseTo(0.9, 6);
    }
  });

  it("build, swell and fade as named", () => {
    const [riseStart, riseMiddle] = thirds(
      momentSamples("ember-rise", RATE, 4.5)
    );
    expect(riseMiddle).toBeGreaterThan(riseStart);

    const [breathStart, breathMiddle, breathEnd] = thirds(
      momentSamples("hearth-breath", RATE, 7)
    );
    expect(breathMiddle).toBeGreaterThan(breathStart);
    expect(breathMiddle).toBeGreaterThan(breathEnd);

    const [fadeStart, , fadeEnd] = thirds(momentSamples("ember-fade", RATE, 6));
    expect(fadeStart).toBeGreaterThan(fadeEnd * 2);
  });
});
