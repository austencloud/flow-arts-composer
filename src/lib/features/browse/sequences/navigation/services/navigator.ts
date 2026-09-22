/**
 * Navigation Service - Manages browse tab navigation
 *
 * Handles sidebar navigation sections, organization, and state management
 * following the microservices architecture pattern.
 */

import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { toast } from "$lib/shared/toast/state/toast-state.svelte";
import { stripWordNotation } from "$lib/shared/foundation/utils/word-notation";
import type {
  BrowseNavigationConfig,
  BrowseNavigationItem,
} from "../domain/models/navigation-models";

// Local type alias for NavigationSection
type NavigationSection = BrowseNavigationConfig;

export function generateNavigationSections(
  sequences: SequenceData[],
  favorites: string[]
): NavigationSection[] {
  const sections: NavigationSection[] = [
    generateFavoritesSection(sequences, favorites),
    generateDateSection(sequences),
    generateLengthSection(sequences),
    generateLetterSection(sequences),
    generateLevelSection(sequences),
    generateAuthorSection(sequences),
  ];

  return sections;
}

export function toggleSectionExpansion(
  sectionId: string,
  sections: NavigationSection[]
): NavigationSection[] {
  return sections.map((section) => ({
    ...section,
    isExpanded:
      section.id === sectionId ? !section.isExpanded : section.isExpanded,
  }));
}

export function setActiveItem(
  sectionId: string,
  itemId: string,
  sections: NavigationSection[]
): NavigationSection[] {
  return sections.map((section) => ({
    ...section,
    items: section.items.map((item) => ({
      ...item,
      isActive: section.id === sectionId && item.id === itemId,
    })),
  }));
}

export function clearActiveStates(sections: NavigationSection[]): NavigationSection[] {
  return sections.map((section) => ({
    ...section,
    items: section.items.map((item) => ({
      ...item,
      isActive: false,
    })),
  }));
}

export function getSequencesForNavigationItem(
  item: BrowseNavigationItem,
  sectionType: NavigationSection["type"],
  allSequences: SequenceData[]
): SequenceData[] {
  switch (sectionType) {
    case "length": {
      const length = parseInt(item.value as string);
      return allSequences.filter((seq) => {
        // Calculate correct sequence length: steps.length - 2
        // Subtract 2 for metadata beat and start position beat
        const sequenceLength = seq.steps.length - 2;
        return sequenceLength === length;
      });
    }

    case "letter":
      return allSequences.filter((seq) =>
        stripWordNotation(seq.word ?? "").startsWith(item.value as string)
      );

    case "level":
      return allSequences.filter((seq) => seq.difficultyLevel === item.value);

    case "author":
      return allSequences.filter((seq) => seq.author === item.value);

    case "date":
      // Implementation depends on date format
      return allSequences.filter((seq) => {
        const rawDate = seq.birthday ?? seq.createdAt ?? seq.dateAdded;
        if (!rawDate) return false;
        const itemDate = new Date(item.value as string);
        const seqDate = rawDate instanceof Date ? rawDate : new Date(rawDate);
        if (isNaN(seqDate.getTime())) return false;
        return seqDate.toDateString() === itemDate.toDateString();
      });

    case "favorites":
      // Will be handled by favorites filter
      return allSequences;

    default:
      return allSequences;
  }
}

export function updateSectionCounts(
  sections: NavigationSection[],
  sequences: SequenceData[],
  favorites: string[]
): NavigationSection[] {
  return sections.map((section) => ({
    ...section,
    totalCount: calculateSectionCount(section, sequences, favorites),
    items: section.items.map((item) => ({
      ...item,
      count: getSequencesForNavigationItem(item, section.type, sequences)
        .length,
    })),
  }));
}

export function buildNavigationStructure(
  sequences: SequenceData[]
): BrowseNavigationConfig[] {
  return generateNavigationSections(sequences, []);
}

export function getNavigationItem(
  _sectionId: string,
  _itemId: string
): BrowseNavigationItem | null {
  // This would need to be implemented based on the current navigation state
  // For now, return null as a placeholder
  return null;
}

