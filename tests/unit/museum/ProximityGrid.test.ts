import { describe, it, expect } from "vitest";
import { ProximityGrid } from "#lib/features/museum/services/proximity-grid.js";

describe("ProximityGrid", () => {
  it("returns items within radius", () => {
    const grid = new ProximityGrid<string>(8);
    grid.insert("A", 10, 10);
    grid.insert("B", 12, 10);
    grid.insert("C", 50, 50);
    const result = grid.queryRadius(10, 10, 5);
    expect(result).toContain("A");
    expect(result).toContain("B");
    expect(result).not.toContain("C");
  });

  it("returns empty for empty grid", () => {
    const grid = new ProximityGrid<string>(8);
    expect(grid.queryRadius(0, 0, 30)).toEqual([]);
  });

  it("handles items at cell boundaries", () => {
    const grid = new ProximityGrid<string>(8);
    grid.insert("edge", 8, 0);
    const result = grid.queryRadius(7, 0, 2);
    expect(result).toContain("edge");
  });

  it("reports correct size", () => {
    const grid = new ProximityGrid<string>(8);
    grid.insert("A", 0, 0);
    grid.insert("B", 10, 10);
    expect(grid.size).toBe(2);
  });

  it("does not return items just outside radius", () => {
    const grid = new ProximityGrid<number>(8);
    grid.insert(1, 0, 0);
    grid.insert(2, 0, 31);
    const result = grid.queryRadius(0, 0, 30);
    expect(result).toContain(1);
    expect(result).not.toContain(2);
  });

  it("handles large insert counts", () => {
    const grid = new ProximityGrid<number>(8);
    for (let i = 0; i < 1000; i++) {
      grid.insert(i, Math.floor(Math.random() * 200), Math.floor(Math.random() * 200));
    }
    expect(grid.size).toBe(1000);
    const result = grid.queryRadius(100, 100, 30);
    expect(result.length).toBeLessThan(1000);
  });
});
