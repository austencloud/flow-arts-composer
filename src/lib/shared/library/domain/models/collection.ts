import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import type { Timestamp } from "firebase/firestore";

/**
 * DeckMetadata - Configuration for a collection that has been promoted to a deck.
 * When a user promotes a collection, this metadata controls how the deck
 * appears in the deck browser and how it prints as physical cards.
 */
export interface DeckMetadata {
  readonly displayName: string;
  readonly cardBackTemplateId?: string;
  readonly printConfig?: {
    readonly cardSize: "poker" | "tarot" | "mini";
    readonly includeStartPosition: boolean;
  };
  readonly promotedAt: Timestamp;
}

/**
 * LibraryCollection - Named folder for organizing sequences
 *
 * Collections allow users to organize their library sequences into
 * named groups (e.g., "Teaching Material", "Poi Combos", "Favorites").
 *
 * System collections (like Favorites) are auto-created and cannot be deleted.
 *
 * Stored at: users/{userId}/library/collections/{collectionId}
 */

/**
 * System collection types - auto-created, cannot be deleted
 */
/** System collection types that are AUTO-SEEDED as singleton docs (Favorites).
 *  These are the keys of SYSTEM_COLLECTION_IDS / SYSTEM_COLLECTION_CONFIG. */
export type SeededSystemCollectionType = "favorites";

/** All system-collection markers carried on `LibraryCollection.systemType`.
 *  "founding" marks config-defined founding collections (TKA 1/2/3) for
 *  display/gating; it is NOT seeded, so it is intentionally excluded from the
 *  seeded Records below. */
export type SystemCollectionType = SeededSystemCollectionType | "founding";

/** A Smart Collection's rule targets one of these pools. */
export type SmartCollectionSource = "community" | "my-library";

/** Person-specific access to a manual collection owned by another user. */
export type CollectionAccessRole = "viewer" | "editor";

export interface CollectionShareGrant {
  readonly ownerId: string;
  readonly collectionId: string;
  readonly recipientId: string;
  readonly role: CollectionAccessRole;
  readonly grantedBy: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * One saved filter, Firestore-safe. This is an OBJECT (not the engine's
 * `[key, ActiveFilter]` tuple) because Firestore forbids arrays-of-arrays.
 * `type` is the string value of BrowseFilterType; `value` mirrors
 * BrowseFilterValue (`string | number | boolean | string[] | null`).
 */
export interface StoredSmartFilter {
  /** Engine map key, e.g. "difficulty" or "loop_type:component:mirrored". */
  key: string;
  type: string;
  value: string | number | boolean | string[] | null;
  label: string;
  chipColor: string;
}

/** The saved rule that defines a Smart Collection's live membership. */
export interface SmartFilterSpec {
  source: SmartCollectionSource;
  /** Array of objects — never a nested array (Firestore constraint). */
  filters: StoredSmartFilter[];
  /** Optional text search applied after the structured rule filters. */
  searchQuery?: string;
  /** String value of BrowseSortMethod. */
  sortMethod: string;
  sortDirection: "asc" | "desc";
  /**
   * Per-category Match any / Match all choices for the connective-bearing
   * categories (LOOPs, T&D families), keyed by BrowseFilterType string value.
   * Absent on specs saved before connectives existed — those specs' stacked
   * LOOP/TnD entries meant "all" when saved, and loading defaults them so
   * (see resolveSpecConnectives).
   */
  connectives?: Record<string, "any" | "all">;
}

/**
 * Well-known system collection IDs
 * Using deterministic IDs so we can reference them without querying
 */
export const SYSTEM_COLLECTION_IDS = {
  favorites: "system_favorites",
} as const;

/**
 * System collection configurations
 */
export const SYSTEM_COLLECTION_CONFIG: Record<
  SeededSystemCollectionType,
  {
    name: string;
    icon: string;
    color: string;
    description: string;
    sortOrder: number;
  }
> = {
  favorites: {
    name: "Favorites",
    icon: "fa-heart",
    color: "#ef4444",
    description: "Your favorited sequences",
    sortOrder: -1000, // Always first
  },
};

/**
 * LibraryCollection - A named collection of sequences
 */
export interface LibraryCollection {
  /** Display every member with this prop. Null or absent uses normal selection. */
  readonly propType?: PropType | null;

  /** Unique collection ID */
  readonly id: string;

  /** Collection name (user-defined, or system-defined for system collections) */
  readonly name: string;

  /** Optional description — free notes shown on the collection's detail header */
  readonly description?: string;

  /**
   * Free-text attribution for someone who isn't on the platform yet: "Concepts
   * by Gage DeMello". Rendered in the same card line as `ownerName`, which only
   * resolves for people who have a profile. When they do sign up, this is the
   * string to replace with a real link.
   */
  readonly credit?: string;

  /** Owner user ID */
  readonly ownerId: string;

  /** Sequence IDs in this collection (references, not embedded) */
  readonly sequenceIds: readonly string[];

  /**
   * Source library for each sequence. Old collections omit this map and treat
   * every member as owner-authored. Shared collections use it when a
   * collaborator contributes one of their own sequences.
   */
  readonly sequenceOwnerIds?: Readonly<Record<string, string>>;

  /** Sequence count (denormalized for display without loading sequences) */
  readonly sequenceCount: number;

  /** Cover image URL (first sequence thumbnail or custom upload) */
  readonly coverImageUrl?: string;

  /** Collection color theme (hex color) */
  readonly color?: string;

  /** Collection icon (emoji or FontAwesome icon name) */
  readonly icon?: string;

  /** Whether this collection is visible to others */
  readonly isPublic: boolean;

