import { describe, expect, it } from "vitest";
import { buildStripWindow, nextLoopOffset } from "./strip-window";
import { resolveCycleStep } from "./loop-cycle";

const RAIL = {
  anchor: "center" as const,
  primarySize: 300,
  focusOffset: 120,
  stride: 50,
  buffer: 1,
};

describe("nextLoopOffset", () => {
  it("adds one full cell list when the raw step wraps", () => {
    expect(nextLoopOffset(0, 3, 0, 4)).toBe(4);
    expect(nextLoopOffset(4, 3, 0, 4)).toBe(8);
  });

  it("leaves the offset alone while the step advances", () => {
    expect(nextLoopOffset(4, 1, 2, 4)).toBe(4);
    expect(nextLoopOffset(4, 2, 2, 4)).toBe(4);
  });

  it("ignores the uninitialized previous step", () => {
    expect(nextLoopOffset(0, -1, 0, 4)).toBe(0);
  });
});

describe("buildStripWindow", () => {
  it("clamps to the real cells when not looping", () => {
    const window = buildStripWindow({
      ...RAIL,
      activeVirtualIndex: 0,
      cellCount: 4,
      loop: false,
    });
    expect(window.map((item) => item.ci)).toEqual([0, 1, 2, 3]);
    expect(window.every((item) => item.primary)).toBe(true);
  });

  it("renders wrapped neighbours on both sides when looping", () => {
    const window = buildStripWindow({
      ...RAIL,
      activeVirtualIndex: 0,
      cellCount: 4,
      loop: true,
    });
    // Indices run past zero; the cells behind the focus come from the previous
    // repeat, which is what the track slides out of instead of cutting.
    expect(window.some((item) => item.vi < 0)).toBe(true);
    expect(window.find((item) => item.vi === -1)?.ci).toBe(3);
    expect(window.find((item) => item.vi === 0)?.ci).toBe(0);
    expect(window.find((item) => item.vi === 4)?.ci).toBe(0);
  });

  it("keeps the focus on its own cell after many repeats", () => {
    const cellCount = 5;
    for (let repeat = 0; repeat < 6; repeat++) {
      for (let index = 0; index < cellCount; index++) {
        const activeVirtualIndex = index + repeat * cellCount;
        const window = buildStripWindow({
          ...RAIL,
          activeVirtualIndex,
          cellCount,
          loop: true,
        });
        const focus = window.find((item) => item.dist === 0);
        expect(focus?.ci).toBe(index);
      }
    }
  });

  it("marks exactly one copy of each cell as primary", () => {
    const cellCount = 3;
    const window = buildStripWindow({
      ...RAIL,
      activeVirtualIndex: 7,
      cellCount,
      loop: true,
    });
    // A short sequence in a wide rail genuinely repeats cells; only one copy
    // may carry the card morph's view-transition-name.
    expect(window.length).toBeGreaterThan(cellCount);
    for (let ci = 0; ci < cellCount; ci++) {
      const copies = window.filter((item) => item.ci === ci);
      expect(copies.length).toBeGreaterThan(1);
      expect(copies.filter((item) => item.primary)).toHaveLength(1);
    }
    expect(window.find((item) => item.dist === 0)?.primary).toBe(true);
  });

  it("returns nothing for an empty rail", () => {
    expect(
      buildStripWindow({
        ...RAIL,
        activeVirtualIndex: 0,
        cellCount: 0,
        loop: true,
      })
    ).toEqual([]);
  });
});

/**
 * The reported defect end to end: the gallery preview's clock feeding the
 * carousel's index math. The focus index must never fall backwards — StepStrip
 * reads a decreasing index as a scrub and disables its slide transition, which
 * is the instant pop the report describes.
 */
describe("gallery preview wrap", () => {
  const stepCount = 4;
  const cellCount = stepCount + 1; // Start cell + beats, as the rail builds it

  function simulate(beatsPerFrame: number, frames: number) {
    let offset = 0;
    let prevRaw = -1;
    const virtuals: number[] = [];
    const focusCells: number[] = [];

    for (let frame = 0; frame < frames; frame++) {
      const step = resolveCycleStep(1 + frame * beatsPerFrame, stepCount, true);
      const raw = Math.floor(step);
      offset = nextLoopOffset(offset, prevRaw, raw, cellCount);
      prevRaw = raw;

      const activeVirtualIndex = raw + offset;
      virtuals.push(activeVirtualIndex);
      const window = buildStripWindow({
        ...RAIL,
        activeVirtualIndex,
        cellCount,
        loop: true,
      });
      focusCells.push(window.find((item) => item.dist === 0)?.ci ?? -1);
    }

    return { virtuals, focusCells };
  }

  it("never moves the carousel backwards across a boundary", () => {
    const { virtuals } = simulate(1 / 30, 400); // ~13 beats at 30 frames/beat
    for (let i = 1; i < virtuals.length; i++) {
      expect(virtuals[i]!).toBeGreaterThanOrEqual(virtuals[i - 1]!);
      // One stride at a time: the boundary is an ordinary advance, not a jump.
      expect(virtuals[i]! - virtuals[i - 1]!).toBeLessThanOrEqual(1);
    }
  });

  it("gives the start cell its turn in the focus on every repeat", () => {
    const { focusCells } = simulate(1 / 30, 400);
    const visits = focusCells.filter((ci) => ci === 0).length;
    expect(visits).toBeGreaterThan(0);
    // Each beat is 30 frames, and the start slot is one beat like any other.
    expect(visits).toBeGreaterThanOrEqual(30);

    // The first pass starts in motion (no held pose on tap) and the start cell
    // arrives only when the cycle reaches it.
    expect(focusCells[0]).toBe(1);
    expect(focusCells.slice(0, 30).every((ci) => ci === 1)).toBe(true);
  });

  it("visits every cell in order within a repeat", () => {
    const { focusCells } = simulate(1 / 4, 4 * cellCount * 2);
    const ordered: number[] = [];
    for (const ci of focusCells) {
      if (ordered[ordered.length - 1] !== ci) ordered.push(ci);
    }
    expect(ordered.slice(0, 6)).toEqual([1, 2, 3, 4, 0, 1]);
  });
});
