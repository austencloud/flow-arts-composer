/**
 * Browse Sort Service
 *
 * Handles sorting and grouping of gallery sequences.
 * Provides consistent sorting behavior across the gallery.
 */

import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { BrowseSortMethod } from "$lib/shared/browse/domain/enums/browse-enums";
import { sortSequencesByKineticAlphabet } from "$lib/shared/browse/utils/kinetic-alphabet-sort";
import { calculateDifficultyLevel } from "$lib/shared/browse/services/sequence-difficulty-calculator";
import { resolveBrowseDate } from "$lib/shared/browse/services/browse-date";
import { stripWordNotation } from "$lib/shared/foundation/utils/word-notation";

/** Numeric difficulty (1–3). Prefers stored `level`, else computes from steps. */
export function resolveDifficultyLevel(sequence: SequenceData): number {
  if (typeof sequence.level === "number") return sequence.level;
  if (sequence.steps?.length) return calculateDifficultyLevel([...sequence.steps]);
  return 1;
}

/**
 * Step count for a sequence. The optional stored `sequenceLength` is absent on
 * legacy/imported docs, so fall back to the always-hydrated `steps` array.
 * Never use word length — the dash convention (Δ-, Z-) inflates it past the
 * real step count.
 */
export function resolveStepCount(sequence: SequenceData): number {
  return sequence.sequenceLength ?? sequence.steps?.length ?? 0;
}

export function sortSequences(
  sequences: SequenceData[],
  sortMethod: BrowseSortMethod
): SequenceData[] {
  const sorted = [...sequences];

  switch (sortMethod) {
    case BrowseSortMethod.ALPHABETICAL:
      return sortAlphabetically(sorted);
    case BrowseSortMethod.DATE_ADDED:
      return sortByDateAdded(sorted);
    case BrowseSortMethod.DIFFICULTY_LEVEL:
      return sortByDifficulty(sorted);
    case BrowseSortMethod.SEQUENCE_LENGTH:
      return sortByLength(sorted);
    case BrowseSortMethod.AUTHOR:
      return sortByAuthor(sorted);
    case BrowseSortMethod.POPULARITY:
      return sortByPopularity(sorted);
    default:
      return sorted;
  }
}

export function groupSequencesIntoSections(
  sequences: SequenceData[],
  sortMethod: BrowseSortMethod
): Record<string, SequenceData[]> {
  const sections: Record<string, SequenceData[]> = {};

  for (const sequence of sequences) {
    const sectionKey = getSectionKey(sequence, sortMethod);

    if (!sections[sectionKey]) {
      sections[sectionKey] = [];
    }

    sections[sectionKey].push(sequence);
  }

  return sections;
}

// Sorting Methods

function sortAlphabetically(sequences: SequenceData[]): SequenceData[] {
  // Use the kinetic alphabet order (Type 1-6 letters in proper TKA sequence)
  return sortSequencesByKineticAlphabet(sequences);
}

function sortByDateAdded(sequences: SequenceData[]): SequenceData[] {
  return sequences.sort(
    (a, b) =>
      (resolveBrowseDate(b)?.getTime() ?? 0) -
      (resolveBrowseDate(a)?.getTime() ?? 0)
  ); // Newest first
}

function sortByDifficulty(sequences: SequenceData[]): SequenceData[] {
  return sequences.sort((a, b) => resolveDifficultyLevel(a) - resolveDifficultyLevel(b)); // Easiest first
}

function sortByLength(sequences: SequenceData[]): SequenceData[] {
  return sequences.sort((a, b) => resolveStepCount(a) - resolveStepCount(b));
}

function sortByAuthor(sequences: SequenceData[]): SequenceData[] {
  return sequences.sort((a, b) =>
    (a.author ?? "").localeCompare(b.author ?? "")
  );
}

function sortByPopularity(sequences: SequenceData[]): SequenceData[] {
  return sequences.sort(
    (a, b) => Number(b.isFavorite) - Number(a.isFavorite)
  );
}

// Section Key Generation

function getSectionKey(
  sequence: SequenceData,
  sortMethod: BrowseSortMethod
): string {
  switch (sortMethod) {
    case BrowseSortMethod.ALPHABETICAL:
      return getAlphabeticalSection(sequence);
    case BrowseSortMethod.DIFFICULTY_LEVEL:
      return String(resolveDifficultyLevel(sequence));
    case BrowseSortMethod.AUTHOR:
      return sequence.author ?? "Unknown";
    case BrowseSortMethod.SEQUENCE_LENGTH:
      return getLengthSection(sequence);
    default:
      return "All";
  }
}

function getAlphabeticalSection(sequence: SequenceData): string {
  // Skew braces mark a span, not a letter: section by the letters inside.
  const word = stripWordNotation(sequence.word ?? "");
  if (word.length === 0) return "#";

  const firstChar = word[0]!;

  // Type 6 letters: α, β, γ, ζ, η, τ, ⊕
  const TYPE6_LETTERS = ["α", "β", "γ", "ζ", "η", "τ", "⊕"];

  let char: string;
  if (TYPE6_LETTERS.includes(firstChar)) {
    // Type 6 letter - keep as-is
    char = firstChar;
  } else {
    // Type 1-5, uppercase it
    char = firstChar.toUpperCase();
  }

  // Check for dash variant (e.g., "Θ-" should return "Θ-" not just "Θ")
  const secondChar = word[1];
  if (secondChar === "-") {
    return `${char}-`;
  }

  return char;
}

function getLengthSection(sequence: SequenceData): string {
  const length = resolveStepCount(sequence);

  if (length <= 4) return "3-4 steps";
  if (length <= 6) return "5-6 steps";
  if (length <= 8) return "7-8 steps";
  return "9+ steps";
}
