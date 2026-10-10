import { describe, expect, it } from "vitest";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { ActiveFilter } from "#lib/shared/browse/domain/multi-filter-models.js";
import { BrowseFilterType } from "#lib/shared/persistence/domain/enums/filtering-enums.js";
import { getFilteredCount } from "#lib/shared/browse/services/multi-filter.js";
import { deriveAvailableStartingLetterOptions } from "#lib/features/browse/gallery-home/pick-representatives.js";

function sequence(id: string, word: string, level: number): SequenceData {
  return { id, word, level, steps: [] } as unknown as SequenceData;
}

describe("gallery starting-letter options", () => {
  it("only exposes letters that can produce a result under the other active rules", () => {
    const pool = [
      sequence("a-level-1", "ABCD", 1),
      sequence("a-level-2", "ADEF", 2),
      sequence("b-level-2", "BCDE", 2),
      sequence("c-level-3", "CDEF", 3),
    ];
    const activeFilters = new Map<string, ActiveFilter>([
      [
        String(BrowseFilterType.DIFFICULTY),
        {
          type: BrowseFilterType.DIFFICULTY,
          value: 2,
          label: "Level 2",
          chipColor: "#6aa0ff",
        },
      ],
    ]);

    const options = deriveAvailableStartingLetterOptions(pool, (letter) =>
      getFilteredCount(
        pool,
        BrowseFilterType.STARTING_LETTER,
        letter,
        activeFilters
      )
    );

    expect(options).toEqual([
      { value: "A", count: 1 },
      { value: "B", count: 1 },
    ]);
  });

  it("keeps applied zero-count letters visible while hiding unavailable alternatives", () => {
    const pool = [
      sequence("a-level-2", "ADEF", 2),
      sequence("b-level-2", "BCDE", 2),
      sequence("c-level-3", "CDEF", 3),
      sequence("d-level-3", "DEFG", 3),
    ];
    const activeFilters = new Map<string, ActiveFilter>([
      [
        String(BrowseFilterType.DIFFICULTY),
        {
          type: BrowseFilterType.DIFFICULTY,
          value: 2,
          label: "Level 2",
          chipColor: "#6aa0ff",
        },
      ],
      ...["A", "B", "C"].map(
        (letter) =>
          [
            `${BrowseFilterType.STARTING_LETTER}:${letter}`,
            {
              type: BrowseFilterType.STARTING_LETTER,
              value: letter,
              label: letter,
              chipColor: "#6aa0ff",
            },
          ] as const
      ),
    ]);
    const appliedLetters = new Set(["A", "B", "C"]);

    const options = deriveAvailableStartingLetterOptions(
      pool,
      (letter) =>
        getFilteredCount(
          pool,
          BrowseFilterType.STARTING_LETTER,
          letter,
          activeFilters
        ),
      (letter) => appliedLetters.has(letter)
    );

    expect(options).toEqual([
      { value: "A", count: 1 },
      { value: "B", count: 1 },
      { value: "C", count: 0 },
    ]);
  });
});
