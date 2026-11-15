import { describe, expect, it } from "vitest";
import {
  answerTap,
  askButtonLabel,
  countsAreReady,
  letterRows,
  pickLengthTiles,
  type LengthOption,
} from "./gallery-ask";

const opts = (pairs: Array<[number, number]>): LengthOption[] =>
  pairs.map(([value, count]) => ({ value, count }));
const poolOf = (options: LengthOption[]) =>
  new Map(options.map((o) => [o.value, o.count]));

describe("pickLengthTiles", () => {
  it("shows every length ascending when there are eight or fewer", () => {
    const options = opts([
      [16, 274],
      [4, 982],
      [8, 165],
    ]);
    const tiles = pickLengthTiles(options, poolOf(options), null);
    expect(tiles.map((t) => t.kind === "length" && t.value)).toEqual([
      4, 8, 16,
    ]);
    expect(tiles.some((t) => t.kind === "other")).toBe(false);
  });

  it("shows exactly eight when there are eight, with no Other", () => {
    const options = opts([1, 2, 3, 4, 5, 6, 7, 8].map((n) => [n, n]));
    const tiles = pickLengthTiles(options, poolOf(options), null);
    expect(tiles).toHaveLength(8);
    expect(tiles.every((t) => t.kind === "length")).toBe(true);
  });

  it("past eight shows the seven biggest ascending, then Other", () => {
    const options = opts([
      [2, 3],
      [4, 982],
      [6, 5],
      [8, 165],
      [10, 9],
      [12, 104],
      [16, 274],
      [20, 15],
      [24, 2],
      [32, 14],
    ]);
    const tiles = pickLengthTiles(options, poolOf(options), null);
    expect(tiles).toHaveLength(8);
    expect(
      tiles.slice(0, 7).map((t) => t.kind === "length" && t.value)
    ).toEqual([4, 8, 10, 12, 16, 20, 32]);
    const other = tiles[7]!;
    expect(other).toEqual({ kind: "other", count: 3 + 5 + 2, chosen: null });
  });

  it("ranks by the pool, not by the live counts", () => {
    // Live counts under a letter answer would rank 2 first; the pool keeps
    // the tiles where they were.
    const options = opts([2, 4, 6, 8, 10, 12, 14, 16, 18].map((n) => [n, 0]));
    options[0]!.count = 500;
    const pool = new Map(options.map((o) => [o.value, o.value]));
    const tiles = pickLengthTiles(options, pool, null);
    expect(
      tiles.slice(0, 7).map((t) => t.kind === "length" && t.value)
    ).toEqual([6, 8, 10, 12, 14, 16, 18]);
    expect(tiles[7]).toMatchObject({ kind: "other", count: 500 });
  });

  it("Other carries a chosen length that is not one of the seven", () => {
    const options = opts([2, 4, 6, 8, 10, 12, 14, 16, 18].map((n) => [n, n]));
    const tiles = pickLengthTiles(options, poolOf(options), 2);
    expect(tiles[7]).toMatchObject({ kind: "other", chosen: 2 });
    const shownChoice = pickLengthTiles(options, poolOf(options), 18);
    expect(shownChoice[7]).toMatchObject({ kind: "other", chosen: null });
  });
});

describe("answerTap", () => {
  it("replaces with another value and clears on a second tap", () => {
    expect(answerTap<number | string>(null, 16)).toEqual({
      action: "replace",
      value: 16,
    });
    expect(answerTap<number | string>(16, 8)).toEqual({
      action: "replace",
      value: 8,
    });
    expect(answerTap<number | string>(8, 8)).toEqual({ action: "clear" });
    expect(answerTap("D", "D")).toEqual({ action: "clear" });
  });
});

describe("askButtonLabel", () => {
  it("reads Show all with nothing chosen", () => {
    expect(askButtonLabel(1578, false)).toEqual({
      label: { key: "browse_ask_show_all", count: 1578 },
      disabled: false,
    });
  });
  it("reads Show N with one or both answers", () => {
    expect(askButtonLabel(274, true).label).toEqual({
      key: "browse_ask_show_count",
      count: 274,
    });
    expect(askButtonLabel(14, true).label).toEqual({
      key: "browse_ask_show_count",
      count: 14,
    });
    expect(askButtonLabel(1, true).label).toEqual({
      key: "browse_ask_show_one",
    });
  });
  it("is disabled only at zero", () => {
    expect(askButtonLabel(0, true).disabled).toBe(true);
    expect(askButtonLabel(0, false).disabled).toBe(true);
    expect(askButtonLabel(1, true).disabled).toBe(false);
  });
});

describe("letterRows", () => {
  const ALPHABET_46 = [
    ..."ABCDEFGHIJKLMNOPQRSTUV".split(""),
    "W",
    "X",
    "Y",
    "Z",
    "Σ",
    "Δ",
    "Θ",
    "Ω",
    "W-",
    "X-",
    "Y-",
    "Z-",
    "Σ-",
    "Δ-",
    "Θ-",
    "Ω-",
    "Φ",
    "Ψ",
    "Λ",
    "Φ-",
    "Ψ-",
    "Λ-",
    "α",
    "β",
  ].map((value) => ({ value }));

  it("puts 46 letters in 6 rows, one block per letter type", () => {
    expect(ALPHABET_46).toHaveLength(46);
    const rows = letterRows(ALPHABET_46).map((r) => r.map((l) => l.value));
    expect(rows).toHaveLength(6);
    expect(rows[0]).toEqual("ABCDEFGH".split(""));
    expect(rows[2]).toEqual("QRSTUV".split(""));
    expect(rows[3]![0]).toBe("W");
    expect(rows[4]![0]).toBe("W-");
    expect(rows[5]).toEqual(["Φ", "Ψ", "Λ", "Φ-", "Ψ-", "Λ-", "α", "β"]);
  });

  it("a 47th letter makes a seventh row", () => {
    const rows = letterRows([...ALPHABET_46, { value: "γ" }]);
    expect(rows).toHaveLength(7);
    expect(rows[6]!.map((l) => l.value)).toEqual(["γ"]);
  });

  it("a missing letter type leaves no empty row", () => {
    const rows = letterRows([{ value: "A" }, { value: "α" }]);
    expect(rows.map((r) => r.map((l) => l.value))).toEqual([["A"], ["α"]]);
  });
});

describe("countsAreReady", () => {
  it("is not ready before the load begins, with an empty pool", () => {
    expect(countsAreReady(false, false, 0)).toBe(false);
  });
  it("is not ready while loading", () => {
    expect(countsAreReady(true, true, 40)).toBe(false);
  });
  it("is ready once a seen load ends, even with an empty pool (failed load)", () => {
    expect(countsAreReady(false, true, 0)).toBe(true);
  });
  it("is ready at once when the pool already has sequences", () => {
    expect(countsAreReady(false, false, 12)).toBe(true);
  });
});
