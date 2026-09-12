import { describe, expect, it } from "vitest";
import {
  cycleSlotCount,
  resolveCycleBeatIndex,
  resolveCycleStep,
} from "./loop-cycle";

/**
 * The gallery card preview's clock. These assertions guard behavior that is
 * invisible in a still frame: which slot a free-running clock lands on, and
 * whether the repeat length matches the rail it drives.
 */
describe("resolveCycleStep", () => {
  it("performs the start slot in order, once per repeat", () => {
    const stepCount = 3;
    const slots = [0, 1, 2, 3, 4, 5, 6, 7].map((beats) =>
      resolveCycleStep(beats, stepCount, true)
    );
    // start, beat1, beat2, beat3, start, beat1, beat2, beat3
    expect(slots).toEqual([0, 1, 2, 3, 0, 1, 2, 3]);
  });

  it("repeats on the rail's cell count, not the beat count", () => {
    const stepCount = 4;
    expect(cycleSlotCount(stepCount, true)).toBe(5);
    expect(resolveCycleStep(5, stepCount, true)).toBe(
      resolveCycleStep(0, stepCount, true)
    );
    // The pre-fix formula `(elapsed % stepCount) + 1` repeated every 4 beats
    // against a 5-cell rail — one beat short of the rail, which is what made
    // the boundary fall backwards.
    expect(resolveCycleStep(4, stepCount, true)).not.toBe(
      resolveCycleStep(0, stepCount, true)
    );
  });

  it("keeps progress within a beat in the fraction", () => {
    expect(resolveCycleStep(2.25, 4, true)).toBeCloseTo(2.25, 10);
    expect(resolveCycleStep(0.5, 4, true)).toBeCloseTo(0.5, 10);
  });

  it("never lands on the start slot when the surface omits it", () => {
    const stepCount = 3;
    for (const beats of [0, 0.5, 1, 2, 2.99, 3, 4.5]) {
      const step = resolveCycleStep(beats, stepCount, false);
      expect(step).toBeGreaterThanOrEqual(1);
      expect(step).toBeLessThan(stepCount + 1);
    }
    expect(resolveCycleStep(3, stepCount, false)).toBe(
      resolveCycleStep(0, stepCount, false)
    );
  });

  it("stays inside the cycle for a negative or unusable clock", () => {
    expect(resolveCycleStep(-1, 3, true)).toBe(3);
    expect(resolveCycleStep(-0.25, 3, true)).toBeCloseTo(3.75, 10);
    expect(resolveCycleStep(Number.NaN, 3, true)).toBe(0);
    expect(resolveCycleStep(Number.POSITIVE_INFINITY, 3, true)).toBe(0);
  });

  it("survives a sequence with no beats", () => {
    expect(cycleSlotCount(0, true)).toBe(2);
    expect(resolveCycleStep(0, 0, true)).toBe(0);
    expect(resolveCycleStep(1, 0, true)).toBe(1);
  });
});

describe("resolveCycleBeatIndex", () => {
  it("reports the start slot instead of a beat", () => {
    expect(resolveCycleBeatIndex(0, 4)).toBeNull();
    expect(resolveCycleBeatIndex(0.99, 4)).toBeNull();
  });

  it("maps a 1-based step onto its 0-based beat", () => {
    expect(resolveCycleBeatIndex(1, 4)).toBe(0);
    expect(resolveCycleBeatIndex(1.75, 4)).toBe(0);
    expect(resolveCycleBeatIndex(4, 4)).toBe(3);
  });

  it("holds the final beat through its last fraction", () => {
    expect(resolveCycleBeatIndex(4.999, 4)).toBe(3);
  });
});
