import { describe, expect, it } from "vitest";
import {
  cycleSlotCount,
  resolveCycleBeatIndex,
  resolveCycleStep,
  resolvePreviewCycleStep,
} from "./loop-cycle";

/**
 * The gallery card preview's clock. These assertions guard behavior that is
 * invisible in a still frame: how long one repeat lasts, which slot a
 * free-running clock lands on, and — above all — that a seamlessly loopable
 * sequence keeps spinning at exactly its own beat count.
 *
 * `performsStartSlot` is exercised against real sequences in
 * tests/unit/browse/gallery-preview-cycle.test.ts — shared/ may not import a
 * feature's fixtures.
 */

describe("resolvePreviewCycleStep", () => {
  const STEP_COUNT = 4;

  it("adds no playback time to a seamlessly loopable repeat", () => {
    // The pre-fix clock, verbatim. A loopable sequence must still match it
    // beat for beat: no held pose, no padded cycle, same cadence.
    const legacy = (elapsed: number) => (elapsed % STEP_COUNT) + 1;
    for (let frame = 0; frame <= 400; frame++) {
      const elapsed = frame / 8;
      expect(resolvePreviewCycleStep(elapsed, STEP_COUNT, false)).toBeCloseTo(
        legacy(elapsed),
        10
      );
    }
  });

  it("repeats a loopable sequence on its own beat count", () => {
    expect(cycleSlotCount(STEP_COUNT, false)).toBe(STEP_COUNT);
    expect(resolvePreviewCycleStep(STEP_COUNT, STEP_COUNT, false)).toBe(
      resolvePreviewCycleStep(0, STEP_COUNT, false)
    );
    // Beat k begins exactly k-1 beats in — the seam costs nothing.
    for (let beat = 1; beat <= STEP_COUNT; beat++) {
      expect(resolvePreviewCycleStep(beat - 1, STEP_COUNT, false)).toBe(beat);
    }
  });

  it("never holds a pose for a loopable sequence", () => {
    for (let frame = 0; frame <= 200; frame++) {
      const step = resolvePreviewCycleStep(frame / 8, STEP_COUNT, false);
      expect(step).toBeGreaterThanOrEqual(1);
      expect(resolveCycleBeatIndex(step, STEP_COUNT)).not.toBeNull();
    }
  });

  it("opens in motion, then performs the start hold at a freeform seam", () => {
    const slots = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((beats) =>
      resolvePreviewCycleStep(beats, STEP_COUNT, true)
    );
    // beats 1..4, start hold, beats 1..4, start hold — the canonical freeform
    // loop, and never a held pose on the very first pass.
    expect(slots).toEqual([1, 2, 3, 4, 0, 1, 2, 3, 4, 0]);
    expect(cycleSlotCount(STEP_COUNT, true)).toBe(STEP_COUNT + 1);
  });
});

describe("resolveCycleStep", () => {
  it("keeps progress within a beat in the fraction", () => {
    expect(resolveCycleStep(2.25, 4, true)).toBeCloseTo(2.25, 10);
    expect(resolveCycleStep(0.5, 4, true)).toBeCloseTo(0.5, 10);
    expect(resolveCycleStep(2.25, 4, false)).toBeCloseTo(3.25, 10);
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
