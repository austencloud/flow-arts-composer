import { describe, expect, it } from "vitest";
import {
  InkLiquidSim,
  inkDropShape,
  resolveInkLiquidSettings,
  sphereRadius,
  type InkLiquidSettings,
} from "#lib/shared/3d/effects/ink/ink-liquid-sim.js";

const DT = 1 / 60;

function settings(overrides: Partial<InkLiquidSettings> = {}): InkLiquidSettings {
  return {
    ...resolveInkLiquidSettings(
      { intensity: 0.64, motionEmission: 0.9, viscosity: 0.3, splatterIntensity: 0 },
      { ambient: 0 }
    ),
    ...overrides,
  };
}

/** A tip on a 0.6 m circle at one turn per second, 1.2 m above the floor. */
function spin(sim: InkLiquidSim, frames: number, s: InkLiquidSettings, floorY = -Infinity, from = 0) {
  for (let f = from; f < from + frames; f++) {
    const angle = f * DT * Math.PI * 2;
    sim.update(DT, [{ key: 0, x: Math.cos(angle) * 0.6, y: 1.2 + Math.sin(angle) * 0.6, z: 0 }], s, floorY);
  }
}

function totals(sim: InkLiquidSim) {
  let parcels = 0;
  let linked = 0;
  let loose = 0;
  let volume = 0;
  let lowest = Infinity;
  for (let i = 0; i < sim.capacity; i++) {
    if (!sim.alive[i]) continue;
    parcels++;
    volume += sim.volume[i]!;
    lowest = Math.min(lowest, sim.y[i]!);
    if (sim.older[i]! >= 0) linked++;
    if (sim.older[i]! < 0 && sim.newer[i]! < 0 && !sim.isHead(i)) loose++;
  }
  return { parcels, linked, loose, volume, lowest };
}

