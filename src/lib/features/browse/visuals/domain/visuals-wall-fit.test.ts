import { describe, expect, it } from "vitest";
import {
  fitVisualsWall,
  panColumns,
  type WallMetrics,
} from "./visuals-wall-fit.js";

const chrome = {
  chromeX: 24,
  chromeY: 70,
  headHeight: 50,
  wallGap: 20,
  shelfGap: 40,
};

function screen(width: number, height: number): WallMetrics {
  return { width, height, ...chrome };
}

describe("fitVisualsWall", () => {
  it("puts two tunnels and a mandala side by side on a wide, short screen", () => {
    const fit = fitVisualsWall([2, 1], screen(1100, 680));
    expect(fit.direction).toBe("row");
    expect(fit.columns).toEqual([2, 1]);
    // Everything fits in the height: heading, one row of cards.
    expect(50 + fit.plinth + 70).toBeLessThanOrEqual(680);
  });

  it("stacks the shelves on a tall phone screen", () => {
    const fit = fitVisualsWall([2, 1], screen(380, 640));
    expect(fit.direction).toBe("column");
    const height = 2 * 50 + 40 + 2 * (fit.plinth + 70);
    expect(height).toBeLessThanOrEqual(640);
    expect(2 * (fit.plinth + 24) + 20).toBeLessThanOrEqual(380);
  });

  it("gives a lone piece the whole screen", () => {
    const fit = fitVisualsWall([1], screen(900, 600));
    expect(fit.plinth).toBe(600 - 50 - 70);
  });

  it("wraps one full shelf into rows instead of a strip of thumbnails", () => {
    const fit = fitVisualsWall([6], screen(1200, 800));
    expect(fit.columns[0]).toBeLessThan(6);
    expect(fit.plinth).toBeGreaterThan(200);
  });

  it("ignores empty shelves", () => {
    expect(fitVisualsWall([0, 3], screen(1200, 700)).columns).toEqual([3]);
  });
});

describe("panColumns", () => {
  it("fills the width with pieces no smaller than the minimum", () => {
    const { columns, plinth } = panColumns(screen(1000, 600), 160);
    expect(columns).toBe(5);
    expect(plinth).toBeGreaterThanOrEqual(160);
    expect(columns * (plinth + 24) + (columns - 1) * 20).toBeLessThanOrEqual(
      1000
    );
  });
});
