/**
 * Section Service - Manages sequence section organization
 *
 * Handles grouping sequences into sections with headers and counts.
 *
 * Stateless — plain module functions, no instance state and no singleton
 * wrapper. (Formerly a class behind getBrowseSectionManager().)
 */

import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { BrowseSortMethod } from "#lib/shared/browse/domain/enums/browse-enums.js";
import type {
  SectionConfig,
  SequenceSection,
} from "#lib/shared/browse/domain/models/browse-models.js";
import { sortSequencesByKineticAlphabet } from "#lib/shared/browse/utils/kinetic-alphabet-sort.js";
import { deriveWord } from '#lib/shared/foundation/services/word-deriver.js';
import { stripWordNotation } from "#lib/shared/foundation/utils/word-notation.js";
import { calculateDifficultyLevel } from "#lib/shared/browse/services/sequence-difficulty-calculator.js";

import {
  MANDALA_SECTIONS,
  mandalaSectionById,
  mandalaSectionOf,
  resolveMandalaSpaces,
} from "#lib/shared/browse/services/sequence-density.js";
import { compareByMandala } from "#lib/shared/browse/services/browse-sorter.js";

/** Numeric difficulty (1–3). Prefers the stored `level`, else computes from steps. */
function resolveLevel(sequence: SequenceData): number {
  if (typeof sequence.level === "number") return sequence.level;
  if (sequence.steps?.length) return calculateDifficultyLevel([...sequence.steps]);
  return 1;
}

const TYPE6_LETTERS = ["α", "β", "γ", "ζ", "η", "τ", "⊕"];

// Canonical T&D family order + element label. Kept local (mirrors TND_ELEMENTS)
// to avoid a shared→features dependency; used only by the "tnd-family" group,
// which the founding-deck views opt into via defaultSectionGroupBy.
const TND_FAMILY_ORDER = [
  "split-same",
  "tog-same",
  "quarter-same",
  "split-opp",
  "tog-opp",
  "quarter-opp",
] as const;
const TND_FAMILY_LABEL: Readonly<Record<string, { name: string; element: string }>> = {
  "split-same": { name: "Split-Same", element: "Water" },
  "tog-same": { name: "Tog-Same", element: "Earth" },
  "quarter-same": { name: "Quarter-Same", element: "Sun" },
  "split-opp": { name: "Split-Opp", element: "Fire" },
  "tog-opp": { name: "Tog-Opp", element: "Air" },
  "quarter-opp": { name: "Quarter-Opp", element: "Moon" },
};

/** The T&D family a canonical pool sequence belongs to, read from its tags. */
function tndFamilyOf(sequence: SequenceData): string {
  return sequence.tags?.find((t) => t in TND_FAMILY_LABEL) ?? "unknown";
}

/** First-letter label in the kinetic alphabet ("A", "W-", "α"…). */
function deriveLetter(sequence: SequenceData): string {
  const word = stripWordNotation(deriveWord(sequence));
  const firstChar = word.charAt(0);
  // Type 6 letters keep their glyph; Type 1–5 uppercase.
  const char = TYPE6_LETTERS.includes(firstChar) ? firstChar : firstChar.toUpperCase();
  const secondChar = word.charAt(1);
  return secondChar === "-" ? `${char}-` : char;
}

function stepCountOf(sequence: SequenceData): number {
  return sequence.sequenceLength ?? sequence.steps?.length ?? 0;
}

export function organizeSections(
  sequences: SequenceData[],
  config: SectionConfig
): SequenceSection[] {
  if (config.groupBy === "none") {
    return [
      {
        id: "all",
        title: "All Sequences",
        count: sequences.length,
        sequences,
        isExpanded: true,
        sortOrder: 0,
      },
    ];
  }

  const grouped = groupSequences(sequences, config.groupBy);
  const sections = createSections(grouped, config);

  return sortSections(sections, config.groupBy);
}

export function toggleSectionExpansion(
  sectionId: string,
  sections: SequenceSection[]
): SequenceSection[] {
  return sections.map((section) => ({
    ...section,
    isExpanded:
      section.id === sectionId ? !section.isExpanded : section.isExpanded,
  }));
}

export function getDefaultSectionConfig(): SectionConfig {
  return {
    groupBy: "letter",
    sortMethod: "alphabetical" as BrowseSortMethod,
    showEmptySections: false,
  };
}

export function updateSectionConfig(
  config: SectionConfig,
  updates: Partial<SectionConfig>
): SectionConfig {
  return {
    ...config,
    ...updates,
  };
}

