/**
 * The room's noise (village-noise.ts) is the same on every call and every
 * machine, which is what makes two renders of the room match; it stays within
 * ±1; and with the default seed it is exactly the Flow Fest fire jam's
 * buffer, so the room kept its sound when it took its own copy.
 */

import { describe, expect, it } from "vitest";
import { createDeterministicNoise } from "#lib/features/flow-fest-sim/services/implementations/FlowFestFireJamSoundscape.js";
import {
  brownNoiseSamples,
  seededRandom,
  VILLAGE_NOISE_SEED,
} from "./village-noise";
import {
  largestDifferenceDb,
  samplesFingerprint,
} from "./village-sound-render";

const RATE = 48000;

describe("the room's noise", () => {
  it("is the same every time for a seed, and different for another", () => {
    const once = brownNoiseSamples(RATE);
    expect(brownNoiseSamples(RATE)).toEqual(once);
    // Pinned: a change here changes the room's sound and every render of it.
    expect(samplesFingerprint(once)).toBe("fb3b317b");
    expect(samplesFingerprint(brownNoiseSamples(RATE, 4, 12345))).not.toBe(
      samplesFingerprint(once)
    );
  });

  it("stays within ±1 and is not silent", () => {
    for (const seed of [VILLAGE_NOISE_SEED, 1, 0xffffffff]) {
      const samples = brownNoiseSamples(RATE, 4, seed);
      let peak = 0;
      let sumSquares = 0;
      for (const sample of samples) {
        peak = Math.max(peak, Math.abs(sample));
        sumSquares += sample * sample;
      }
      expect(peak).toBeLessThanOrEqual(1);
      expect(Math.sqrt(sumSquares / samples.length)).toBeGreaterThan(0.01);
    }
  });

  it("is the Flow Fest fire jam's noise under the default seed", () => {
    // Just enough of an AudioContext for the Flow Fest builder.
    const fakeContext = {
      sampleRate: RATE,
      createBuffer: (_channels: number, length: number) => {
        const data = new Float32Array(length);
        return { getChannelData: () => data };
      },
    } as unknown as BaseAudioContext;
    const flowFest = createDeterministicNoise(fakeContext).getChannelData(0);
    expect(brownNoiseSamples(RATE)).toEqual(flowFest);
  });

  it("draws values in [0, 1] from its generator", () => {
    const random = seededRandom(7);
    for (let i = 0; i < 10000; i++) {
      const value = random();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });
});

describe("comparing two renders", () => {
  it("gives the largest gap in dB, and -Infinity for identical samples", () => {
    const a = brownNoiseSamples(RATE, 0.1);
    const b = a.slice();
    expect(largestDifferenceDb(a, b)).toBe(-Infinity);
    b[100] = (b[100] ?? 0) + 0.001;
    expect(largestDifferenceDb(a, b)).toBeCloseTo(-60, 3);
  });
});