describe("ink liquid", () => {
  it("throws a strand off a spinning tip that unwinds outward", () => {
    const sim = new InkLiquidSim();
    const s = settings({ breakupSeconds: Infinity });
    spin(sim, 45, s);
    const { parcels, linked } = totals(sim);
    expect(parcels).toBeGreaterThan(40);
    expect(linked).toBeGreaterThan(parcels * 0.8);
    // Thrown ink keeps the tip's speed, so it ends up well outside the circle
    // the tip traces (gravity bends it, so measure from the circle's center).
    let farthest = 0;
    for (let i = 0; i < sim.capacity; i++) {
      if (sim.alive[i]) farthest = Math.max(farthest, Math.hypot(sim.x[i]!, sim.y[i]! - 1.2));
    }
    expect(farthest).toBeGreaterThan(1.1);
  });

  it("keeps a strand a smooth curve when frames come unevenly", () => {
    const sim = new InkLiquidSim();
    const s = settings({ breakupSeconds: Infinity });
    let time = 0;
    for (let f = 0; f < 50; f++) {
      const dt = f % 7 === 3 ? 2 * DT : DT;
      time += dt;
      const angle = time * Math.PI * 2 * 1.2;
      sim.update(dt, [{ key: 0, x: Math.cos(angle) * 0.6, y: 1.2 + Math.sin(angle) * 0.6, z: 0 }], s);
    }
    let sharpest = 0;
    for (let i = 0; i < sim.capacity; i++) {
      const o = sim.older[i]!;
      if (!sim.alive[i] || o < 0) continue;
      const oo = sim.older[o]!;
      if (oo < 0) continue;
      const ax = sim.x[o]! - sim.x[i]!;
      const ay = sim.y[o]! - sim.y[i]!;
      const bx = sim.x[oo]! - sim.x[o]!;
      const by = sim.y[oo]! - sim.y[o]!;
      if (Math.hypot(ax, ay) < 0.02 || Math.hypot(bx, by) < 0.02) continue;
      const cos = (ax * bx + ay * by) / (Math.hypot(ax, ay) * Math.hypot(bx, by));
      sharpest = Math.max(sharpest, (Math.acos(Math.min(1, cos)) * 180) / Math.PI);
    }
    expect(sharpest).toBeLessThan(20);
  });

  it("does not shed from a tip that barely moves", () => {
    const sim = new InkLiquidSim();
    for (let f = 0; f < 60; f++) sim.update(DT, [{ key: 0, x: f * 0.001, y: 1, z: 0 }], settings());
    expect(sim.liveCount).toBe(0);
  });

  it("carries its ink along while the tip slides straight, and throws it on the turn", () => {
    const sim = new InkLiquidSim();
    const s = settings();
    for (let f = 0; f < 30; f++) sim.update(DT, [{ key: 0, x: f * DT * 4, y: 1, z: 0 }], s);
    expect(sim.liveCount).toBe(0);
    spin(sim, 30, s, -Infinity, 30);
    expect(sim.liveCount).toBeGreaterThan(10);
  });

  it("lets free ink fall under gravity", () => {
    const sim = new InkLiquidSim();
    const s = settings();
    spin(sim, 20, s);
    const before = totals(sim).lowest;
    // The tip leaves; what it threw keeps falling.
    for (let f = 0; f < 20; f++) sim.update(DT, [], s);
    expect(totals(sim).lowest).toBeLessThan(before - 0.5);
  });

  it("keeps its volume while strands tear and ball up into drops", () => {
    const sim = new InkLiquidSim();
    const s = settings({ breakupSeconds: 0.08 });
    spin(sim, 24, s);
    const shed = totals(sim).volume;
    for (let f = 0; f < 18; f++) sim.update(DT, [], s);
    const after = totals(sim);
    expect(after.volume).toBeCloseTo(shed, 9);
    expect(after.loose).toBeGreaterThan(5);
    expect(after.loose).toBeGreaterThan(after.linked);
  });

  it("beads sooner the less viscous the look", () => {
    const loose = (viscosity: number) => {
      const sim = new InkLiquidSim();
      const s = settings(
        resolveInkLiquidSettings(
          { intensity: 0.64, motionEmission: 0.9, viscosity, splatterIntensity: 0 },
          { ambient: 0 }
        )
      );
      spin(sim, 40, s);
      return totals(sim).loose;
    };
    expect(loose(0.9)).toBeGreaterThan(loose(0.2));
    expect(resolveInkLiquidSettings(
      { intensity: 0.5, motionEmission: 1, viscosity: 0, splatterIntensity: 0 },
      { ambient: 0 }
    ).breakupSeconds).toBe(Infinity);
  });

  it("splats drops on the floor into stains, harder hits throwing a crown", () => {
    const crown = (splatter: number) => {
      const sim = new InkLiquidSim();
      const s = settings({ splatter, breakupSeconds: 0.05 });
      spin(sim, 30, s, 0);
      let stains = 0;
      let maxParcels = 0;
      for (let f = 0; f < 90; f++) {
        sim.update(DT, [], s, 0);
        maxParcels = Math.max(maxParcels, sim.liveCount);
      }
      for (let i = 0; i < sim.stainCapacity; i++) if (sim.stainAlive[i]) stains++;
      return { stains, sim };
    };
    const calm = crown(0);
    // Drops that land in a wet stain pool into it, so there are fewer stains
    // than drops, and some hold several drops' worth of ink.
    expect(calm.stains).toBeGreaterThan(3);
    let largest = 0;
    let smallest = Infinity;
    for (let i = 0; i < calm.sim.stainCapacity; i++) {
      if (!calm.sim.stainAlive[i]) continue;
      largest = Math.max(largest, calm.sim.stainVolume[i]!);
      smallest = Math.min(smallest, calm.sim.stainVolume[i]!);
    }
    expect(largest).toBeGreaterThan(smallest * 2);
    for (let i = 0; i < calm.sim.stainCapacity; i++) {
      if (!calm.sim.stainAlive[i]) continue;
      expect(calm.sim.stainY[i]).toBe(0);
      expect(calm.sim.stainRadius[i]).toBeGreaterThan(0);
    }
    expect(crown(1).stains).toBeGreaterThan(calm.stains);
    // Nothing sinks through the stage.
    for (let i = 0; i < calm.sim.capacity; i++) {
      if (calm.sim.alive[i]) expect(calm.sim.y[i]).toBeGreaterThanOrEqual(-0.02);
    }
  });

  it("dries stains away", () => {
    const sim = new InkLiquidSim();
    const s = settings({ stainSeconds: 0.5, breakupSeconds: 0.05 });
    spin(sim, 30, s, 0);
    for (let f = 0; f < 240; f++) sim.update(DT, [], s, 0);
    let stains = 0;
    for (let i = 0; i < sim.stainCapacity; i++) if (sim.stainAlive[i]) stains++;
    expect(stains).toBe(0);
  });

  it("grows a drop on a resting tip until it falls", () => {
    const sim = new InkLiquidSim();
    const s = settings({ ambient: 1 });
    let fell = false;
    for (let f = 0; f < 600 && !fell; f++) {
      sim.update(DT, [{ key: 0, x: 0, y: 1, z: 0 }], s);
      fell = sim.liveCount > 0;
    }
    expect(fell).toBe(true);
    expect(sim.sources[0]!.drip).toBe(0);
  });

  it("cuts the strand when the tip jumps", () => {
    const sim = new InkLiquidSim();
    const s = settings({ breakupSeconds: Infinity });
    spin(sim, 20, s);
    expect(sim.sources[0]!.head).toBeGreaterThanOrEqual(0);
    sim.update(DT, [{ key: 0, x: 0.6, y: 1.2, z: 0, jumped: true }], s);
    expect(sim.sources[0]!.head).toBe(-1);
  });

  it("is repeatable for the same seed", () => {
    const run = () => {
      const sim = new InkLiquidSim(2400, 900, 7);
      spin(sim, 45, settings({ splatter: 0.6 }), 0);
      return totals(sim);
    };
    expect(run()).toEqual(run());
  });

  it("draws drops longer with speed at the same volume", () => {
    const radius = sphereRadius(4e-6);
    const still = inkDropShape(radius, 0, 10);
    const fast = inkDropShape(radius, 5, 10);
    expect(fast.along).toBeGreaterThan(still.along);
    expect(fast.along * fast.across * fast.across).toBeCloseTo(still.along * still.across * still.across, 12);
  });
});
