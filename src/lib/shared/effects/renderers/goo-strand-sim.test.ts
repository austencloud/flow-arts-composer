import { describe, expect, it } from "vitest";
import {
  GooStrandSim,
  resolveGooShape,
  type GooMaterial,
  type GooTipInput,
} from "./goo-strand-sim";

const BOUNDS = { width: 1068, height: 1068 };
const FRAME = 1 / 60;

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

/** Run the sim and report what the strand and drops did along the way. */
function simulate(
  mat: GooMaterial,
  seconds: number,
  tipAt: (t: number) => { x: number; y: number }
) {
  const sim = new GooStrandSim(() => 0.5);
  let drips = 0;
  let maxReach = 0;
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
    const strand = sim.strands.get("0-0")!;
    const reach = Math.hypot(
      strand.head.x - strand.tail.x,
      strand.head.y - strand.tail.y
    );
    maxReach = Math.max(maxReach, reach);
    if (strand.head.y > tip.y + 10) hungBelow = true;
  }
  return { sim, drips, maxReach, hungBelow, dropFell };
}

const still = () => ({ x: 534, y: 300 });

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
    expect(thick.maxReach).toBeGreaterThan(watery.maxReach);
  });

  it("drips faster at rest when the steady flow is turned up", () => {
    const trickle = simulate(material({ ambient: 0.2 }), 30, still);
    const flowing = simulate(material({ ambient: 1 }), 30, still);
    expect(flowing.drips).toBeGreaterThan(trickle.drips);
  });

  it("throws drops off a spinning tip without stretching the strand forever", () => {
    const mat = material();
    const spin = (t: number) => ({
      x: 534 + Math.cos(t * Math.PI * 3) * 220,
      y: 534 + Math.sin(t * Math.PI * 3) * 220,
    });
    const run = simulate(mat, 6, spin);
    expect(run.drips).toBeGreaterThan(3);
    // Thin strands stop at 1.5x the pinch length; allow one substep of travel.
    expect(run.maxReach).toBeLessThan(resolveGooShape(mat).pinchLength * 1.6);
  });

  it("restarts the strand on a tip that jumps and drops strands of lost tips", () => {
    const sim = new GooStrandSim(() => 0.5);
    const mat = material();
    for (let i = 0; i < 60; i++) {
      sim.step([{ id: "a", x: 100, y: 100 }], FRAME, mat, BOUNDS);
    }
    sim.step([{ id: "a", x: 900, y: 900 }], FRAME, mat, BOUNDS);
    const strand = sim.strands.get("a")!;
    expect(Math.hypot(strand.head.x - 900, strand.head.y - 900)).toBeLessThan(
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
    const head = { ...sim.strands.get("a")!.head };
    sim.step([{ id: "a", x: 300, y: 300 }], 0, mat, BOUNDS);
    expect(sim.strands.get("a")!.head).toEqual(head);
  });
});
