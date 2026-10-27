import { describe, expect, it } from "vitest";
import {
  PACE_CEILING,
  PACE_SAMPLES,
  PACE_TARGET,
  addBootSample,
  createOverturePacer,
  expectedBootMs,
  medianBootMs,
} from "./overture-pace";

const PROFILE = { t: { hydrated: 2400, ready: 3870, composed: 6380 } };

/** Runs a pacer at 60 fps from `from` to `to`, returning [time, p] per frame. */
function run(
  pacer: ReturnType<typeof createOverturePacer>,
  from: number,
  to: number,
  events: Record<number, () => void> = {}
): [number, number][] {
  const out: [number, number][] = [];
  for (let t = from; t <= to; t += 16) {
    for (const [at, fire] of Object.entries(events)) {
      if (Number(at) > t - 16 && Number(at) <= t) fire();
    }
    out.push([t, pacer.at(t)]);
  }
  return out;
}

/** Fraction per second between two frames. */
function speedAt(frames: [number, number][], i: number): number {
  const [t0, p0] = frames[i - 1]!;
  const [t1, p1] = frames[i]!;
  return ((p1 - p0) / (t1 - t0)) * 1000;
}

describe("the steady pace", () => {
  it("arrives near the target when the boot ends on time, at an even speed", () => {
    const pacer = createOverturePacer({
      start: 600,
      expected: 6380,
      profile: PROFILE,
    });
    const frames = run(pacer, 600, 6380, {
      2400: () => pacer.milestone("hydrated", 2400),
      3870: () => pacer.milestone("ready", 3870),
    });
    const last = frames[frames.length - 1]![1];
    expect(last).toBeGreaterThan(PACE_TARGET - 0.08);
    expect(last).toBeLessThanOrEqual(PACE_TARGET + 0.01);
    // The speed stays within a narrow band: no fast opening and no crawl.
    const speeds = frames
      .map((_, i) => (i === 0 ? null : speedAt(frames, i)))
      .filter((s): s is number => s !== null);
    expect(Math.max(...speeds) / Math.min(...speeds)).toBeLessThan(1.05);
  });

  it("starts at the planned speed instead of leaping or stalling", () => {
    const pacer = createOverturePacer({
      start: 600,
      expected: 6380,
      profile: PROFILE,
    });
    const frames = run(pacer, 600, 700);
    const planned = (PACE_TARGET / (6380 - 600)) * 1000;
    expect(speedAt(frames, 2)).toBeCloseTo(planned, 2);
  });

  it("slows gradually when a milestone runs late, and never goes back", () => {
    const pacer = createOverturePacer({
      start: 600,
      expected: 6380,
      profile: PROFILE,
    });
    // Hydrated was due at 2400 and lands at 4400; the boot ends at 8380.
    let endAfterHydrated = 0;
    const frames = run(pacer, 600, 8380, {
      4400: () => {
        pacer.milestone("hydrated", 4400);
        endAfterHydrated = pacer.end();
      },
    });
    expect(endAfterHydrated).toBeCloseTo(8380, 0);
    for (let i = 2; i < frames.length; i++) {
      expect(frames[i]![1]).toBeGreaterThanOrEqual(frames[i - 1]![1]);
      // No frame-to-frame speed change bigger than a few percent of the pace.
      expect(
        Math.abs(speedAt(frames, i) - speedAt(frames, i - 1))
      ).toBeLessThan(0.02);
    }
    expect(frames[frames.length - 1]![1]).toBeGreaterThan(PACE_TARGET - 0.08);
  });

  it("slows while the next milestone is overdue, before it arrives", () => {
    const pacer = createOverturePacer({
      start: 600,
      expected: 6380,
      profile: PROFILE,
    });
    const frames = run(pacer, 600, 4000);
    // Hydrated was due at 2400 and has not come: by 4000 the pen has eased off.
    expect(pacer.end()).toBeCloseTo(6380 + 1600, -2);
    expect(speedAt(frames, frames.length - 1)).toBeLessThan(
      speedAt(frames, 10) * 0.9
    );
  });

  it("past the expected end it creeps toward the target without passing it", () => {
    const pacer = createOverturePacer({
      start: 600,
      expected: 3000,
      profile: PROFILE,
    });
    const frames = run(pacer, 600, 20000);
    const late = frames.filter(([t]) => t > 5000);
    expect(late[late.length - 1]![1]).toBeLessThanOrEqual(PACE_CEILING);
    expect(speedAt(late, late.length - 1)).toBeLessThan(speedAt(late, 1));
  });

  it("scales the profile's milestones to the learned boot length", () => {
    // This machine boots in 12.76 s, twice the profile; hydrated at 4800 is on time.
    const pacer = createOverturePacer({
      start: 600,
      expected: 12760,
      profile: PROFILE,
    });
    pacer.milestone("hydrated", 4800);
    expect(pacer.end()).toBeCloseTo(12760, 0);
    pacer.milestone("unknown", 9000);
    expect(pacer.end()).toBeCloseTo(12760, 0);
  });

  it("does not jump after a long frame gap", () => {
    const pacer = createOverturePacer({
      start: 0,
      expected: 6000,
      profile: null,
    });
    run(pacer, 0, 2000);
    const before = pacer.at(2000);
    expect(pacer.at(4000) - before).toBeLessThan(0.05);
  });

  it("finishes the rest at about the speed it was running, within bounds", () => {
    const pacer = createOverturePacer({
      start: 600,
      expected: 6380,
      profile: PROFILE,
    });
    const frames = run(pacer, 600, 6380);
    const p = frames[frames.length - 1]![1];
    const ms = pacer.finishMs(p);
    expect(ms).toBeGreaterThanOrEqual(120);
    expect(ms).toBeLessThanOrEqual(300);
    expect(pacer.finishMs(1)).toBe(120);
    // A boot that ends far earlier than expected still finishes in time.
    const early = createOverturePacer({
      start: 0,
      expected: 6000,
      profile: null,
    });
    run(early, 0, 1000);
    expect(early.finishMs(early.at(1000))).toBe(300);
  });
});

describe("the learned boot length", () => {
  it("is the median of the last boots, robust to one odd boot", () => {
    expect(medianBootMs([4000, 4200, 15000, 4100, 3900])).toBe(4100);
    expect(medianBootMs([4000, 5000])).toBe(4500);
    expect(medianBootMs([])).toBeNull();
    expect(medianBootMs("nope")).toBeNull();
    expect(medianBootMs([0, -3, "x"])).toBeNull();
  });

  it("keeps the newest few boots", () => {
    let samples: number[] = [];
    for (let i = 1; i <= 8; i++)
      samples = addBootSample(samples, i * 1000 + 0.4);
    expect(samples).toHaveLength(PACE_SAMPLES);
    expect(samples[samples.length - 1]).toBe(8000);
    expect(addBootSample("junk", 3000)).toEqual([3000]);
  });

  it("falls back to the profile's end, then the default", () => {
    expect(expectedBootMs(5000, PROFILE)).toBe(5000);
    expect(expectedBootMs(null, PROFILE)).toBe(6380);
    expect(expectedBootMs(null, { t: { ready: 3000 } })).toBe(3000);
    expect(expectedBootMs(null, null)).toBe(6380);
  });
});
