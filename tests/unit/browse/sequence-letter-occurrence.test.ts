import { describe, expect, it } from "vitest";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import {
  filterSequencesByExactLetter,
  sequenceContainsExactLetter,
} from "#lib/shared/browse/services/sequence-letter-occurrence.js";
import { applyFilter } from "#lib/shared/browse/services/browse-filter.js";
import { BrowseFilterType } from "#lib/shared/persistence/domain/enums/filtering-enums.js";

function sequence(
  id: string,
  word: string,
  stepLetters: readonly string[] = []
): SequenceData {
  return {
    id,
    name: id,
    displayName: "B appears only in this title",
    notes: "B appears only in these notes",
    word,
    steps: stepLetters.map((letter) => ({ letter })),
  } as SequenceData;
}

describe("exact Gallery letter occurrence", () => {
  it("uses hydrated step notation as the primary source of truth", () => {
    const hydrated = sequence("hydrated", "BBBB", ["A", "C"]);

    expect(sequenceContainsExactLetter(hydrated, "B")).toBe(false);
    expect(sequenceContainsExactLetter(hydrated, "C")).toBe(true);
  });

  it("falls back to canonical word tokens for metadata-only cards", () => {
    const metadataOnly = sequence("metadata", "W-AB");

    expect(sequenceContainsExactLetter(metadataOnly, "W-")).toBe(true);
    expect(sequenceContainsExactLetter(metadataOnly, "W")).toBe(false);
    expect(sequenceContainsExactLetter(metadataOnly, "B")).toBe(true);
  });

  it("never treats a title or note match as a notation match", () => {
    expect(sequenceContainsExactLetter(sequence("prose", "AC"), "B")).toBe(
      false
    );
  });

  it("returns only exact notation matches from a mixed pool", () => {
    const pool = [
      sequence("a", "AAAA"),
      sequence("b", "BBBB"),
      sequence("steps", "AAAA", ["B"]),
    ];

    expect(filterSequencesByExactLetter(pool, "B").map(({ id }) => id)).toEqual(
      ["b", "steps"]
    );
    expect(
      applyFilter(pool, BrowseFilterType.LETTER_OCCURRENCE, "B").map(
        ({ id }) => id
      )
    ).toEqual(["b", "steps"]);
  });
});
