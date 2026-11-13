import { describe, expect, it } from "vitest";
import {
  justifiedCardWidth,
  justifiedTargetHeight,
  packJustifiedRows,
  type JustifiedRow,
} from "#lib/shared/browse/components/justified-rows.js";
import { calculateGalleryAspectRatio } from "#lib/shared/render/services/layout-calculator.js";

const GAP = 8;
const shape = (steps: number) => calculateGalleryAspectRatio(steps, "row");

function rowWidth(row: JustifiedRow, aspects: readonly number[]): number {
  let width = (row.count - 1) * GAP;
  for (let i = row.start; i < row.start + row.count; i++) {
    width += justifiedCardWidth(aspects[i] ?? 1, row.height);
  }
  return width;
}

function coversEveryCardOnce(rows: readonly JustifiedRow[], total: number) {
  let next = 0;
  for (const row of rows) {
    expect(row.start).toBe(next);
    expect(row.count).toBeGreaterThan(0);
    next += row.count;
  }
  expect(next).toBe(total);
}

describe("justified rows", () => {
  it("packs a single length into today's columns at today's card size", () => {
    const width = 1000;
    const columns = 5;
    const target = justifiedTargetHeight(width, columns, GAP, shape(4));
    const aspects = Array.from({ length: 12 }, () => shape(4));

    const rows = packJustifiedRows(aspects, {
      width,
      gap: GAP,
      targetHeight: target,
    });

    coversEveryCardOnce(rows, aspects.length);
    expect(rows.map((r) => r.count)).toEqual([5, 5, 2]);
    const todaysColumnWidth = (width - (columns - 1) * GAP) / columns;
    for (const row of rows) {
      expect(row.height).toBeCloseTo(target, 6);
      expect(justifiedCardWidth(shape(4), row.height)).toBeCloseTo(
        todaysColumnWidth,
        6
      );
    }
  });

  it("draws a mixed row at one height that fills the width exactly", () => {
    // Level 2, letter A at 1253×1130: 4, 4, 8, 12, 12 and more after it.
    const width = 1100;
    const target = justifiedTargetHeight(width, 6, GAP, shape(4));
    const aspects = [4, 4, 8, 12, 12, 16, 8, 4, 4, 4, 12, 8, 8, 4].map(shape);

    const rows = packJustifiedRows(aspects, {
      width,
      gap: GAP,
      targetHeight: target,
    });

    coversEveryCardOnce(rows, aspects.length);
    const filled = rows.filter((r) => r.filled);
    expect(filled.length).toBeGreaterThan(0);
    for (const row of filled) {
      expect(rowWidth(row, aspects)).toBeCloseTo(width, 6);
      expect(row.height).toBeLessThanOrEqual(target * 1.3);
    }
  });

  it("keeps the last row at the target height, set left, never stretched", () => {
    const width = 1000;
    const target = justifiedTargetHeight(width, 5, GAP, shape(4));
    const aspects = [4, 4, 4, 4, 4, 8, 12].map(shape);

    const rows = packJustifiedRows(aspects, {
      width,
      gap: GAP,
      targetHeight: target,
    });
    const last = rows[rows.length - 1]!;

    expect(last.filled).toBe(false);
    expect(last.height).toBe(target);
    expect(rowWidth(last, aspects)).toBeLessThan(width);
  });

  it("shrinks a single very wide card to fit a narrow phone", () => {
    const width = 359; // 375 wide phone less the gutters
    const target = justifiedTargetHeight(width, 1, GAP, shape(4));
    const aspects = [shape(8)];
    expect(justifiedCardWidth(aspects[0]!, target)).toBeGreaterThan(width);

    const rows = packJustifiedRows(aspects, {
      width,
      gap: GAP,
      targetHeight: target,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]!.count).toBe(1);
    expect(rowWidth(rows[0]!, aspects)).toBeCloseTo(width, 6);
  });

  it("never stretches a row above 1.3 times the target", () => {
    // Two wide cards that do not fit together: one alone would have to grow
    // to 1.67 times the target, so both share a shrunk row instead.
    const rows = packJustifiedRows([3, 3, 1], {
      width: 1000,
      gap: GAP,
      targetHeight: 200,
    });

    expect(rows[0]).toMatchObject({ start: 0, count: 2, filled: true });
    expect(rows[0]!.height).toBeCloseTo((1000 - GAP) / 6, 6);
  });

  it("picks the card count whose height lands nearest the target", () => {
    // Stretching four to fill lands at 1.1 times the target; squeezing in a
    // fifth lands far below it. Four wins.
    const stretchFour = packJustifiedRows([1, 1, 1, 1, 2, 1], {
      width: 4 * 110 + 3 * GAP,
      gap: GAP,
      targetHeight: 100,
    });
    expect(stretchFour[0]).toMatchObject({ count: 4, filled: true });
    expect(stretchFour[0]!.height).toBeCloseTo(110, 6);

    // Here four would stretch to 1.25 times the target, while squeezing in a
    // fifth lands just under it. Five wins.
    const squeezeFive = packJustifiedRows([1, 1, 1, 1, 1, 1], {
      width: 4 * 125 + 3 * GAP,
      gap: GAP,
      targetHeight: 100,
    });
    expect(squeezeFive[0]).toMatchObject({ count: 5, filled: true });
    expect(squeezeFive[0]!.height).toBeCloseTo((4 * 125 - GAP) / 5, 6);
  });
});
