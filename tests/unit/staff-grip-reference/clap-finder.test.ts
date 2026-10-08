import { describe, expect, it } from "vitest";

import { findClapSeconds } from "../../../src/routes/test/staff-grip/reference/clap-finder";

const RATE = 48_000;

/** Deterministic noise so a failure reproduces. */
function noise(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0xffffffff - 0.5;
  };
}

function silence(seconds: number): Float32Array {
  return new Float32Array(Math.round(seconds * RATE));
}

function addClap(samples: Float32Array, atSeconds: number, seed = 7): void {
  const random = noise(seed);
  const start = Math.round(atSeconds * RATE);
  for (let i = 0; i < Math.round(0.08 * RATE); i += 1) {
    const index = start + i;
    if (index >= samples.length) break;
    samples[index]! += 1.8 * random() * Math.exp(-i / (0.012 * RATE));
  }
}

function addMusic(samples: Float32Array, fromSeconds = 0, level = 0.3): void {
  const hiss = noise(99);
  for (let i = Math.round(fromSeconds * RATE); i < samples.length; i += 1) {
    const t = i / RATE;
    samples[i]! +=
      level * 0.6 * Math.sin(2 * Math.PI * 220 * t) +
      level * 0.4 * Math.sin(2 * Math.PI * 330 * t) +
      0.01 * hiss();
  }
}

describe("findClapSeconds", () => {
  it("finds a clap in a quiet room to within 2 ms", () => {
    const samples = silence(8);
    addClap(samples, 3.217);
    const found = findClapSeconds(samples, RATE);
    expect(found).not.toBeNull();
    expect(Math.abs(found! - 3.217)).toBeLessThan(0.002);
  });

  it("finds a clap over steady music", () => {
    const samples = silence(10);
    addMusic(samples);
    addClap(samples, 5.5);
    const found = findClapSeconds(samples, RATE);
    expect(found).not.toBeNull();
    expect(Math.abs(found! - 5.5)).toBeLessThan(0.002);
  });

  it("takes the clap, not music that starts after it", () => {
    const samples = silence(8);
    addClap(samples, 1.5);
    addMusic(samples, 3, 0.8);
    const found = findClapSeconds(samples, RATE);
    expect(Math.abs(found! - 1.5)).toBeLessThan(0.002);
  });

  it("returns null when nothing claps", () => {
    const samples = silence(10);
    addMusic(samples);
    expect(findClapSeconds(samples, RATE)).toBeNull();
  });

  it("ignores a clap past the search window", () => {
    const samples = silence(6);
    addClap(samples, 4);
    expect(findClapSeconds(samples, RATE, { searchSeconds: 2 })).toBeNull();
  });
});