export function filterSequencesByNavigation(
  sequences: SequenceData[],
  item: unknown,
  sectionType: string
): SequenceData[] {
  // Basic implementation - filter sequences based on navigation item
  try {
    switch (sectionType) {
      case "favorites":
        // Filter by favorites (would need favorites service)
        return sequences.filter((seq) => seq.isFavorite);
      case "letter":
        // Filter by starting letter
        if (typeof item === "object" && item && "value" in item) {
          const letter = (item as { value: string }).value;
          return sequences.filter((seq) =>
            stripWordNotation(seq.word ?? "")
              .toLowerCase()
              .startsWith(letter.toLowerCase())
          );
        }
        break;
      case "level":
        if (typeof item === "object" && item && "value" in item) {
          const level = (item as { value: string }).value;
          return sequences.filter((seq) => seq.difficultyLevel === level);
        }
        break;
      case "author":
        if (typeof item === "object" && item && "value" in item) {
          const author = (item as { value: string }).value;
          return sequences.filter((seq) => seq.author === author);
        }
        break;
      case "length":
        // Filter by sequence length
        if (typeof item === "object" && item && "value" in item) {
          const length = (item as { value: number }).value;
          return sequences.filter((seq) => {
            // Calculate correct sequence length: steps.length - 2
            // Subtract 2 for metadata beat and start position beat
            const sequenceLength = seq.steps.length - 2;
            return sequenceLength === length;
          });
        }
        break;
      default:
        return sequences;
    }
    return sequences;
  } catch (error) {
    console.error("Failed to filter sequences by navigation:", error);
    toast.error("Failed to apply filter. Showing all sequences instead.");
    return sequences;
  }
}

// Private helper functions

function generateFavoritesSection(
  sequences: SequenceData[],
  favorites: string[]
): NavigationSection {
  const favoriteSequences = sequences.filter((seq) =>
    favorites.includes(seq.id)
  );

  return {
    id: "favorites",
    title: "⭐ Favorites",
    type: "favorites",
    items: [
      {
        id: "all-favorites",
        label: "All Favorites",
        value: "favorites",
        count: favoriteSequences.length,
        isActive: false,
        sequences: favoriteSequences,
      },
    ],
    isExpanded: false,
    totalCount: favoriteSequences.length,
  };
}

function generateDateSection(sequences: SequenceData[]): NavigationSection {
  const dateGroups = new Map<string, SequenceData[]>();

  sequences.forEach((seq) => {
    // Canonical fallback: birthday (original creation) → createdAt → dateAdded
    const rawDate = seq.birthday ?? seq.createdAt ?? seq.dateAdded;
    if (rawDate) {
      const date = rawDate instanceof Date ? rawDate : new Date(rawDate);
      // Skip invalid dates
      if (isNaN(date.getTime())) {
        return;
      }
      const dateKey = date.toDateString();
      if (!dateGroups.has(dateKey)) {
        dateGroups.set(dateKey, []);
      }
      const group = dateGroups.get(dateKey);
      if (group) {
        group.push(seq);
      }
    }
  });

  const items: BrowseNavigationItem[] = Array.from(dateGroups.entries())
    .sort(([a], [b]) => new Date(b).getTime() - new Date(a).getTime())
    .slice(0, 50) // Show last 50 dates (increased from 10)
    .map(([date, seqs]) => ({
      id: `date-${date}`,
      label: formatDateLabel(new Date(date)),
      value: date,
      count: seqs.length,
      isActive: false,
      sequences: seqs,
    }));

  return {
    id: "date",
    title: "📅 Date",
    type: "date",
    items,
    isExpanded: false,
    totalCount: items.reduce((sum, item) => sum + item.count, 0),
  };
}

function generateLengthSection(sequences: SequenceData[]): NavigationSection {
  const lengthGroups = new Map<number, SequenceData[]>();

  sequences.forEach((seq) => {
    // Calculate correct sequence length: steps.length - 2
    // Subtract 2 for metadata beat and start position beat
    if (!seq.steps) return;
    const length = seq.steps.length - 2;
    if (!lengthGroups.has(length)) {
      lengthGroups.set(length, []);
    }
    const group = lengthGroups.get(length);
    if (group) {
      group.push(seq);
    }
  });

  const items: BrowseNavigationItem[] = Array.from(lengthGroups.entries())
    .sort(([a], [b]) => a - b)
    .map(([length, seqs]) => ({
      id: `length-${length}`,
      label: `${length} steps`,
      value: length,
      count: seqs.length,
      isActive: false,
      sequences: seqs,
    }));

  return {
    id: "length",
    title: "📏 Length",
    type: "length",
    items,
    isExpanded: false,
    totalCount: items.reduce((sum, item) => sum + item.count, 0),
  };
}

