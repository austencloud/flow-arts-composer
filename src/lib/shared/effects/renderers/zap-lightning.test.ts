import { describe, it, expect } from "vitest";
import {
  cutChannel,
  DischargeChannel,
  strikeLight,
  writePlasmaFilament,
  PLASMA_POINTS,
  type ChannelShape,
  type Strike,
} from "./zap-lightning";
import {
  mulberry32,
  SeededNoise,
} from "#lib/shared/3d/procedural-engine/generation/seed-generator.js";

const shape = (overrides: Partial<ChannelShape> = {}): ChannelShape => ({
  jitter: 0.5,
  branching: 0.5,
  energy: 0,
  depthAxis: false,
  ...overrides,
});

function averageStrokes(overrides: Partial<ChannelShape>): number {
  let total = 0;
  for (let seed = 1; seed <= 200; seed++) {
    total += cutChannel(mulberry32(seed), shape(overrides)).length;
  }
  return total / 200;
}

describe("cutChannel", () => {
  it("runs the main channel exactly from one end to the other", () => {
    const [main] = cutChannel(mulberry32(7), shape());
    const pts = main!.points;
    expect(main!.depth).toBe(0);
    expect(pts.length / 3).toBe(33);
    expect([pts[0], pts[1], pts[2]]).toEqual([0, 0, 0]);
    expect([
      pts[pts.length - 3],
      pts[pts.length - 2],
      pts[pts.length - 1],
    ]).toEqual([1, 0, 0]);
  });

  it("is jagged, not a straight line", () => {
    const [main] = cutChannel(mulberry32(3), shape());
    let maxOffset = 0;
    for (let i = 1; i < main!.points.length; i += 3) {
      maxOffset = Math.max(maxOffset, Math.abs(main!.points[i]!));
    }
    expect(maxOffset).toBeGreaterThan(0.03);
  });

  it("stays in the canvas plane without a depth axis and leaves it with one", () => {
    const flat = cutChannel(mulberry32(11), shape({ branching: 1 }));
    for (const stroke of flat) {
      for (let i = 2; i < stroke.points.length; i += 3)
        expect(stroke.points[i]).toBe(0);
    }
    const deep = cutChannel(mulberry32(11), shape({ depthAxis: true }));
    const leaves = deep[0]!.points.some(
      (value, i) => i % 3 === 2 && value !== 0
    );
    expect(leaves).toBe(true);
  });

  it("forks more with Branching and with a faster swing", () => {
    expect(averageStrokes({ branching: 1 })).toBeGreaterThan(
      averageStrokes({ branching: 0 }) + 1
    );
    expect(averageStrokes({ branching: 0.3, energy: 1 })).toBeGreaterThan(
      averageStrokes({ branching: 0.3, energy: 0 })
    );
  });
});

describe("strikeLight", () => {
  const strike = (pulses: number[], life = 0.3): Strike => ({
    strokes: [],
    pulses,
    life,
    age: 0,
  });

  it("flashes white and leaves a colored afterglow behind the core", () => {
    const s = strike([0]);
    const birth = strikeLight(s);
    expect(birth.core).toBeCloseTo(1);
    s.age = 0.15;
    const later = strikeLight(s);
    expect(later.core).toBeLessThan(0.1);
    expect(later.halo).toBeGreaterThan(later.core * 2);
  });

  it("re-brightens on a return stroke", () => {
    const s = strike([0, 0.08]);
    s.age = 0.079;
    const before = strikeLight(s).core;
    s.age = 0.081;
    expect(strikeLight(s).core).toBeGreaterThan(before * 2);
  });

  it("is dark at the end of its life", () => {
    const s = strike([0], 0.25);
    s.age = 0.25;
    expect(strikeLight(s)).toEqual({ core: 0, halo: 0 });
  });
});

describe("DischargeChannel", () => {
  it("fires about `rate` strikes a second at any frame rate", () => {
    const run = (fps: number) => {
      const channel = new DischargeChannel(42);
      for (let i = 0; i < fps * 4; i++) channel.step(1 / fps, 6, shape());
      return channel.fired;
    };
    const at30 = run(30);
    const at120 = run(120);
    expect(at30).toBeGreaterThan(14);
    expect(at30).toBeLessThan(34);
    expect(Math.abs(at30 - at120)).toBeLessThanOrEqual(1);
  });

  it("retires strikes once they go dark", () => {
    const channel = new DischargeChannel(5);
    channel.step(1 / 60, 4, shape());
    expect(channel.strikes.length).toBe(1);
    for (let i = 0; i < 60; i++) channel.step(1 / 60, 0, shape());
    expect(channel.strikes.length).toBe(0);
  });
});

describe("writePlasmaFilament", () => {
  it("pins both ends and moves smoothly through time", () => {
    const noise = new SeededNoise(9);
    const a = new Float32Array(PLASMA_POINTS * 3);
    const b = new Float32Array(PLASMA_POINTS * 3);
    const opts = { sway: 0.5, crawl: 0.5, depthAxis: false };
    writePlasmaFilament(a, noise, 3, 1, opts);
    writePlasmaFilament(b, noise, 3, 1.01, opts);
    expect(a[1]).toBeCloseTo(0);
    expect(a[a.length - 2]).toBeCloseTo(0);
    let step = 0;
    let bow = 0;
    for (let i = 1; i < a.length; i += 3) {
      step = Math.max(step, Math.abs(a[i]! - b[i]!));
      bow = Math.max(bow, Math.abs(a[i]!));
    }
    expect(bow).toBeGreaterThan(0.01);
    expect(step).toBeLessThan(bow * 0.2);
  });
});
