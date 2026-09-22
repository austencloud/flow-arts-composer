import { describe, it, expect } from "vitest";
import { organizeSections } from "$lib/shared/browse/services/browse-section-manager";
import { BrowseSortMethod } from "$lib/shared/browse/domain/enums/browse-enums";
import type { SectionConfig } from "$lib/shared/browse/domain/models/browse-models";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";

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
    expect(sections[0]!.id).toBe("letter-a|4");
    expect(sections[0]!.count).toBe(2);
    expect(sections[0]!.title.startsWith("A ")).toBe(true);
  });
});
