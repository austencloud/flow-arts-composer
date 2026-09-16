import { describe, it, expect } from "vitest";
import {
  getLayout,
  calculateImageDimensions,
  BASE_STEP_SIZE,
} from "../src/layout-tables.js";

describe("getLayout", () => {
  it("returns correct layout for 4 steps with start position (sidebar)", () => {
    expect(getLayout(4, "sidebar")).toEqual([3, 2]);
  });

  it("returns correct layout for 4 steps with start position (top)", () => {
    // "top" uses the same table as "sidebar"
    expect(getLayout(4, "top")).toEqual([3, 2]);
  });

  it("returns correct layout for 4 steps without start", () => {
    expect(getLayout(4, "none")).toEqual([2, 2]);
  });

  it("returns correct layout for 12 steps without start", () => {
    expect(getLayout(12, "none")).toEqual([3, 4]);
  });

  it("returns correct layout for 4 steps with start column", () => {
    expect(getLayout(4, "column")).toEqual([3, 2]);
  });

  it("returns correct layout for 4 steps with start row", () => {
    // WITH_START_ROW adds 1 row to WITHOUT_START_PLACEMENT
    // WITHOUT_START_PLACEMENT[4] = [2, 2] → WITH_START_ROW[4] = [2, 3]
    expect(getLayout(4, "row")).toEqual([2, 3]);
  });

  it("returns correct layout for 0 steps", () => {
    expect(getLayout(0, "none")).toEqual([1, 1]);
  });

  it("returns correct layout for 64 steps without start", () => {
    expect(getLayout(64, "none")).toEqual([16, 4]);
  });

  it("uses the Composer aspect-ratio fallback above 64 steps", () => {
    const result = getLayout(100, "none");
    expect(result).toEqual([12, 9]);
  });

  it("adds a start column to the Composer fallback", () => {
    const result = getLayout(200, "sidebar");
    expect(result).toEqual([17, 13]);
  });

  it("matches the Composer column layout for eight steps", () => {
    expect(getLayout(8, "column")).toEqual([5, 2]);
  });

  it("WITH_START_ROW has one more row than WITHOUT_START_PLACEMENT for every step count", () => {
    const stepCounts = [1, 5, 12, 32, 64];
    for (const n of stepCounts) {
      const [colsNone, rowsNone] = getLayout(n, "none");
      const [colsRow, rowsRow] = getLayout(n, "row");
      expect(colsRow).toBe(colsNone);
      expect(rowsRow).toBe(rowsNone + 1);
    }
  });
});

describe("calculateImageDimensions", () => {
  it("calculates width and height from layout", () => {
    const [w, h] = calculateImageDimensions([3, 2], 100, 300);
    expect(w).toBe(900);
    expect(h).toBe(700);
  });

  it("floors fractional pixel values", () => {
    const [w, h] = calculateImageDimensions([3, 2], 0, 144.7);
    expect(w).toBe(Math.floor(3 * 144.7));
    expect(h).toBe(Math.floor(2 * 144.7));
  });

  it("includes additionalHeight in total height only", () => {
    const [w, h] = calculateImageDimensions([4, 3], 50, 100);
    expect(w).toBe(400);
    expect(h).toBe(350); // 3*100 + 50
  });
});

describe("BASE_STEP_SIZE", () => {
  it("is 144", () => {
    expect(BASE_STEP_SIZE).toBe(144);
  });
});
