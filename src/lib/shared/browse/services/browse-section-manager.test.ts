import { describe, it, expect } from "vitest";
import { organizeSections } from "#lib/shared/browse/services/browse-section-manager.js";
import { BrowseSortMethod } from "#lib/shared/browse/domain/enums/browse-enums.js";
import type { SectionConfig } from "#lib/shared/browse/domain/models/browse-models.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";

// Minimal StepData factory — only the fields the section manager reads
// (letter for word derivation, plus array length for the step count).
function makeStep(letter: string): StepData {
  return { letter, stepNumber: 1, isBlank: false } as unknown as StepData;
}

function lengthConfig(): SectionConfig {
  return {
    groupBy: "length",
    sortMethod: BrowseSortMethod.SEQUENCE_LENGTH,
    showEmptySections: false,
    expandedSections: new Set<string>(),
  };
}

describe("organizeSections — length grouping", () => {
  // Regression: a 3-step sequence whose word is "Δ-QZ-" (5 characters, because
  // the Type-3 dash convention adds a "-" to Δ- and Z-) was bucketed into
  // "5 steps" because the length key fell back to word.length when the optional
  // stored sequenceLength was absent. The step count must come from steps, not
  // from how many characters the word string happens to have.
  it("buckets by step count, not word character count, when sequenceLength is absent", () => {
    const seq = {
      id: "seq-puppyflower",
      name: "Δ-QZ-",
      word: "Δ-QZ-", // 5 characters
      steps: [makeStep("Δ-"), makeStep("Q"), makeStep("Z-")], // 3 steps
      thumbnails: [],
      tags: [],
      metadata: {},
      isFavorite: false,
      // sequenceLength intentionally omitted — legacy docs lack it
    } as unknown as SequenceData;

    const sections = organizeSections([seq], lengthConfig());

    expect(sections).toHaveLength(1);
    expect(sections[0]!.title).toContain("3 steps");
    expect(sections[0]!.title).not.toContain("5 steps");
    expect(sections[0]!.id).toBe("length-3-steps");
  });

  it("prefers the stored sequenceLength when present", () => {
    const seq = {
      id: "seq-stored",
      name: "AB",
      word: "AB",
      steps: [],
      thumbnails: [],
      tags: [],
      metadata: {},
      isFavorite: false,
      sequenceLength: 8,
    } as unknown as SequenceData;

    const sections = organizeSections([seq], lengthConfig());

    expect(sections[0]!.title).toContain("8 steps");
  });
});

function letterConfig(): SectionConfig {
  return {
    groupBy: "letter",
    sortMethod: "alphabetical" as BrowseSortMethod,
    showEmptySections: false,
    expandedSections: new Set<string>(),
  };
}

describe("organizeSections - letter grouping", () => {
  // Regression: a skewed-frame word like "{ABAB}" was bucketed under "{"
  // because deriveLetter read the brace as the first character. The braces
  // mark a span, not a letter, so a braced word must file under its first
  // letter and land in the same section as a plain word with that letter.
  it("files a braced word under its first letter, alongside a plain word with the same letter", () => {
    const bracedSeq = {
      id: "seq-braced",
      name: "{ABAB}",
      word: "{ABAB}",
      steps: [],
      thumbnails: [],
      tags: [],
      metadata: {},
      isFavorite: false,
      sequenceLength: 4,
    } as unknown as SequenceData;

    const plainSeq = {
      id: "seq-plain",
      name: "ACDB",
      word: "ACDB",
      steps: [],
      thumbnails: [],
      tags: [],
      metadata: {},
      isFavorite: false,
      sequenceLength: 4,
    } as unknown as SequenceData;

    const sections = organizeSections([bracedSeq, plainSeq], letterConfig());

    expect(sections).toHaveLength(1);
    expect(sections[0]!.id).toBe("letter-a");
    expect(sections[0]!.count).toBe(2);
    expect(sections[0]!.title.startsWith("A ")).toBe(true);
  });
});

describe("organizeSections - level grouping", () => {
  function seq(id: string, word: string, level: number, length: number): SequenceData {
    return {
      id,
      name: word,
      word,
      level,
      sequenceLength: length,
      steps: [],
    } as unknown as SequenceData;
  }

  // A Mandala family mixes letters and lengths; letter and length
  // sub-sections left it in one-card rows.
  it("makes one section per level, easiest first, keeping the given order inside", () => {
    const given = [
      seq("b1", "BCA", 1, 3),
      seq("a1", "AC", 1, 2),
      seq("z1", "ZZZZ", 1, 4),
      seq("c2", "CAB", 2, 3),
      seq("a3", "ABCD", 3, 4),
    ];
    const sections = organizeSections([given[3]!, given[4]!, ...given.slice(0, 3)], {
      groupBy: "level",
      sortMethod: BrowseSortMethod.ALPHABETICAL,
      showEmptySections: false,
    });

    expect(sections.map((s) => s.title)).toEqual([
      "Level 1 (3 sequences)",
      "Level 2 (1 sequence)",
      "Level 3 (1 sequence)",
    ]);
    // Same-length cards together, shortest first; the given order decides
    // within a length.
    expect(sections[0]!.sequences.map((s) => s.id)).toEqual(["a1", "b1", "z1"]);
    // No level field: the grid draws a plain heading per level, with no
    // letter sub-headings under a banner.
    expect(sections.every((s) => s.level === undefined)).toBe(true);
  });

  it("keeps the given order among cards of one length", () => {
    const sections = organizeSections(
      [seq("x", "CC", 2, 8), seq("y", "AA", 2, 4), seq("z", "BB", 2, 8), seq("w", "DD", 2, 4)],
      { groupBy: "level", sortMethod: BrowseSortMethod.DIFFICULTY_LEVEL, showEmptySections: false }
    );
    expect(sections).toHaveLength(1);
    expect(sections[0]!.sequences.map((s) => s.id)).toEqual(["y", "w", "x", "z"]);
  });
});

describe("organizeSections - one section per starting letter", () => {
  function seq(id: string, word: string, length: number): SequenceData {
    return { id, name: word, word, sequenceLength: length, steps: [] } as unknown as SequenceData;
  }

  // Letter AND length sections ("A · 4 steps · 3") left many groups with one
  // to three cards and holes in the grid.
  it("puts every length of a letter in one section, same lengths together", () => {
    const sections = organizeSections(
      [
        seq("a8", "ABCDABCD", 8),
        seq("b4", "BACD", 4),
        seq("a4", "ACDB", 4),
        seq("a16", "AAAABBBBCCCCDDDD", 16),
        seq("a4b", "ADCB", 4),
      ],
      letterConfig()
    );

    expect(sections.map((s) => s.title)).toEqual(["A (4 sequences)", "B (1 sequence)"]);
    expect(sections[0]!.id).toBe("letter-a");
    expect(sections[0]!.sequences.map((s) => s.id.replace(/b$/, ""))).toEqual([
      "a4",
      "a4",
      "a8",
      "a16",
    ]);
  });

  it("orders sections by the kinetic alphabet, W before W-", () => {
    const sections = organizeSections(
      [seq("wd", "W-A", 2), seq("b", "BA", 2), seq("w", "WA", 2), seq("a", "AB", 2)],
      letterConfig()
    );
    expect(sections.map((s) => s.title.split(" ")[0])).toEqual(["A", "B", "W", "W-"]);
  });
});
