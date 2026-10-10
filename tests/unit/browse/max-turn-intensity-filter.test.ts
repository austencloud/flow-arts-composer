import { describe, it, expect } from "vitest";
import {
  applyFilter,
  getSequenceMaxTurn,
} from "#lib/shared/browse/services/browse-filter.js";
import { BrowseFilterType } from "#lib/shared/persistence/domain/enums/filtering-enums.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";

// Minimal step shape the filter reads: motions.left/right.turns + isBlank.
function step(
  leftTurns: number | "fl",
  rightTurns: number | "fl",
  isBlank = false
) {
  return {
    isBlank,
    motions: {
      left: { turns: leftTurns },
      right: { turns: rightTurns },
    },
  };
}

function seq(id: string, steps: ReturnType<typeof step>[]): SequenceData {
  return { id, word: id, steps } as unknown as SequenceData;
}

describe("getSequenceMaxTurn", () => {
  it("is the max numeric turn across steps and hands; floats and blanks ignored", () => {
    expect(getSequenceMaxTurn(seq("a", [step(0, 1), step(0.5, 2)]))).toBe(2);
    expect(getSequenceMaxTurn(seq("b", [step("fl", "fl")]))).toBe(0); // all float → 0
    expect(getSequenceMaxTurn(seq("c", [step(0, 0)]))).toBe(0);
    expect(getSequenceMaxTurn(seq("d", [step(3, 0, true)]))).toBe(0); // blank step skipped
    expect(getSequenceMaxTurn(seq("e", [step(1, "fl")]))).toBe(1);
  });
});

describe("filterByMaxTurnIntensity (ceiling ≤ N)", () => {
  const pool = [
    seq("zero", [step(0, 0)]),
    seq("half", [step(0.5, 0)]),
    seq("one", [step(1, 0.5)]),
    seq("floaty", [step("fl", "fl")]),
    seq("two", [step(2, 1)]),
  ];

  it("≤1 includes zero/half/one/floaty, excludes two", () => {
    const ids = applyFilter(pool, BrowseFilterType.MAX_TURN_INTENSITY, 1)
      .map((s) => s.id)
      .sort();
    expect(ids).toEqual(["floaty", "half", "one", "zero"]);
  });

  it("≤2 includes everything", () => {
    expect(
      applyFilter(pool, BrowseFilterType.MAX_TURN_INTENSITY, 2)
    ).toHaveLength(5);
  });

  it("≤0.5 excludes one and two", () => {
    const ids = applyFilter(pool, BrowseFilterType.MAX_TURN_INTENSITY, 0.5)
      .map((s) => s.id)
      .sort();
    expect(ids).toEqual(["floaty", "half", "zero"]);
  });
});