export interface SectionStatistics {
  totalSections: number;
  totalSequences: number;
  expandedSections: number;
  averageSequencesPerSection: number;
}

export function getSectionStatistics(
  sections: SequenceSection[]
): SectionStatistics {
  const totalSections = sections.length;
  const totalSequences = sections.reduce(
    (sum, section) => sum + section.count,
    0
  );
  const expandedSections = sections.filter(
    (section) => section.isExpanded
  ).length;
  const averageSequencesPerSection =
    totalSections > 0 ? totalSequences / totalSections : 0;

  return {
    totalSections,
    totalSequences,
    expandedSections,
    averageSequencesPerSection:
      Math.round(averageSequencesPerSection * 10) / 10,
  };
}

// Private helper functions
function groupSequences(
  sequences: SequenceData[],
  groupBy: SectionConfig["groupBy"]
): Map<string, SequenceData[]> {
  const groups = new Map<string, SequenceData[]>();

  sequences.forEach((sequence) => {
    const key = getGroupKey(sequence, groupBy);
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    const group = groups.get(key);
    if (group) {
      group.push(sequence);
    }
  });

  return groups;
}

function getGroupKey(
  sequence: SequenceData,
  groupBy: SectionConfig["groupBy"]
): string {
  switch (groupBy) {
    case "letter":
      // One section per starting letter. Same-length cards sit together
      // inside it (orderSectionSequences), so rows stay even without a
      // letter-and-length section for every pair, most of which held one to
      // three cards and left holes in the grid.
      return deriveLetter(sequence);

    case "length":
      // Bucket by step count, never word character count. The Type-3/4/5 dash
      // convention (Δ-, Z-) adds a "-" per letter, so word.length overcounts a
      // sequence's steps (e.g. the 3-step "Δ-QZ-" has a 5-char word). stepCountOf
      // falls back to steps.length — always hydrated — when the optional stored
      // sequenceLength is absent on legacy docs.
      return `${stepCountOf(sequence)} steps`;

    case "difficulty":
      // Two-axis: level → letter → beat count, so the grid/sidebar can render a
      // level banner with letter subsections beneath. Key: "1|A|4".
      return `${resolveLevel(sequence)}|${deriveLetter(sequence)}|${stepCountOf(sequence)}`;

    case "level":
      // Level alone, one section per level with every card together. Letter
      // and length sub-sections left most groups with one to three cards.
      return String(resolveLevel(sequence));

    case "density":
      // How busy the sequence's mandala is: simple, busier, complex.
      return mandalaSectionOf(resolveMandalaSpaces(sequence)).id;

    case "author":
      return sequence.author ?? "Unknown Author";

    case "tnd-family":
      return tndFamilyOf(sequence);

    case "date": {
      // Canonical fallback: birthday (original creation) → createdAt → dateAdded
      const rawDate = sequence.birthday ?? sequence.createdAt ?? sequence.dateAdded;
      if (!rawDate) return "Unknown Date";
      const date = rawDate instanceof Date ? rawDate : new Date(rawDate);
      // Handle invalid dates
      if (isNaN(date.getTime())) return "Unknown Date";
      return date.toDateString();
    }

    default:
      return "All";
  }
}

function createSections(
  grouped: Map<string, SequenceData[]>,
  config: SectionConfig
): SequenceSection[] {
  const sections: SequenceSection[] = [];

  grouped.forEach((sequences, key) => {
    if (!config.showEmptySections && sequences.length === 0) {
      return;
    }

    const section: SequenceSection = {
      id: createSectionId(key, config.groupBy),
      title: createSectionTitle(key, config.groupBy, sequences.length),
      count: sequences.length,
      sequences: orderSectionSequences(sequences, config),
      isExpanded: config.expandedSections?.has(key) ?? false,
      sortOrder: getSectionSortOrder(key, config.groupBy),
    };

    // Difficulty key is "level|letter|steps" — expose the level + letter so the
    // grid banner and sidebar can build the level→letter hierarchy structurally.
    if (config.groupBy === "difficulty") {
      const [levelStr = "", letter = ""] = key.split("|");
      section.level = parseInt(levelStr, 10) || 1;
      section.groupLabel = letter;
    }

    sections.push(section);
  });

  return sections;
}

/** Stable sort by step count: same-length cards end up side by side, and
 * cards of one length keep the order they arrived in. */
