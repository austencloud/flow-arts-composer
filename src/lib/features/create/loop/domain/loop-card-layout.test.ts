import { describe, expect, it } from "vitest";
import {
  COMPARED_GAP,
  comparedRow,
  madeLayout,
} from "./loop-card-layout";

const phone = { width: 360, height: 380 };
const desktop = { width: 900, height: 780 };

function inside(
  room: { width: number; height: number },
  cell: { x: number; y: number; size: number }
) {
  return (
    cell.x >= 0 &&
    cell.y >= 0 &&
    cell.x + cell.size <= room.width + 0.01 &&
    cell.y + cell.size <= room.height + 0.01
  );
}

describe("LOOP card layout", () => {
  it.each([phone, desktop, { width: 915, height: 180 }])(
    "keeps every square inside the room (%o)",
    (room) => {
      for (let steps = 0; steps <= 16; steps++) {
        for (const repeats of [2, 4, 8]) {
          const card = madeLayout(room, Math.max(1, steps) * repeats, steps);
          for (const cell of [card.start, ...card.steps])
            expect(inside(room, cell)).toBe(true);
        }
      }
    }
  );

  const rooms = [
    { width: 336, height: 420 },
    { width: 366, height: 560 },
    { width: 800, height: 250 },
    { width: 790, height: 900 },
    { width: 1400, height: 700 },
    { width: 1880, height: 1380 },
  ];
  const rowsOf = (cells: { y: number }[]) =>
    [...new Set(cells.map((cell) => Math.round(cell.y)))].sort((a, b) => a - b);

  it("lays a one-step LOOP of four out in one row on a wide screen", () => {
    const card = madeLayout({ width: 1880, height: 1380 }, 4, 1);
    expect(rowsOf([card.start, ...card.steps])).toHaveLength(1);
    expect(card.start.x).toBeLessThan(card.steps[0]!.x);
  });

  it("lays a one-step LOOP of four out two by two on an upright phone", () => {
    const card = madeLayout({ width: 366, height: 560 }, 4, 1);
    expect(rowsOf(card.steps)).toHaveLength(2);
    expect(new Set(card.steps.map((cell) => Math.round(cell.x))).size).toBe(2);
    expect(card.start.y).toBeLessThan(card.steps[0]!.y);
  });

  it("folds a long repetition into rows of four on an upright phone", () => {
    const phone = madeLayout({ width: 366, height: 560 }, 16, 8);
    expect(new Set(phone.steps.map((cell) => Math.round(cell.x))).size).toBe(4);
    expect(rowsOf(phone.steps)).toHaveLength(4);
    const wide = madeLayout({ width: 1880, height: 1380 }, 16, 8);
    expect(rowsOf(wide.steps)).toHaveLength(2);
  });

  it.each(rooms)("never stands a short LOOP up as a column (%o)", (room) => {
    for (const part of [1, 2]) {
      for (const repeats of [2, 4]) {
        const { steps } = madeLayout(room, part * repeats, part);
        expect(
          new Set(steps.map((cell) => Math.round(cell.x))).size
        ).toBeGreaterThan(1);
      }
    }
  });

  it.each(rooms)(
    "keeps whole repetitions together in each row (%o)",
    (room) => {
      for (let part = 1; part <= 8; part++) {
        for (const repeats of [2, 4]) {
          const { steps } = madeLayout(room, part * repeats, part);
          const byRow = new Map<number, number[]>();
          steps.forEach((cell, i) => {
            const row = Math.round(cell.y);
            byRow.set(row, [...(byRow.get(row) ?? []), Math.floor(i / part)]);
          });
          for (const repeatsInRow of byRow.values()) {
            const distinct = new Set(repeatsInRow);
            if (part >= 3) expect(distinct.size).toBe(1);
            else expect(repeatsInRow.length).toBe(distinct.size * part);
          }
        }
      }
    }
  );

  it.each(rooms)("reads left to right, then down (%o)", (room) => {
    for (let part = 1; part <= 8; part++) {
      for (const repeats of [2, 4]) {
        const card = madeLayout(room, part * repeats, part);
        card.steps.slice(1).forEach((cell, i) => {
          const before = card.steps[i]!;
          const sameRow = Math.abs(cell.y - before.y) < 0.5;
          expect(sameRow ? cell.x > before.x : cell.y > before.y).toBe(true);
        });
        const left = Math.min(...card.steps.map((cell) => cell.x));
        const top = Math.min(...card.steps.map((cell) => cell.y));
        expect(card.start.x).toBeLessThanOrEqual(left + 0.01);
        expect(card.start.y).toBeLessThanOrEqual(top + 0.01);
        for (const cell of card.steps)
          expect(
            Math.abs(cell.x - card.start.x) < 0.5 &&
              Math.abs(cell.y - card.start.y) < 0.5
          ).toBe(false);
      }
    }
  });

  it("fits a row of the five side by side inside its place", () => {
    for (const room of [
      { width: 230, height: 90 },
      { width: 230, height: 50 },
      { width: 420, height: 140 },
    ]) {
      for (let steps = 1; steps <= 16; steps++) {
        const { columns, size } = comparedRow(room, steps);
        const lines = Math.ceil(steps / columns);
        expect(size).toBeGreaterThan(0);
        expect(
          columns * size + (columns - 1) * COMPARED_GAP
        ).toBeLessThanOrEqual(room.width + 0.01);
        expect(lines * size + (lines - 1) * COMPARED_GAP).toBeLessThanOrEqual(
          room.height + 0.01
        );
      }
    }
  });
});
