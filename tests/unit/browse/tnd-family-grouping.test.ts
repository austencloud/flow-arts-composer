import { describe, it, expect } from "vitest";
import { organizeSections } from "#lib/shared/browse/services/browse-section-manager.js";
import { BrowseSortMethod } from "#lib/shared/browse/domain/enums/browse-enums.js";
import type { SectionConfig } from "#lib/shared/browse/domain/models/browse-models.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";

// Founding-deck grouping: the three TKA decks are the canonical T&D alphabet, so
// their detail view groups cards by canonical TnD family (read from each pool
// sequence's tags) in groups of 3-4 — not one section per letter. Section order
// follows the canonical element sequence in TND_ELEMENTS.

function tndSeq(word: string, familyTag: string): SequenceData {
  return {
    word,
    tags: ["tnd-deck", familyTag],
    steps: [{ letter: word.charAt(0), stepNumber: 1, isBlank: false }],
  } as unknown as SequenceData;
}

function tndFamilyConfig(): SectionConfig {
  return {
    groupBy: "tnd-family",
    sortMethod: BrowseSortMethod.DIFFICULTY_LEVEL,
    showEmptySections: false,
    expandedSections: new Set<string>(),
  };
}

describe("organizeSections — tnd-family grouping", () => {
  it("groups by family tag and orders by the canonical element sequence", () => {
    // Deliberately out of canonical order in the input.
    const sections = organizeSections(
      [
        tndSeq("A", "split-opp"), // Fire (4th)
        tndSeq("B", "split-same"), // Water (1st)
        tndSeq("C", "split-same"),
        tndSeq("D", "quarter-opp"), // Moon (6th)
      ],
      tndFamilyConfig()
    );

    // Water before Fire before Moon, per TND_ELEMENTS order.
    expect(sections.map((s) => s.title)).toEqual([
      "Split-Same · Water (2 sequences)",
      "Split-Opp · Fire (1 sequence)",
      "Quarter-Opp · Moon (1 sequence)",
    ]);
  });

  it("buckets a sequence with no known family tag under Other", () => {
    const sections = organizeSections([tndSeq("A", "not-a-family")], tndFamilyConfig());
    expect(sections[0]!.title).toBe("Other (1 sequence)");
  });
});
