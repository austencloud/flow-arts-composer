import { describe, expect, it } from "vitest";
import {
  GOO_NODES,
  GooStrandSim,
  resolveGooShape,
  ropeLength,
  type GooMaterial,
  type GooTipInput,
} from "./goo-strand-sim";

const BOUNDS = { width: 1068, height: 1068 };
const FRAME = 1 / 60;
const END = GOO_NODES - 1;

function material(patch: Partial<GooMaterial> = {}): GooMaterial {
  return {
    viscosity: 0.45,
    amount: 0.6,
    ambient: 0.4,
    intensity: 0.6,
    gravity: 1,
    scale: 2.136,
    referenceSpeed: 3 * 60 * 2.136,
    ...patch,
  };
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
  let impacts = 0;
  for (let t = 0; t < seconds; t += FRAME) {
    const tip: GooTipInput = { id: "0-0", ...tipAt(t) };
    const before = new Map(sim.drops.map((d) => [d, d.y]));
    sim.step([tip], FRAME, mat, BOUNDS);
    impacts += sim.impacts.length;
    for (const drop of sim.drops) {
      if (!before.has(drop)) drips++;
      else if (drop.y > before.get(drop)!) dropFell = true;
    }
    const strand = sim.strands.get("0-0")!;
    longest = Math.max(longest, ropeLength(strand));
    if (strand.y[END]! > tip.y + 10) hungBelow = true;
  }
  return { sim, drips, longest, hungBelow, dropFell, impacts };
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

  it("makes thick goo drip less often and stretch further than watery goo", () => {
    const watery = simulate(material({ viscosity: 0 }), 30, still);
    const thick = simulate(material({ viscosity: 1 }), 30, still);
    expect(watery.drips).toBeGreaterThan(thick.drips);
    expect(thick.longest).toBeGreaterThan(watery.longest);
  });

  it("drips faster at rest when the steady flow is turned up", () => {
    const trickle = simulate(material({ ambient: 0.2 }), 30, still);
    const flowing = simulate(material({ ambient: 1 }), 30, still);
    expect(flowing.drips).toBeGreaterThan(trickle.drips);
  });

  it("throws drops at the glass off a spinning tip without stretching forever", () => {
    const mat = material();
    const run = simulate(mat, 6, spin);
    expect(run.drips).toBeGreaterThan(3);
    expect(run.impacts).toBeGreaterThan(0);
    // The rope stops growing at its longest; one frame of travel may overshoot.
    expect(run.longest).toBeLessThan(resolveGooShape(mat).maxLength * 1.5);
  });

  it("restarts the rope on a tip that jumps and drops ropes of lost tips", () => {
    const sim = new GooStrandSim(() => 0.5);
    const mat = material();
    for (let i = 0; i < 60; i++) {
      sim.step([{ id: "a", x: 100, y: 100 }], FRAME, mat, BOUNDS);
    }
    sim.step([{ id: "a", x: 900, y: 900 }], FRAME, mat, BOUNDS);
    const strand = sim.strands.get("a")!;
    expect(Math.hypot(strand.x[END]! - 900, strand.y[END]! - 900)).toBeLessThan(
      5
    );

    sim.step([{ id: "b", x: 500, y: 500 }], FRAME, mat, BOUNDS);
    expect([...sim.strands.keys()]).toEqual(["b"]);
  });

  it("holds still on a paused frame", () => {
    const sim = new GooStrandSim(() => 0.5);
    const mat = material();
    for (let i = 0; i < 30; i++) {
      sim.step([{ id: "a", x: 300, y: 300 }], FRAME, mat, BOUNDS);
    }
    const strand = sim.strands.get("a")!;
    const x = [...strand.x];
    const y = [...strand.y];
    sim.step([{ id: "a", x: 300, y: 300 }], 0, mat, BOUNDS);
    expect([...strand.x]).toEqual(x);
    expect([...strand.y]).toEqual(y);
  });
});
