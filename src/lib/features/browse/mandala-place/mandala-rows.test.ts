import { describe, expect, it } from "vitest";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { mandalaRows } from "./mandala-rows";

function sequence(id: string, word: string, level: number, length: number): SequenceData {
  return { id, name: word, word, level, sequenceLength: length, steps: [] } as unknown as SequenceData;
}

describe("mandalaRows", () => {
  it("orders by level, then length, then word, then id", () => {
    const rows = mandalaRows([
      sequence("e", "C", 2, 4),
      sequence("d", "B", 1, 8),
      sequence("c", "B", 1, 4),
      sequence("b", "A", 1, 8),
      sequence("a", "D", 3, 2),
    ]);
    expect(rows.map((r) => r.sequence.id)).toEqual(["c", "b", "d", "e", "a"]);
    expect(rows.map((r) => [r.level, r.length])).toEqual([
      [1, 4],
      [1, 8],
      [1, 8],
      [2, 4],
      [3, 2],
    ]);
  });

  it("breaks full ties by id so the order is stable", () => {
    const forward = mandalaRows([sequence("y", "A", 1, 4), sequence("x", "A", 1, 4)]);
    const backward = mandalaRows([sequence("x", "A", 1, 4), sequence("y", "A", 1, 4)]);
    expect(forward.map((r) => r.sequence.id)).toEqual(["x", "y"]);
    expect(backward.map((r) => r.sequence.id)).toEqual(["x", "y"]);
  });

  it("shows the simplified word and numbers versions of a shared word", () => {
    const rows = mandalaRows([
      sequence("one", "ABAB", 1, 4),
      sequence("two", "AB", 2, 4),
      sequence("solo", "C", 1, 4),
      sequence("three", "AB", 1, 8),
    ]);
    // "ABAB" displays as "AB", so it shares a word with two others.
    expect(rows.map((r) => [r.sequence.id, r.word, r.version])).toEqual([
      ["one", "AB", 1],
      ["solo", "C", null],
      ["three", "AB", 2],
      ["two", "AB", 3],
    ]);
  });

  it("leaves the input untouched", () => {
    const input = [sequence("b", "B", 2, 4), sequence("a", "A", 1, 4)];
    mandalaRows(input);
    expect(input.map((s) => s.id)).toEqual(["b", "a"]);
  });
});
