import { describe, expect, it } from "vitest";
import { PetalFlightSim, type FlyingPetal } from "./petal-flight-sim";
import { resolvePetals2D } from "../translators/canvas2d-translator";
import { DEFAULT_EFFECTS_CONFIG } from "../domain/defaults";
import type { PetalsIntent } from "../domain/effects-config";
import type { Petals2DParams } from "../translators/canvas2d-types";
import type { EmitterTip } from "./emitter-tip";

function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function params(
  intent: Partial<PetalsIntent> = {},
  override: Partial<Petals2DParams> = {}
): Petals2DParams {
  return resolvePetals2D(
    { ...DEFAULT_EFFECTS_CONFIG.petals, ...intent },
    { poolSize: 2048, ...override }
  );
}

function tip(x: number, y: number): EmitterTip[] {
  return [{ x, y, propIndex: 0, tipIndex: 0, end: "A", color: "#d94f4f" }];
}

const CENTER = 250;
const RADIUS = 120;

/** One tip circling at `revolutions` per second. */
function circle(
  sim: PetalFlightSim,
  p: Petals2DParams,
  seconds: number,
  fps: number,
  revolutions: number
): void {
  const dt = 1 / fps;
  for (let frame = 0; frame * dt < seconds; frame++) {
    const angle = frame * dt * revolutions * Math.PI * 2;
    sim.step(
      p,
      tip(CENTER + RADIUS * Math.cos(angle), CENTER + RADIUS * Math.sin(angle)),
      dt,
      1
    );
  }
}

function quantile(values: number[], q: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(q * (sorted.length - 1))]!;
}

describe("PetalFlightSim", () => {
  it("sheds by distance travelled, so the frame rate does not change the trail", () => {
    const p = params({ ambientEmission: 0, motionEmission: 1 });
    const counts = [30, 60, 144].map((fps) => {
      const sim = new PetalFlightSim(seeded(3));
      circle(sim, p, 1, fps, 1);
      return sim.petals.length;
    });
    // One lap of a 120 px circle at 9 petals per 100 px.
    const expected = (2 * Math.PI * RADIUS * p.motionDensity) / 100;
    for (const count of counts) {
      expect(count).toBeGreaterThan(expected * 0.9);
      expect(count).toBeLessThan(expected * 1.1);
    }
  });

  it("keeps a fast swing's petals on the arc instead of throwing them across the stage", () => {
    const p = params({ ambientEmission: 0 });
    const sim = new PetalFlightSim(seeded(11));
    // 1.5 laps a second: the tip moves about 1130 px/s.
    circle(sim, p, 1.2, 60, 1.5);
    const young = sim.petals.filter((petal) => petal.age < 0.4);
    expect(young.length).toBeGreaterThan(20);
    const offsets = young.map((petal) =>
      Math.abs(Math.hypot(petal.x - CENTER, petal.y - CENTER) - RADIUS)
    );
    expect(quantile(offsets, 0.5)).toBeLessThan(40);
    expect(quantile(offsets, 0.9)).toBeLessThan(80);
  });

  it("drops a still prop's petals in a side-to-side glide, each out of step", () => {
    const p = params({ ambientEmission: 1, motionEmission: 0 });
    const sim = new PetalFlightSim(seeded(5));
    const history = new Map<FlyingPetal, number[]>();
    const dt = 1 / 60;
    for (let frame = 0; frame < 240; frame++) {
      sim.step(p, tip(CENTER, CENTER), dt, 1);
      for (const petal of sim.petals) {
        const vx = history.get(petal) ?? [];
        vx.push(petal.vx);
        history.set(petal, vx);
      }
    }
    const gliders = [...history].filter(
      ([petal, vx]) => petal.tumble === 0 && vx.length > 90
    );
    expect(gliders.length).toBeGreaterThan(4);
    for (const [petal, vx] of gliders) {
      let turns = 0;
      for (let i = 1; i < vx.length; i++)
        if (Math.sign(vx[i]!) !== Math.sign(vx[i - 1]!)) turns++;
      expect(turns).toBeGreaterThan(0);
      expect(petal.y).toBeGreaterThan(CENTER);
    }
    // Out of step: at the same moment some glide left and some right.
    const aloft = sim.petals.filter((petal) => petal.tumble === 0);
    const directions = new Set(aloft.map((petal) => Math.sign(petal.vx)));
    expect(directions.size).toBe(2);
  });

  it("points a thrown petal along its flight", () => {
    const p = params({ ambientEmission: 0 });
    const sim = new PetalFlightSim(seeded(9));
    for (let frame = 0; frame < 20; frame++)
      sim.step(p, tip(100 + frame * 15, 200), 1 / 60, 1);
    const fresh = sim.petals.filter((petal) => petal.age < 0.05);
    expect(fresh.length).toBeGreaterThan(0);
    for (const petal of fresh) {
      const along = Math.atan2(petal.vy, petal.vx) - Math.PI / 2;
      const off = Math.abs(
        ((petal.rot - along + Math.PI * 3) % (Math.PI * 2)) - Math.PI
      );
      expect(off).toBeLessThan(0.6);
    }
  });

  it("sheds nothing along a jump", () => {
    const p = params({ ambientEmission: 0, motionEmission: 1 });
    const sim = new PetalFlightSim(seeded(2));
    sim.step(p, tip(50, 250), 1 / 60, 1);
    sim.step(p, tip(450, 250), 1 / 60, 1);
    expect(sim.petals.length).toBe(0);
  });

  it("keeps petals sorted far to near for drawing", () => {
    const sim = new PetalFlightSim(seeded(4));
    circle(sim, params({ ambientEmission: 1 }), 1.5, 60, 1);
    expect(sim.petals.length).toBeGreaterThan(20);
    for (let i = 1; i < sim.petals.length; i++)
      expect(sim.petals[i]!.depth).toBeGreaterThanOrEqual(
        sim.petals[i - 1]!.depth
      );
  });

  it("holds still on a paused frame, even when the tip is scrubbed", () => {
    const p = params({ ambientEmission: 1 });
    const sim = new PetalFlightSim(seeded(6));
    circle(sim, p, 0.5, 60, 1);
    const before = sim.petals.map((petal) => [petal.x, petal.y]);
    sim.step(p, tip(CENTER, CENTER), 0, 1);
    expect(sim.petals.map((petal) => [petal.x, petal.y])).toEqual(before);
  });

  it("stays within the pool and empties on clear", () => {
    const sim = new PetalFlightSim(seeded(8));
    circle(sim, params({ motionEmission: 1 }, { poolSize: 40 }), 1, 60, 2);
    expect(sim.petals.length).toBeLessThanOrEqual(40);
    sim.clear();
    expect(sim.petals.length).toBe(0);
  });
});
