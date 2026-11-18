import { describe, expect, it } from "vitest";

import { resolveCharacterGrid } from "#lib/shared/3d/domain/character-grid.js";

const GAP = 8;

function tile(
  count: number,
  width: number,
  height: number
): { columns: number; rows: number; fills: boolean; w: number; h: number } {
  const grid = resolveCharacterGrid(count, width, height, GAP);
  return {
    ...grid,
    w: (width - GAP * (grid.columns - 1)) / grid.columns,
    h: (height - GAP * (grid.rows - 1)) / grid.rows,
  };
}

describe("character picker grid", () => {
  it("fills the pane with upright tiles and no empty cell at his window", () => {
    // 1536 x 1200 window: the pane is about 492 wide and 870 tall.
    const dev = tile(20, 492, 870);
    expect(dev).toMatchObject({ columns: 4, rows: 5, fills: true });
    const live = tile(16, 492, 870);
    expect(live).toMatchObject({ columns: 4, rows: 4, fills: true });
    expect(live.h).toBeGreaterThan(live.w);
  });

  it("holds every character without scrolling on a short laptop window", () => {
    // 1280 x 800: the pane is about 432 wide and 496 tall.
    for (const count of [16, 20]) {
      const grid = tile(count, 432, 496);
      expect(grid.fills, `${count} characters`).toBe(true);
      expect(grid.columns * grid.rows).toBeGreaterThanOrEqual(count);
      expect(grid.w).toBeGreaterThanOrEqual(76);
      expect(grid.h).toBeGreaterThanOrEqual(84);
    }
  });

  it("uses fewer, wider columns in the narrowest docked panel", () => {
    // 1133 x 1127: the panel is 369 wide, the pane about 341 by 850.
    const grid = tile(20, 341, 850);
    expect(grid.fills).toBe(true);
    expect(grid.columns).toBe(3);
    expect(grid.w).toBeGreaterThan(100);
  });

  it("still holds every character in the narrowest panel of a 768-tall window", () => {
    // 1024 x 768: the pane is about 330 wide and 416 tall.
    const grid = tile(20, 330, 416);
    expect(grid).toMatchObject({ columns: 4, rows: 5, fills: true });
    expect(grid.w).toBeGreaterThanOrEqual(76);
    expect(grid.h).toBeGreaterThanOrEqual(72);
  });

  it("packs the tiles as small as a name allows when the pane cannot hold them all", () => {
    // 1024 x 620: the pane is 330 wide and 268 tall. It has to scroll, so it
    // shows as many characters at a time as it can instead of two per row.
    expect(resolveCharacterGrid(20, 330, 268, GAP)).toEqual({
      columns: 4,
      rows: 5,
      fills: false,
    });
    // A phone sheet: 358 wide, 240 tall.
    expect(resolveCharacterGrid(20, 358, 240, GAP)).toEqual({
      columns: 4,
      rows: 5,
      fills: false,
    });
    // Never more columns than characters.
    expect(resolveCharacterGrid(2, 358, 60, GAP)).toMatchObject({
      columns: 2,
      rows: 1,
      fills: false,
    });
  });

  it("lays out by width alone when the host gives no height", () => {
    expect(resolveCharacterGrid(16, 640, 0, GAP)).toMatchObject({
      columns: 5,
      rows: 4,
      fills: false,
    });
    expect(resolveCharacterGrid(16, 0, 0, GAP)).toMatchObject({
      columns: 3,
      fills: false,
    });
  });

  it("never returns an empty grid", () => {
    expect(resolveCharacterGrid(0, 492, 870, GAP)).toEqual({
      columns: 1,
      rows: 1,
      fills: false,
    });
    expect(resolveCharacterGrid(1, 492, 870, GAP)).toMatchObject({
      columns: 1,
      rows: 1,
    });
  });
});
