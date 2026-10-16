import { describe, expect, it } from "vitest";
import {
  GooStrandSim,
  ropeLength,
  type GooMaterial,
  type GooStrand,
  type GooTipInput,
} from "./goo-strand-sim";

const BOUNDS = { width: 1068, height: 1068 };
const FRAME = 1 / 60;
const K = 145 * 2.136;

function material(patch: Partial<GooMaterial> = {}): GooMaterial {
  return {
    viscosity: 0,
    tension: 0.3,
    intensity: 0.6,
    ambient: 0.4,
    motion: 0.6,
    ambientSpawnRate: 8,
    motionSpawnRate: 40,
    referenceSpeed: 3,
    baseRadius: 0.04,
    gravity: 1,
    spew: "flow",
    pxPerMeter: K,
    ...patch,
  };
}

function rope(sim: GooStrandSim, id: string): GooStrand | undefined {
  return sim.strands.find((strand) => strand.attached && strand.tip === id);
}

/** Run the sim and report what the rope and drops did along the way. */
function simulate(
  mat: GooMaterial,
  seconds: number,
  tipAt: (t: number) => { x: number; y: number }
) {
  const sim = new GooStrandSim(() => 0.5);
  let drips = 0;
  let longest = 0;
  let hungBelow = false;
  let dropFell = false;
  for (let t = 0; t < seconds; t += FRAME) {
    const tip: GooTipInput = { id: "0-0", ...tipAt(t) };
    const before = new Map(sim.drops.map((d) => [d, d.y]));
    sim.step([tip], FRAME, mat, BOUNDS);
    for (const drop of sim.drops) {
      if (!before.has(drop)) drips++;
      else if (drop.y > before.get(drop)!) dropFell = true;
    }
    const strand = rope(sim, "0-0");
    if (!strand) continue;
    longest = Math.max(longest, ropeLength(strand));
    if (strand.y[strand.count - 1]! * K > tip.y + 10) hungBelow = true;
  }
  return { sim, drips, longest, hungBelow, dropFell };
}

const still = () => ({ x: 534, y: 300 });
const spin = (t: number) => ({
  x: 534 + Math.cos(t * Math.PI * 3) * 220,
  y: 534 + Math.sin(t * Math.PI * 3) * 220,
});

describe("GooStrandSim", () => {
  it("hangs below a still tip, then lets go of drops that fall", () => {
    const run = simulate(material(), 12, still);
    expect(run.hungBelow).toBe(true);
    expect(run.drips).toBeGreaterThan(0);
    expect(run.dropFell).toBe(true);
  });

  it("makes thick goo drip less often and hang longer than watery goo", () => {
    const watery = simulate(material({ ambient: 0.2, viscosity: 0 }), 20, still);
    const thick = simulate(material({ ambient: 0.2, viscosity: 1 }), 20, still);
    expect(watery.drips).toBeGreaterThan(thick.drips);
    expect(thick.longest).toBeGreaterThan(watery.longest);
  });

  it("drips faster at rest when the steady flow is turned up", () => {
    const trickle = simulate(material({ ambient: 0.2 }), 20, still);
    const flowing = simulate(material({ ambient: 1 }), 20, still);
    expect(flowing.drips).toBeGreaterThan(trickle.drips);
  });

  it("flings drops off a spinning tip and sheds an overlong rope", () => {
    const run = simulate(material({ ambient: 0 }), 6, spin);
    expect(run.drips).toBeGreaterThan(3);
    const strand = rope(run.sim, "0-0")!;
    expect(run.longest).toBeLessThan(strand.maxLength * 1.5);
  });

  it("restarts the rope on a tip that jumps and lets go of ropes of lost tips", () => {
    const sim = new GooStrandSim(() => 0.5);
    const mat = material();
    for (let i = 0; i < 60; i++) {
      sim.step([{ id: "a", x: 100, y: 100 }], FRAME, mat, BOUNDS);
    }
    sim.step([{ id: "a", x: 900, y: 900 }], FRAME, mat, BOUNDS);
    const strand = rope(sim, "a")!;
    expect(Math.hypot(strand.x[0]! * K - 900, strand.y[0]! * K - 900)).toBeLessThan(1);

    sim.step([{ id: "b", x: 500, y: 500 }], FRAME, mat, BOUNDS);
    expect(rope(sim, "a")).toBeUndefined();
    expect(rope(sim, "b")).toBeDefined();
  });

  it("holds still on a paused frame", () => {
    const sim = new GooStrandSim(() => 0.5);
    const mat = material();
    for (let i = 0; i < 30; i++) {
      sim.step([{ id: "a", x: 300, y: 300 }], FRAME, mat, BOUNDS);
    }
    const strand = rope(sim, "a")!;
    const x = [...strand.x];
    const y = [...strand.y];
    sim.step([{ id: "a", x: 300, y: 300 }], 0, mat, BOUNDS);
    expect([...strand.x]).toEqual(x);
    expect([...strand.y]).toEqual(y);
  });
});