  /** Sort order within user's collections list */
  readonly sortOrder: number;

  /**
   * System collection type - if set, this is a system-managed collection
   * System collections cannot be deleted or renamed
   */
  readonly systemType?: SystemCollectionType;

  /** Deck promotion metadata - present when this collection has been promoted to a deck */
  readonly deckMetadata?: DeckMetadata;

  /**
   * Membership model. Absent or "manual" = hand-picked `sequenceIds` list
   * (every collection before Smart Collections existed). "smart" = members
   * derive live from `filterSpec`; `sequenceIds` is unused.
   */
  readonly kind?: "manual" | "smart";

  /** The saved filter rule. Present iff kind === "smart". */
  readonly filterSpec?: SmartFilterSpec;

  /** When created */
  readonly createdAt: Date;

  /** When last modified */
  readonly updatedAt: Date;

  /** Viewer/editor role attached by the Shared with you loader, never stored on the collection doc. */
  readonly accessRole?: CollectionAccessRole;
}

/**
 * Check if a collection is a system collection
 */
export function isSystemCollection(collection: LibraryCollection): boolean {
  return collection.systemType !== undefined;
}

/**
 * Check if a collection is the favorites collection
 */
export function isFavoritesCollection(collection: LibraryCollection): boolean {
  return collection.systemType === "favorites";
}

/**
 * Check if a collection is a Smart Collection (rule-defined membership).
 */
export function isSmartCollection(collection: LibraryCollection): boolean {
  return collection.kind === "smart";
}

/**
 * Options for creating a new collection
 */
export interface CreateCollectionOptions {
  propType?: PropType | null;
  description?: string;
  coverImageUrl?: string;
  color?: string;
  icon?: string;
  isPublic?: boolean;
  sortOrder?: number;
  /**
   * Cached member count. Manual collections start at 0 (members added later);
   * a Smart Collection stamps its live match count at creation so the rail
   * card reads correctly before the detail view is ever opened.
   */
  sequenceCount?: number;
}

export function createCollection(
  name: string,
  ownerId: string,
  options: CreateCollectionOptions = {}
): Omit<LibraryCollection, "id"> {
  const now = new Date();

  return {
    name,
    ownerId,
    description: options.description,
    propType: options.propType,
    sequenceIds: [],
    sequenceCount: 0,
    coverImageUrl: options.coverImageUrl,
    color: options.color,
    icon: options.icon ?? "fa-folder",
    isPublic: options.isPublic ?? false,
    sortOrder: options.sortOrder ?? 0,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Create a Smart Collection model (rule-defined membership). Members derive
 * live from `filterSpec`, so `sequenceIds`/`sequenceCount` start empty.
 * Defaults to the wand icon so it reads as auto-maintained in the rail.
 */
export function createSmartCollectionModel(
  name: string,
  ownerId: string,
  filterSpec: SmartFilterSpec,
  options: CreateCollectionOptions = {}
): Omit<LibraryCollection, "id"> {
  const now = new Date();

  return {
    name,
    ownerId,
    description: options.description,
    propType: options.propType,
    sequenceIds: [],
    sequenceCount: options.sequenceCount ?? 0,
    coverImageUrl: options.coverImageUrl,
    color: options.color,
    icon: options.icon ?? "fa-wand-magic-sparkles",
    isPublic: options.isPublic ?? false,
    sortOrder: options.sortOrder ?? 0,
    kind: "smart",
    filterSpec,
    createdAt: now,
    updatedAt: now,
  };
}

export function updateCollection(
  collection: LibraryCollection,
  updates: Partial<LibraryCollection>
): LibraryCollection {
  return {
    ...collection,
    ...updates,
    updatedAt: new Date(),
  };
}

/**
 * Add a sequence to a collection
 */
export function addSequenceToCollection(
  collection: LibraryCollection,
  sequenceId: string
): LibraryCollection {
  if (collection.sequenceIds.includes(sequenceId)) {
    // A duplicate add is also a cheap opportunity to heal an old counter that
    // drifted away from the authoritative id list.
    return collection.sequenceCount === collection.sequenceIds.length
      ? collection
      : updateCollection(collection, {
          sequenceCount: collection.sequenceIds.length,
        });
  }

  const sequenceIds = [...collection.sequenceIds, sequenceId];
  return updateCollection(collection, {
    sequenceIds,
    sequenceCount: sequenceIds.length,
  });
}

/**
 * Remove a sequence from a collection
 */
export function removeSequenceFromCollection(
  collection: LibraryCollection,
  sequenceId: string
): LibraryCollection {
  if (!collection.sequenceIds.includes(sequenceId)) {
    return collection.sequenceCount === collection.sequenceIds.length
      ? collection
      : updateCollection(collection, {
          sequenceCount: collection.sequenceIds.length,
        });
  }

  const sequenceIds = collection.sequenceIds.filter((id) => id !== sequenceId);
  return updateCollection(collection, {
    sequenceIds,
    sequenceCount: sequenceIds.length,
  });
}

/**
 * Create a system collection (e.g., Favorites)
 * Uses deterministic ID and pre-configured settings
 */
export function createSystemCollection(
  type: SeededSystemCollectionType,
  ownerId: string
): LibraryCollection {
  const config = SYSTEM_COLLECTION_CONFIG[type];
  const now = new Date();

  return {
    id: SYSTEM_COLLECTION_IDS[type],
    name: config.name,
    description: config.description,
    ownerId,
    sequenceIds: [],
    sequenceCount: 0,
    icon: config.icon,
    color: config.color,
    isPublic: false, // System collections default to private
    sortOrder: config.sortOrder,
    systemType: type,
    createdAt: now,
    updatedAt: now,
  };
}
