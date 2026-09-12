import { describe, expect, it } from "vitest";
import { buildStripWindow, nextLoopOffset } from "./strip-window";
import { resolvePreviewCycleStep } from "./loop-cycle";

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
 * The reported defect end to end: a preview clock feeding the carousel's index
 * math. The focus index must never fall backwards — StepStrip reads a
 * decreasing index as a scrub and disables its slide transition, which is the
 * instant pop the report describes.
 *
 * The rail always carries its Start cell (the card morph pairs against it), so
 * for a seamlessly loopable sequence the rail is one cell longer than the
 * repeat the clock performs. That difference is spent on the rail, not on the
 * clock: the carousel travels through the Start cell at the seam.
 */
describe("gallery preview wrap", () => {
  const STEP_COUNT = 4;
  /** buildNotationCells output: Start + one cell per beat. */
  const CELL_COUNT = STEP_COUNT + 1;
  const FRAMES_PER_BEAT = 30;

  function simulate(performsStartSlot: boolean, beats: number) {
    let offset = 0;
    let prevRaw = -1;
    const virtuals: number[] = [];
    const focusCells: number[] = [];

    for (let frame = 0; frame < beats * FRAMES_PER_BEAT; frame++) {
      const step = resolvePreviewCycleStep(
        frame / FRAMES_PER_BEAT,
        STEP_COUNT,
        performsStartSlot
      );
      const raw = Math.floor(step);
      offset = nextLoopOffset(offset, prevRaw, raw, CELL_COUNT);
      prevRaw = raw;

      const activeVirtualIndex = raw + offset;
      virtuals.push(activeVirtualIndex);
      const window = buildStripWindow({
        ...RAIL,
        activeVirtualIndex,
        cellCount: CELL_COUNT,
        loop: true,
      });
      focusCells.push(window.find((item) => item.dist === 0)?.ci ?? -1);
    }

    return { virtuals, focusCells };
  }

  /** Distinct focus cells in the order they were visited. */
  function visitOrder(focusCells: number[]): number[] {
    const ordered: number[] = [];
    for (const ci of focusCells) {
      if (ordered[ordered.length - 1] !== ci) ordered.push(ci);
    }
    return ordered;
  }

  it("keeps a loopable carousel moving forward through the seam", () => {
    const { virtuals } = simulate(false, 13);
    for (let i = 1; i < virtuals.length; i++) {
      const advance = virtuals[i]! - virtuals[i - 1]!;
      expect(advance).toBeGreaterThanOrEqual(0);
      // At most one seam stride: the carousel travels, it never resets.
      expect(advance).toBeLessThanOrEqual(2);
    }
    expect(virtuals.at(-1)!).toBeGreaterThan(virtuals[0]!);
  });

  it("spends the loopable seam on the Start cell, not on playback", () => {
    const { virtuals, focusCells } = simulate(false, 13);

    // The one index the focus steps over at each seam is the Start cell: the
    // rail passes through it instead of holding a beat there.
    const skipped = new Set<number>();
    for (let i = 1; i < virtuals.length; i++) {
      for (let vi = virtuals[i - 1]! + 1; vi < virtuals[i]!; vi++) {
        skipped.add(((vi % CELL_COUNT) + CELL_COUNT) % CELL_COUNT);
      }
    }
    expect([...skipped]).toEqual([0]);

    // And no frame rests on it, so the repeat is exactly STEP_COUNT beats.
    expect(focusCells).not.toContain(0);
    expect(visitOrder(focusCells).slice(0, 6)).toEqual([1, 2, 3, 4, 1, 2]);
  });

  it("gives a freeform seam its performed start beat, one stride at a time", () => {
    const { virtuals, focusCells } = simulate(true, 13);
    for (let i = 1; i < virtuals.length; i++) {
      expect(virtuals[i]! - virtuals[i - 1]!).toBeGreaterThanOrEqual(0);
      expect(virtuals[i]! - virtuals[i - 1]!).toBeLessThanOrEqual(1);
    }
    expect(visitOrder(focusCells).slice(0, 7)).toEqual([1, 2, 3, 4, 0, 1, 2]);
    // A performed hold, so the Start cell holds the focus like any other beat.
    expect(focusCells.filter((ci) => ci === 0)).toHaveLength(
      2 * FRAMES_PER_BEAT
    );
  });
});

/**
 * Existing consumers of the shared strip, whose behavior the extraction must
 * leave untouched: the non-looping rails (practice lane, landing showcase,
 * pattern strip) and the endless spinner's looping lane, which drops the Start
 * cell so its repeat and its rail are the same length.
 */
describe("existing StepStrip consumers", () => {
  it("keeps a non-looping rail clamped, monotonic and fully primary", () => {
    const cellCount = 6;
    let previous: number | null = null;
    for (let index = 0; index < cellCount; index++) {
      const window = buildStripWindow({
        ...RAIL,
        activeVirtualIndex: index,
        cellCount,
        loop: false,
      });
      expect(window.every((item) => item.ci >= 0 && item.ci < cellCount)).toBe(
        true
      );
      expect(window.every((item) => item.primary)).toBe(true);
      expect(window.find((item) => item.dist === 0)?.ci).toBe(index);
      const first = window[0]!.vi;
      if (previous !== null) expect(first).toBeGreaterThanOrEqual(previous);
      previous = first;
    }
  });

  it("wraps the spinner lane one stride at a time", () => {
    // SpinnerStepLane drops the Start cell and shifts the step by −1, so its
    // repeat equals its cell count: every wrap is an ordinary stride.
    const cellCount = 8;
    let offset = 0;
    let prevRaw = -1;
    const focusCells: number[] = [];
    let maxAdvance = 0;
    let previousVirtual: number | null = null;

    for (let beat = 0; beat < cellCount * 3; beat++) {
      const raw = beat % cellCount;
      offset = nextLoopOffset(offset, prevRaw, raw, cellCount);
      prevRaw = raw;
      const activeVirtualIndex = raw + offset;
      if (previousVirtual !== null) {
        maxAdvance = Math.max(maxAdvance, activeVirtualIndex - previousVirtual);
        expect(activeVirtualIndex).toBeGreaterThan(previousVirtual);
      }
      previousVirtual = activeVirtualIndex;
      const window = buildStripWindow({
        ...RAIL,
        activeVirtualIndex,
        cellCount,
        loop: true,
      });
      focusCells.push(window.find((item) => item.dist === 0)?.ci ?? -1);
    }

    expect(maxAdvance).toBe(1);
    expect(focusCells.slice(0, cellCount)).toEqual(
      Array.from({ length: cellCount }, (_, i) => i)
    );
    expect(focusCells.slice(cellCount, cellCount * 2)).toEqual(
      Array.from({ length: cellCount }, (_, i) => i)
    );
  });
});
