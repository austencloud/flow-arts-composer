import { describe, expect, it } from "vitest";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { applyFilter } from "../browse-filter";
import { BrowseFilterType } from "$lib/shared/persistence/domain/enums/filtering-enums";

function sequence(id: string, word: string): SequenceData {
  return { id, name: id, word, steps: [] } as unknown as SequenceData;
}

describe("applyFilter STARTING_LETTER with skew braces", () => {
  it("matches a braced dash-variant word under its dash filter, not the bare letter", () => {
    const skewed = sequence("skewed", "{W-AB}");
    const bare = sequence("bare", "W-AB");

    expect(applyFilter([skewed, bare], BrowseFilterType.STARTING_LETTER, "W-").map((s) => s.id)).toEqual([
      "skewed",
      "bare",
    ]);
    expect(applyFilter([skewed, bare], BrowseFilterType.STARTING_LETTER, "W").map((s) => s.id)).toEqual([]);
  });

  it("places a braced word into its letter range by the stripped first letter", () => {
    const skewed = sequence("skewed", "{STS}");
    const outOfRange = sequence("out-of-range", "{ABC}");

    const result = applyFilter(
      [skewed, outOfRange],
      BrowseFilterType.STARTING_LETTER,
      "Q-T"
    ).map((s) => s.id);
    expect(result).toEqual(["skewed"]);
  });
});