function byLengthKeepingOrder(sequences: SequenceData[]): SequenceData[] {
  return sequences
    .map((sequence, index) => ({ sequence, index }))
    .sort(
      (a, b) =>
        stepCountOf(a.sequence) - stepCountOf(b.sequence) || a.index - b.index
    )
    .map(({ sequence }) => sequence);
}

/** The order inside one section. A section groups by ONE thing (a letter, a
 * level). Inside it, same-length sequences sit together so most rows hold
 * cards of one length, and the sort decides the order within a length. */
function orderSectionSequences(
  sequences: SequenceData[],
  config: SectionConfig
): SequenceData[] {
  switch (config.groupBy) {
    case "level":
      // The caller's sort and direction, grouped by length.
      return byLengthKeepingOrder(sequences);
    case "letter":
      return byLengthKeepingOrder(
        sortSequencesInSection(sequences, config.sortMethod)
      );
    default:
      return sortSequencesInSection(sequences, config.sortMethod);
  }
}

function createSectionId(
  key: string,
  groupBy: SectionConfig["groupBy"]
): string {
  return `${groupBy}-${key.toLowerCase().replace(/\s+/g, "-")}`;
}

function createSectionTitle(
  key: string,
  groupBy: SectionConfig["groupBy"],
  count: number
): string {
  const countText = count === 1 ? "1 sequence" : `${count} sequences`;

  switch (groupBy) {
    case "letter":
      // Parentheses avoid a double dash with letters like "W-".
      return `${key} (${countText})`;

    case "length":
      return `${key} (${countText})`;

    case "level":
      return `Level ${key} (${countText})`;

    case "difficulty": {
      // key is "level|letter|steps" — title carries level + letter (kept unique
      // per section for the scroll anchor); the grid renders the colored badge.
      const [lvl = "", letter = "", stepStr = "0"] = key.split("|");
      const steps = parseInt(stepStr, 10) || 0;
      return `Level ${lvl} · ${letter} (${steps} steps) (${countText})`;
    }

    case "density":
      return `${mandalaSectionById(key)?.label ?? key} (${countText})`;

    case "author":
      return `👤 ${key} (${countText})`;

    case "tnd-family": {
      const meta = TND_FAMILY_LABEL[key];
      const label = meta ? `${meta.name} · ${meta.element}` : "Other";
      return `${label} (${countText})`;
    }

    case "date":
      return `📅 ${formatDateForSection(key)} (${countText})`;

    default:
      return `${key} (${countText})`;
  }
}

function sortSequencesInSection(
  sequences: SequenceData[],
  sortMethod: BrowseSortMethod
): SequenceData[] {
  const sorted = [...sequences];

  // Step count (never word character count — see getGroupKey "length" case).
  const getLength = stepCountOf;

  switch (sortMethod) {
    case "alphabetical": {
      // Primary: Kinetic alphabet order, Secondary: length for visual consistency
      const alphabetSorted = sortSequencesByKineticAlphabet(sorted);
      return alphabetSorted.sort((a, b) => {
        // Keep alphabetical order but group by length within same starting letter
        const letterA = stripWordNotation(a.word ?? "").charAt(0);
        const letterB = stripWordNotation(b.word ?? "").charAt(0);
        if (letterA === letterB) {
          return getLength(a) - getLength(b);
        }
        return 0; // Keep original alphabetical order for different letters
      });
    }

    case BrowseSortMethod.DIFFICULTY_LEVEL:
      return sorted.sort((a, b) => {
        const diffCompare = resolveLevel(a) - resolveLevel(b);
        // Secondary sort by length for visual consistency
        if (diffCompare === 0) {
          return getLength(a) - getLength(b);
        }
        return diffCompare;
      });

    case BrowseSortMethod.SEQUENCE_LENGTH:
      return sorted.sort((a, b) => {
        const lengthA = getLength(a);
        const lengthB = getLength(b);
        return lengthA - lengthB;
      });

    case BrowseSortMethod.DATE_ADDED:
      // Primary: most recent first, Secondary: length for visual consistency
      return sorted.sort((a, b) => {
        const dateA = a.dateAdded ? new Date(a.dateAdded).getTime() : 0;
        const dateB = b.dateAdded ? new Date(b.dateAdded).getTime() : 0;
        // Group by length first within sections for visual consistency
        // (sequences in the same row should have similar heights)
        const lengthCompare = getLength(a) - getLength(b);
        if (lengthCompare !== 0) {
          return lengthCompare;
        }
        return dateB - dateA; // Most recent first as secondary
      });

    case BrowseSortMethod.DENSITY:
      // The same order as the sort: spaces, coverage, level, length.
      return sorted.sort(compareByMandala);

    case "author":
      return sorted.sort((a, b) => {
        const authorCompare = (a.author ?? "").localeCompare(b.author ?? "");
        // Secondary sort by length for visual consistency
        if (authorCompare === 0) {
          return getLength(a) - getLength(b);
        }
        return authorCompare;
      });

    default:
      // Default: sort by length for visual consistency
      return sorted.sort((a, b) => getLength(a) - getLength(b));
  }
}

