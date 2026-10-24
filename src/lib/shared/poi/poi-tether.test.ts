import { describe, expect, it } from "vitest";
import { CAPS, capStrip } from "#lib/shared/guide-topics/caps-topic.js";
import {
  DEFAULT_POI_STRING_OPTIONS,
  poiHandTrack3D,
  samplePoiHandTrack,
  solvePoiHandPaths,
} from "./poi-hand-track.js";
import {
  POI_TETHER_POINTS,
  POI_TETHER_SEGMENTS,
  PoiTether,
  type PoiTetherSampler,
} from "./poi-tether.js";

// Gage's 1-EE: the right hand is a plain extension, one circle a beat.
const motions = capStrip(CAPS.find((c) => c.id === "1-EE")!)
  .slice(1)
  .map((step) => step.motions.right!);

/** A wall-plane 1-EE right hand at `bpm`, spinning from its first sample. */
function spinner(bpm: number) {
  const options = { ...DEFAULT_POI_STRING_OPTIONS, bpm };
  const track = poiHandTrack3D(
    solvePoiHandPaths(motions, options),
    "wall",
    options
  );
  const beat = 60 / bpm;
  const sample: PoiTetherSampler = (t, hand, head) =>
    samplePoiHandTrack(track, t / beat, hand, head);
  const sim = new PoiTether({ beatSeconds: beat });
  const h0 = new Float64Array(3);
  const p0 = new Float64Array(3);
  const h1 = new Float64Array(3);
  const p1 = new Float64Array(3);
  const span = 1e-3;
  sample(0, h0, p0);
  sample(span, h1, p1);
  sim.reset(
    h0,
    p0,
    0,
    [0, 1, 2].map((k) => (p1[k]! - p0[k]!) / span),
    [0, 1, 2].map((k) => (h1[k]! - h0[k]!) / span)
  );
  return { sim, sample, loop: track.beats * beat };
}

describe("PoiTether", () => {
  it("never stretches the string, even snapping slack to tight", () => {
    const { sim, sample } = spinner(60);
    const L = sim.options.stringLength;
    const rest = L / POI_TETHER_SEGMENTS;
    const p = sim.points;
    let longest = 0;
    for (let frame = 0; frame < 60 * 30; frame++) {
      sim.step(1 / 60, sample);
      for (let s = 0; s < POI_TETHER_SEGMENTS; s++) {
        const a = s * 3;
        const d = Math.hypot(
          p[a + 3]! - p[a]!,
          p[a + 4]! - p[a + 1]!,
          p[a + 5]! - p[a + 2]!
        );
        longest = Math.max(longest, d / rest);
      }
    }
    expect(longest).toBeLessThanOrEqual(1 + 1e-4);
  });

  it("keeps a plain extension on its path at 180 bpm", () => {
    const { sim, sample, loop } = spinner(180);
    let worst = 0;
    let slack = 0;
    for (let t = 0; t < loop * 4; t += 1 / 60) {
      sim.step(1 / 60, sample);
      if (t < loop) continue; // settling
      worst = Math.max(worst, sim.headError);
      if (sim.slack) slack++;
    }
    expect(worst).toBeLessThan(0.06);
    expect(slack).toBe(0);
    expect(sim.lost).toBe(false);
  });

  // Too slow for the spin to hold the poi out at the top, and the hand can't
  // reach far enough to hold it up, so the string goes slack there and the
  // head drops: nothing scripts it. The circle is centred on y = 0.
  it("goes slack at the top of a 40 bpm wall-plane circle", () => {
    const { sim, sample, loop } = spinner(40);
    let top = 0;
    let bottom = 0;
    let wasSlack = sim.slack;
    for (let t = 0; t < loop * 3; t += 1 / 60) {
      sim.step(1 / 60, sample);
      if (t > loop && sim.slack && !wasSlack) {
        if (sim.head[1]! > 0) top++;
        else bottom++;
      }
      wasSlack = sim.slack;
    }
    expect(top).toBeGreaterThan(0);
    expect(top).toBeGreaterThan(bottom);
  });

  it("gives the same poi at 30 and 144 frames a second", () => {
    const run = (fps: number) => {
      const { sim, sample } = spinner(120);
      for (let frame = 0; frame < fps * 3; frame++) sim.step(1 / fps, sample);
      return sim;
    };
    const slow = run(30);
    const fast = run(144);
    expect(Math.abs(slow.time - fast.time)).toBeLessThan(1e-9);
    for (let k = 0; k < 3; k++)
      expect(Math.abs(slow.head[k]! - fast.head[k]!)).toBeLessThan(1e-3);
  });

  it("gives identical output run to run", () => {
    const run = () => {
      const { sim, sample } = spinner(90);
      for (let frame = 0; frame < 600; frame++) sim.step(1 / 60, sample);
      return { points: Array.from(sim.points), tension: sim.tension };
    };
    const a = run();
    const b = run();
    expect(a.points).toHaveLength(POI_TETHER_POINTS * 3);
    expect(b).toEqual(a);
  });
});
