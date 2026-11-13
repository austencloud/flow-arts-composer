import { describe, expect, it } from "vitest";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { BrowseFilterType } from "#lib/shared/persistence/domain/enums/filtering-enums.js";
import {
  MANDALA_LEVEL_COUNT,
  mandalaLevelOf,
  mandalaLevelValue,
  parseMandalaLevelValue,
  seedMandalaSignature,
} from "../sequence-density";
import { applyFilter } from "../browse-filter";

function measured(id: string, key: string, spaces: number): SequenceData {
  const sequence = { id, word: id, steps: [{}] } as unknown as SequenceData;
  seedMandalaSignature(sequence, { key, spaces, coverage: 0.1 });
  return sequence;
}

describe("the mandala levels", () => {
  it("cuts the space counts into six fixed levels", () => {
    expect(MANDALA_LEVEL_COUNT).toBe(6);
    expect([0, 8, 9, 16, 17, 28, 29, 44, 45, 76, 77, 157].map(mandalaLevelOf)).toEqual([
      1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6,
    ]);
  });

  it("reads back only the level values it writes", () => {
    expect(parseMandalaLevelValue(mandalaLevelValue(3))).toBe(3);
    expect(parseMandalaLevelValue(mandalaLevelValue(6))).toBe(6);
    expect(parseMandalaLevelValue("level-0")).toBeNull();
    expect(parseMandalaLevelValue("level-7")).toBeNull();
    expect(parseMandalaLevelValue("level-2.5")).toBeNull();
    // An old family value is not a level.
    expect(parseMandalaLevelValue("6a6a5155-944~tnd-split-same-cccc__t_0p5-1")).toBeNull();
  });
});

describe("the Mandala filter at a level", () => {
  it("keeps the sequences whose own mandala sits at that level", () => {
    const simple = measured("lvl-simple", "k-simple", 6);
    const middle = measured("lvl-middle", "k-middle", 50);
    const empty = measured("lvl-empty", "", 0);
    const unmeasured = { id: "lvl-new", word: "lvl-new", steps: [{}] } as unknown as SequenceData;
    const pool = [simple, middle, empty, unmeasured];

    expect(
      applyFilter(pool, BrowseFilterType.MANDALA, mandalaLevelValue(1)).map((seq) => seq.id)
    ).toEqual(["lvl-simple"]);
    expect(
      applyFilter(pool, BrowseFilterType.MANDALA, mandalaLevelValue(5)).map((seq) => seq.id)
    ).toEqual(["lvl-middle"]);
    expect(applyFilter(pool, BrowseFilterType.MANDALA, mandalaLevelValue(6))).toEqual([]);
  });
});