function sortSections(
  sections: SequenceSection[],
  _groupBy: SectionConfig["groupBy"]
): SequenceSection[] {
  return sections.sort((a, b) => {
    // Primary sort by sortOrder
    if (a.sortOrder !== b.sortOrder) {
      return a.sortOrder - b.sortOrder;
    }

    // Secondary sort by title for consistent ordering
    return a.title.localeCompare(b.title);
  });
}

function getSectionSortOrder(
  key: string,
  groupBy: SectionConfig["groupBy"]
): number {
  // Kinetic alphabet order
  const KINETIC_ALPHABET_ORDER = [
    // Type 1: Dual-Shift (A-V, includes M and N)
    "A",
    "B",
    "C",
    "D",
    "E",
    "F",
    "G",
    "H",
    "I",
    "J",
    "K",
    "L",
    "M",
    "N",
    "O",
    "P",
    "Q",
    "R",
    "S",
    "T",
    "U",
    "V",
    // Type 2: Shift
    "W",
    "X",
    "Y",
    "Z",
    "Σ",
    "Δ",
    "Θ",
    "Ω",
    // Advanced Type 2s
    "μ",
    "ν",
    // Type 3: Cross-Shift
    "W-",
    "X-",
    "Y-",
    "Z-",
    "Σ-",
    "Δ-",
    "Θ-",
    "Ω-",
    // Type 4: Dash
    "Φ",
    "Ψ",
    "Λ",
    // Type 5: Dual-Dash
    "Φ-",
    "Ψ-",
    "Λ-",
    // Type 6: Static
    "α",
    "β",
    "γ",
    // Advanced Type 6s
    "ζ",
    "η",
    "τ",
    "⊕",
  ];

  switch (groupBy) {
    case "letter": {
      // Kinetic alphabet order: A before B, W before W-. A letter outside
      // the alphabet goes last.
      const letterIndex = KINETIC_ALPHABET_ORDER.indexOf(key);
      return letterIndex === -1 ? 9999 : letterIndex;
    }

    case "length": {
      // Extract number from "X steps"
      const match = key.match(/^(\d+)/);
      return match?.[1] ? parseInt(match[1]) : 999;
    }

    case "difficulty": {
      // key is "level|letter|steps" — order by level, then kinetic-alphabet
      // letter, then beat count.
      const [lvlStr = "", letter = "", stepStr = "0"] = key.split("|");
      const level = parseInt(lvlStr, 10) || 9;
      const letterIndex = KINETIC_ALPHABET_ORDER.indexOf(letter);
      const beatOrder = parseInt(stepStr, 10) || 0;
      return level * 1_000_000 + (letterIndex + 1) * 1000 + beatOrder;
    }

    case "level":
      // Easiest first.
      return parseInt(key, 10) || 9;

    case "density": {
      const index = MANDALA_SECTIONS.findIndex((section) => section.id === key);
      return index === -1 ? 999 : index;
    }

    case "author":
      // Alphabetical by author
      return 0; // Will be sorted by title comparison

    case "tnd-family": {
      const idx = TND_FAMILY_ORDER.indexOf(key as (typeof TND_FAMILY_ORDER)[number]);
      return idx === -1 ? 999 : idx;
    }

    case "date": {
      // Most recent first
      const date = new Date(key);
      return -date.getTime(); // Negative for reverse chronological
    }

    default:
      return 0;
  }
}

function formatDateForSection(dateString: string): string {
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return dateString;

  const now = new Date();
  const diffTime = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;

  return date.toLocaleDateString();
}

// Additional functions required by browse-interfaces.ts
export function organizeIntoSections(
  sequences: SequenceData[],
  config: SectionConfig
): SequenceSection[] {
  // Use the existing organizeSections function
  return organizeSections(sequences, config);
}

export function getSectionConfig(sortMethod: BrowseSortMethod): SectionConfig {
  // Return a basic configuration based on sort method
  return {
    groupBy: "letter" as const,
    sortMethod: sortMethod,
    showEmptySections: false,
    expandedSections: new Set<string>(),
  };
}
