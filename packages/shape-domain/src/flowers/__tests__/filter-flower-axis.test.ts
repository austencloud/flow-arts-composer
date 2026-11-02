import { describe, it, expect } from "vitest";
import {
  applyFilter,
  defaultMatrixFilters,
  defaultAxisFilter,
} from "../filter-flower-axis";
import { buildFlowerAxis } from "../flower-signature";

const axis = buildFlowerAxis(); // 56 = 28 diamond + 28 box (45°) twins

describe("applyFilter", () => {
  it("axis enumerates 56 (28 diamond + 28 box)", () => {
    expect(axis).toHaveLength(56);
    expect(axis.filter((f) => f.grid === "diamond")).toHaveLength(28);
    expect(axis.filter((f) => f.grid === "box")).toHaveLength(28);
  });

  it("default (diamond) + collapse drops even-petal out twins → 20", () => {
    const out = applyFilter(axis, defaultAxisFilter(), true);
    expect(out).toHaveLength(20);
    expect(out.every((f) => f.grid === "diamond")).toBe(true);
    // every even-petal flower kept is `in`; odd-petal keeps both
    expect(
      out.filter((f) => f.petals % 2 === 0).every((f) => f.ori === "in")
    ).toBe(true);
    expect(
      out.filter((f) => f.petals % 2 === 1 && f.ori === "out").length
    ).toBeGreaterThan(0);
  });

  it("default (diamond) without collapse keeps 28", () => {
    expect(applyFilter(axis, defaultAxisFilter(), false)).toHaveLength(28);
  });

  it("grid=all without collapse exposes the full 56", () => {
    expect(
      applyFilter(axis, { ...defaultAxisFilter(), grid: "all" }, false)
    ).toHaveLength(56);
  });

  it("grid=box without collapse keeps the 28 rotated twins", () => {
    const box = applyFilter(
      axis,
      { ...defaultAxisFilter(), grid: "box" },
      false
    );
    expect(box).toHaveLength(28);
    expect(box.every((f) => f.grid === "box")).toBe(true);
  });

  it("grid=all + collapse drops even-out twins AND 45°-symmetric box twins → 38", () => {
    const out = applyFilter(
      axis,
      { ...defaultAxisFilter(), grid: "all" },
      true
    );
    expect(out).toHaveLength(38); // 20 diamond + 18 box (box loses the 0- and 8-petal twins)
    // no box flower whose petals are divisible by 8 survives
    expect(out.some((f) => f.grid === "box" && f.petals % 8 === 0)).toBe(false);
  });

  it("style filter narrows to one spin (within the diamond default)", () => {
    const pro = applyFilter(
      axis,
      { ...defaultAxisFilter(), style: "pro" },
      false
    );
    expect(pro).toHaveLength(14);
    expect(pro.every((f) => f.style === "pro" && f.grid === "diamond")).toBe(
      true
    );
  });

  it("turns filter keeps only selected turn values", () => {
    const r = applyFilter(
      axis,
      { ...defaultAxisFilter(), turns: new Set([1, 2]) },
      false
    );
    expect(new Set(r.map((f) => f.turns))).toEqual(new Set([1, 2]));
  });

  it("orientation filter narrows to one orientation", () => {
    const ins = applyFilter(axis, { ...defaultAxisFilter(), ori: "in" }, false);
    expect(ins).toHaveLength(14);
    expect(ins.every((f) => f.ori === "in")).toBe(true);
  });

  it("empty turn set yields no flowers", () => {
    expect(
      applyFilter(axis, { ...defaultAxisFilter(), turns: new Set() }, false)
    ).toHaveLength(0);
  });

  it("defaultMatrixFilters: collapse on, all turns, diamond default", () => {
    const m = defaultMatrixFilters();
    expect(m.collapse).toBe(true);
    expect(m.left.turns.size).toBe(7);
    expect(m.right.style).toBe("all");
    expect(m.left.grid).toBe("diamond");
  });
});
