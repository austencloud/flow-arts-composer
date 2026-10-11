import { describe, it, expect } from "vitest";
import { applyFilter } from "#lib/shared/browse/services/browse-filter.js";
import { BrowseFilterType } from "#lib/shared/persistence/domain/enums/filtering-enums.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";

function seq(id: string, reversalPattern?: string): SequenceData {
  return { id, word: id, ...(reversalPattern ? { reversalPattern } : {}) } as unknown as SequenceData;
}

describe("filterByReversalPattern", () => {
  const pool = [
    seq("book-1", "book"),
    seq("book-2", "book"),
    seq("continuous-explicit", "continuous"),
    seq("continuous-implicit"), // no reversalPattern → treated as continuous
    seq("red-book", "red-book"),
  ];

  it("selects only the requested pattern", () => {
    const ids = applyFilter(pool, BrowseFilterType.REVERSAL_PATTERN, "book").map((s) => s.id).sort();
    expect(ids).toEqual(["book-1", "book-2"]);
  });

  it("treats an absent reversalPattern as continuous", () => {
    const ids = applyFilter(pool, BrowseFilterType.REVERSAL_PATTERN, "continuous")
      .map((s) => s.id)
      .sort();
    expect(ids).toEqual(["continuous-explicit", "continuous-implicit"]);
  });

  it("matches a non-book named pattern exactly", () => {
    const ids = applyFilter(pool, BrowseFilterType.REVERSAL_PATTERN, "red-book").map((s) => s.id);
    expect(ids).toEqual(["red-book"]);
  });

  it("returns nothing for a pattern no sequence has", () => {
    expect(applyFilter(pool, BrowseFilterType.REVERSAL_PATTERN, "blue-book")).toHaveLength(0);
  });
});
