/**
 * Founding smart collections — the three printed T&D decks (TKA 1/2/3) as
 * read-only, config-defined rules over the community pool. Baked into the
 * client, so every user gets them automatically (public by construction).
 * See docs/superpowers/specs/active/2026-07-07-founding-smart-collections-design.md.
 */
import type {
  LibraryCollection,
  SmartFilterSpec,
} from "#lib/shared/library/domain/models/collection.js";
import { BrowseFilterType } from "#lib/shared/persistence/domain/enums/filtering-enums.js";
import { BrowseSortMethod } from "#lib/shared/browse/domain/enums/browse-enums.js";
import { deriveSpecMembers } from "#lib/shared/browse/services/smart-filter-spec.js";
import { sortSequences } from "#lib/shared/browse/services/browse-sorter.js";
import {
  CANONICAL_TND_AUTHOR,
  loadCanonicalBookVariations,
  loadCanonicalTnDBaseSequences,
  loadCanonicalTnDSequences,
} from "#lib/features/browse/gallery-home/canonical-tnd-pool.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";

export interface FoundingSmartCollection {
  /** Stable id, always prefixed "founding_" (underscore avoids the ":" used by
   *  the rail to decode foreign ownerId:collectionId nav ids). */
  id: string;
  name: string;
  description: string;
  /** FontAwesome class, e.g. "fa-graduation-cap". */
  icon: string;
  /** Cached member count for the rail card (variation count). */
  sequenceCount: number;
  filterSpec: SmartFilterSpec;
}

// Fences each rule to the canonical alphabet, excluding user community content.
const AUTHOR_FILTER = {
  key: "author",
  type: String(BrowseFilterType.AUTHOR),
  value: CANONICAL_TND_AUTHOR,
  label: CANONICAL_TND_AUTHOR,
  chipColor: "var(--semantic-info)",
};

// Turn ceiling ≤1 trims the fuller alphabet down to each deck's exact patterns.
const CEIL_1 = {
  key: "max_turn_intensity",
  type: String(BrowseFilterType.MAX_TURN_INTENSITY),
  value: 1,
  label: "≤1 turns",
  chipColor: "var(--semantic-success)",
};

// filterByDifficulty parseInt()s the value, so it MUST be a numeric string.
const diff = (level: 1 | 2 | 3, label: string) => ({
  key: "difficulty",
  type: String(BrowseFilterType.DIFFICULTY),
  value: String(level),
  label,
  chipColor: "var(--semantic-warning)",
});

// Selects the book reversal variants (PPPP) injected into the Book collection's
// engine. filterByReversalPattern treats an absent reversalPattern as
// "continuous", so this fences book from the continuous alphabet.
const BOOK_FILTER = {
  key: "reversal_pattern",
  type: String(BrowseFilterType.REVERSAL_PATTERN),
  value: "book",
  label: "Book",
  chipColor: "var(--semantic-info)",
};

export const FOUNDING_SMART_COLLECTIONS: FoundingSmartCollection[] = [
  {
    id: "founding_tka-1",
    name: "TKA 1: Learning Letters",
    description: "The 19 base T&D motions — no turns.",
    icon: "fa-graduation-cap",
    sequenceCount: 19,
    filterSpec: {
      source: "community",
      filters: [AUTHOR_FILTER, diff(1, "Level 1")],
      sortMethod: "level",
      sortDirection: "asc",
    },
  },
  {
    id: "founding_tka-2",
    name: "TKA 2: Writing Words",
    description: "Whole-turn variations of the base motions.",
    icon: "fa-pen-nib",
    sequenceCount: 57,
    filterSpec: {
      source: "community",
      filters: [AUTHOR_FILTER, diff(2, "Level 2"), CEIL_1],
      sortMethod: "level",
      sortDirection: "asc",
    },
  },
  {
    id: "founding_tka-3",
    name: "TKA 3: Speaking Sentences",
    description: "Half-turn variations of the base motions.",
    icon: "fa-comments",
    sequenceCount: 95,
    filterSpec: {
      source: "community",
      filters: [AUTHOR_FILTER, diff(3, "Level 3"), CEIL_1],
      sortMethod: "level",
      sortDirection: "asc",
    },
  },
  {
    id: "founding_book",
    name: "Classic Book Variations",
    description:
      "The base motions at one turn, with the book reversal — both props reverse every step.",
    icon: "fa-book",
    sequenceCount: 19,
    filterSpec: {
      source: "community",
      // No turn filter: the book injector already scopes to turn 1|1, so AUTHOR
      // (fences user content) + REVERSAL_PATTERN book (selects the injected
      // variants) yields exactly the deck's 19.
      filters: [AUTHOR_FILTER, BOOK_FILTER],
      sortMethod: "level",
      sortDirection: "asc",
    },
  },
];

export function isFoundingId(id: string): boolean {
  return id.startsWith("founding_");
}

export function getFoundingCollection(
  id: string
): FoundingSmartCollection | undefined {
  return FOUNDING_SMART_COLLECTIONS.find((c) => c.id === id);
}

/**
 * Resolve a founding deck through the same config rule that owns its Browse
 * collection. Learn lessons and other non-engine consumers call this instead
 * of rebuilding a deck from a second set of assumptions.
 */
export async function loadFoundingCollectionSequences(
  id: string
): Promise<readonly SequenceData[]> {
  const founding = getFoundingCollection(id);
  if (!founding) throw new Error(`Unknown founding collection: ${id}`);

  const pool = await (id === "founding_book"
    ? loadCanonicalBookVariations()
    : id === "founding_tka-1"
      ? loadCanonicalTnDBaseSequences()
      : loadCanonicalTnDSequences());
  const members = deriveSpecMembers([...pool], founding.filterSpec);
  const sorted = sortSequences(
    members,
    founding.filterSpec.sortMethod as BrowseSortMethod
  );
  const ordered =
    founding.filterSpec.sortDirection === "desc" ? sorted.reverse() : sorted;

  if (ordered.length !== founding.sequenceCount) {
    throw new Error(
      `${founding.name} resolved ${ordered.length} cards instead of ${founding.sequenceCount}`
    );
  }
  return ordered;
}

/**
 * Adapt a founding definition to a read-only smart LibraryCollection for the
 * rail and detail view. Never persisted to Firestore.
 */
export function toSyntheticCollection(
  f: FoundingSmartCollection
): LibraryCollection {
  return {
    id: f.id,
    name: f.name,
    description: f.description,
    ownerId: "system",
    sequenceIds: [],
    sequenceCount: f.sequenceCount,
    icon: f.icon,
    isPublic: true,
    sortOrder: -1000,
    kind: "smart",
    systemType: "founding",
    filterSpec: f.filterSpec,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
}
