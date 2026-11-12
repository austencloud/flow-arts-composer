import { describe, expect, it } from "vitest";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { BrowseSortMethod } from "#lib/shared/browse/domain/enums/browse-enums.js";
import { sortSequences } from "./browse-sorter";
import { seedMandalaSignature } from "./sequence-density";

// The Mandala sort outlives the mandala picker: simplest mandala first (fewer
// enclosed spaces, then less coverage), then the easier level, then shorter.

function drawn(id: string, spaces: number, coverage: number, level: number, length: number) {
  const sequence = {
    id,
    word: id,
    level,
    sequenceLength: length,
    steps: Array.from({ length }, () => ({})),
  } as unknown as SequenceData;
  seedMandalaSignature(sequence, { key: id, spaces, coverage });
  return sequence;
}

describe("the Mandala sort", () => {
  it("orders by spaces, coverage, level, then length", () => {
    const pool = [
      drawn("busy", 9, 0.1, 1, 4),
      drawn("long", 1, 0.2, 1, 8),
      drawn("short", 1, 0.2, 1, 4),
      drawn("hard", 1, 0.2, 3, 2),
      drawn("thin", 1, 0.05, 2, 8),
      drawn("ring", 0, 0.5, 3, 16),
    ];
    expect(sortSequences(pool, BrowseSortMethod.DENSITY).map((s) => s.id)).toEqual([
      "ring",
      "thin",
      "short",
      "long",
      "hard",
      "busy",
    ]);
  });
});
