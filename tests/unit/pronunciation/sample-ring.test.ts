import { describe, expect, it } from "vitest";

import { SampleRing } from "#lib/features/lab/pronunciation-recorder/domain/sample-ring.js";

function ramp(from: number, count: number): Float32Array {
  const samples = new Float32Array(count);
  for (let index = 0; index < count; index++) samples[index] = from + index;
  return samples;
}

describe("SampleRing", () => {
  it("reads back a span written in one chunk", () => {
    const ring = new SampleRing(100);
    ring.write(ramp(0, 20));

    expect(Array.from(ring.read(5, 10)!)).toEqual([5, 6, 7, 8, 9]);
  });

  it("tracks an absolute sample clock across writes", () => {
    const ring = new SampleRing(100);
    ring.write(ramp(0, 20));
    ring.write(ramp(20, 20));

    expect(ring.writtenSamples).toBe(40);
    expect(Array.from(ring.read(18, 22)!)).toEqual([18, 19, 20, 21]);
  });

  it("reads a span that straddles the wrap point in order", () => {
    // The failure this exists for: a word that begins just before the ring
    // wraps comes back with its halves swapped. It still decodes, still has the
    // right duration, and is audibly wrong in a way no automated check catches.
    const ring = new SampleRing(10);
    ring.write(ramp(0, 8));
    ring.write(ramp(8, 6)); // wraps: absolute 4..13 now live

    expect(Array.from(ring.read(6, 12)!)).toEqual([6, 7, 8, 9, 10, 11]);
  });

  it("returns null for a span that has already been overwritten", () => {
    const ring = new SampleRing(10);
    ring.write(ramp(0, 25));

    expect(ring.read(0, 5)).toBeNull();
    expect(ring.read(20, 25)).not.toBeNull();
  });

  it("returns null for a span that runs past what has been written", () => {
    const ring = new SampleRing(100);
    ring.write(ramp(0, 20));

    expect(ring.read(15, 25)).toBeNull();
  });

  it("accepts a write larger than its own capacity", () => {
    const ring = new SampleRing(10);
    ring.write(ramp(0, 30));

    expect(ring.writtenSamples).toBe(30);
    expect(Array.from(ring.read(25, 30)!)).toEqual([25, 26, 27, 28, 29]);
  });
});
