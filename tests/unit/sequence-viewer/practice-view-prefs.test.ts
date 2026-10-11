import { describe, it, expect } from "vitest";
import {
  SPLIT_PRESETS,
  READ_AHEAD_TO_CELL_SIZE,
  cellSizeForReadAhead,
} from "#lib/shared/sequence-viewer/state/practice-view-prefs.svelte.js";

describe("practice view-pref maps", () => {
  it("exposes the three split presets in order", () => {
    expect(SPLIT_PRESETS.map((p) => p.value)).toEqual([
      "lane-heavy",
      "balanced",
      "canvas-heavy",
    ]);
  });

  it("maps read-ahead depth to a decreasing cell size (smaller = see further)", () => {
    const c1 = cellSizeForReadAhead(1);
    const c2 = cellSizeForReadAhead(2);
    const c3 = cellSizeForReadAhead(3);
    expect(c1).toBeGreaterThan(c2);
    expect(c2).toBeGreaterThan(c3);
    expect(READ_AHEAD_TO_CELL_SIZE[2]).toBe(c2);
  });

  it("clamps unknown read-ahead depth to the nearest defined value", () => {
    expect(cellSizeForReadAhead(99)).toBe(cellSizeForReadAhead(3));
    expect(cellSizeForReadAhead(0)).toBe(cellSizeForReadAhead(1));
  });
});
