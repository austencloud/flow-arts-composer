import { describe, expect, it } from "vitest";
import type { MandalaShift } from "../../domain/mandala-shift-types";
import {
  breathAt,
  colorPhaseAt,
  shiftFrameAt,
  shiftHoldBeats,
  spinAt,
} from "../mandala-shift";

const everyBar: MandalaShift = { every: 1, unit: "bars", morph: 2 };

describe("shiftFrameAt", () => {
  it("holds each sequence for a bar and wraps to the first", () => {
    expect(shiftHoldBeats(everyBar, 4)).toBe(4);
    expect(shiftFrameAt(everyBar, 3, 0, 4)).toMatchObject({ from: 0, to: 1, hold: 0 });
    expect(shiftFrameAt(everyBar, 3, 4, 4)).toMatchObject({ from: 1, to: 2, hold: 1 });
    expect(shiftFrameAt(everyBar, 3, 8, 4)).toMatchObject({ from: 2, to: 0, hold: 2 });
    expect(shiftFrameAt(everyBar, 3, 12, 4)).toMatchObject({ from: 0, to: 1, hold: 3 });
  });

  it("morphs through the last beats of a hold and lands on the boundary", () => {
    expect(shiftFrameAt(everyBar, 3, 2, 4).morphT).toBe(0);
    const mid = shiftFrameAt(everyBar, 3, 3, 4).morphT;
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
    expect(shiftFrameAt(everyBar, 3, 3.999, 4).morphT).toBeGreaterThan(0.99);
    expect(shiftFrameAt(everyBar, 3, 4, 4)).toMatchObject({ from: 1, morphT: 0 });
  });

  it("counts holds in beats when the unit is beats", () => {
    const everyTwoBeats: MandalaShift = { every: 2, unit: "beats", morph: 1 };
    expect(shiftHoldBeats(everyTwoBeats, 4)).toBe(2);
    expect(shiftFrameAt(everyTwoBeats, 2, 2, 4)).toMatchObject({ from: 1, to: 0, hold: 1 });
  });

  it("clamps a morph longer than the hold, so it is always moving", () => {
    const long: MandalaShift = { every: 2, unit: "beats", morph: 4 };
    expect(shiftFrameAt(long, 2, 0.001, 4).morphT).toBeGreaterThan(0);
    expect(shiftFrameAt(long, 2, 1.999, 4).morphT).toBeGreaterThan(0.99);
  });

  it("never morphs one sequence, and nothing before the anchor", () => {
    expect(shiftFrameAt(everyBar, 1, 3.5, 4)).toEqual({ from: 0, to: 0, morphT: 0, hold: 0 });
    expect(shiftFrameAt(everyBar, 0, 3.5, 4)).toEqual({ from: 0, to: 0, morphT: 0, hold: 0 });
    expect(shiftFrameAt(everyBar, 3, -2, 4)).toMatchObject({ from: 0, to: 1, morphT: 0, hold: 0 });
  });
});

describe("breath, spin and colour", () => {
  it("is open on the downbeat, at rest half a breath later, open again at the end", () => {
    expect(breathAt(0, 4)).toBeCloseTo(1);
    expect(breathAt(2, 4)).toBe(0);
    expect(breathAt(4, 4)).toBeCloseTo(1);
    expect(breathAt(1, 4)).toBeCloseTo(breathAt(3, 4));
    expect(breathAt(-1, 4)).toBeCloseTo(breathAt(3, 4));
  });

  it("spins by the bar", () => {
    expect(spinAt(8, 4, 30)).toBe(60);
    expect(spinAt(8, 4, 0)).toBe(0);
  });

  it("cycles the flow colours once every three breaths", () => {
    expect(colorPhaseAt(0, 4)).toBe(0);
    expect(colorPhaseAt(6, 4)).toBeCloseTo(0.5);
    expect(colorPhaseAt(12, 4)).toBe(0);
  });
});