function generateLetterSection(sequences: SequenceData[]): NavigationSection {
  const letterGroups = new Map<string, SequenceData[]>();

  sequences.forEach((seq) => {
    // Skip sequences without a valid word property
    if (!seq.word || typeof seq.word !== "string") {
      return;
    }
    // Skew braces mark a span, not a letter: index by the first letter inside.
    const bare = stripWordNotation(seq.word);
    if (bare.length === 0) {
      return;
    }

    // Handle letter types: "W" vs "W-" (type 3 letters)
    const firstChar = bare.charAt(0).toUpperCase();
    const secondChar = bare.charAt(1);
    const firstLetter = secondChar === "-" ? `${firstChar}-` : firstChar;

    if (!letterGroups.has(firstLetter)) {
      letterGroups.set(firstLetter, []);
    }
    const group = letterGroups.get(firstLetter);
    if (group) {
      group.push(seq);
    }
  });

  const items: BrowseNavigationItem[] = Array.from(letterGroups.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([letter, seqs]) => ({
      id: `letter-${letter}`,
      label: letter,
      value: letter,
      count: seqs.length,
      isActive: false,
      sequences: seqs,
    }));

  return {
    id: "letter",
    title: "🔤 Starting Letter",
    type: "letter",
    items,
    isExpanded: true, // Default expanded like desktop
    totalCount: items.reduce((sum, item) => sum + item.count, 0),
  };
}

function generateLevelSection(sequences: SequenceData[]): NavigationSection {
  const levelGroups = new Map<string, SequenceData[]>();

  sequences.forEach((seq) => {
    const level = seq.difficultyLevel ?? "unknown";
    if (!levelGroups.has(level)) {
      levelGroups.set(level, []);
    }
    const group = levelGroups.get(level);
    if (group) {
      group.push(seq);
    }
  });

  const levelOrder = ["beginner", "intermediate", "advanced", "unknown"];
  const items: BrowseNavigationItem[] = levelOrder
    .filter((level) => levelGroups.has(level))
    .map((level) => ({
      id: `level-${level}`,
      label: level.charAt(0).toUpperCase() + level.slice(1),
      value: level,
      count: levelGroups.get(level)?.length ?? 0,
      isActive: false,
      sequences: levelGroups.get(level) ?? [],
    }));

  return {
    id: "level",
    title: "📊 Difficulty",
    type: "level",
    items,
    isExpanded: false,
    totalCount: items.reduce((sum, item) => sum + item.count, 0),
  };
}

function generateAuthorSection(sequences: SequenceData[]): NavigationSection {
  const authorGroups = new Map<string, SequenceData[]>();

  sequences.forEach((seq) => {
    const author = seq.author ?? "Unknown";
    if (!authorGroups.has(author)) {
      authorGroups.set(author, []);
    }
    const group = authorGroups.get(author);
    if (group) {
      group.push(seq);
    }
  });

  const items: BrowseNavigationItem[] = Array.from(authorGroups.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([author, seqs]) => ({
      id: `author-${author}`,
      label: author,
      value: author,
      count: seqs.length,
      isActive: false,
      sequences: seqs,
    }));

  return {
    id: "author",
    title: "👤 Author",
    type: "author",
    items,
    isExpanded: false,
    totalCount: items.reduce((sum, item) => sum + item.count, 0),
  };
}

function calculateSectionCount(
  section: NavigationSection,
  sequences: SequenceData[],
  favorites: string[]
): number {
  switch (section.type) {
    case "favorites":
      return sequences.filter((seq) => favorites.includes(seq.id)).length;
    case "author":
      // Count sequences that actually have an author
      return section.items.reduce((sum, item) => sum + item.count, 0);
    case "length":
      // Count sequences by length
      return section.items.reduce((sum, item) => sum + item.count, 0);
    case "letter":
      // Count sequences by starting letter
      return section.items.reduce((sum, item) => sum + item.count, 0);
    case "level":
      // Count sequences by difficulty level
      return section.items.reduce((sum, item) => sum + item.count, 0);
    case "date":
      // Count sequences that have a date
      return sequences.filter((seq) => seq.dateAdded).length;
    default:
      return sequences.length;
  }
}

function formatDateLabel(date: Date): string {
  const now = new Date();
  const diffTime = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;

  return date.toLocaleDateString();
}
