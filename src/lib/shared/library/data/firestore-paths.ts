/**
 * Firestore Collection Paths for Library Module
 *
 * Centralized path definitions for all Library-related Firestore collections.
 * Following the pattern from gamification module.
 */

// Firestore paths must have odd segments for collections, even for documents.
// Structure: users/{userId}/sequences (3 segments = collection)

/**
 * Path to a user's sequences collection
 * @example "users/abc123/sequences"
 */
export function getUserSequencesPath(userId: string): string {
  return `users/${userId}/sequences`;
}

/**
 * Path to a specific sequence in a user's library
 * @example "users/abc123/sequences/seq456"
 */
export function getUserSequencePath(
  userId: string,
  sequenceId: string
): string {
  return `users/${userId}/sequences/${sequenceId}`;
}

/**
 * Path to a user's collections (folders)
 * @example "users/abc123/collections"
 */
export function getUserCollectionsPath(userId: string): string {
  return `users/${userId}/collections`;
}

/**
 * Path to a specific collection
 * @example "users/abc123/collections/col789"
 */
export function getUserCollectionPath(
  userId: string,
  collectionId: string
): string {
  return `users/${userId}/collections/${collectionId}`;
}

/**
 * Path to a user's followed collections (references to other users' public
 * collections). Doc id is `${ownerId}_${collectionId}` so follow state is a
 * direct doc lookup, no query.
 * @example "users/abc123/followedCollections"
 */
export function getFollowedCollectionsPath(userId: string): string {
  return `users/${userId}/followedCollections`;
}

/**
 * Path to a specific followed-collection reference
 * @example "users/abc123/followedCollections/owner456_col789"
 */
export function getFollowedCollectionPath(
  userId: string,
  ownerId: string,
  collectionId: string
): string {
  return `users/${userId}/followedCollections/${ownerId}_${collectionId}`;
}

/**
 * Path to a user's acts (playlists)
 * @example "users/abc123/acts"
 */
export function getUserActsPath(userId: string): string {
  return `users/${userId}/acts`;
}

/**
 * Path to a specific act
 * @example "users/abc123/acts/act012"
 */
export function getUserActPath(userId: string, actId: string): string {
  return `users/${userId}/acts/${actId}`;
}

/**
 * Path to a user's tags
 * @example "users/abc123/tags"
 */
export function getUserTagsPath(userId: string): string {
  return `users/${userId}/tags`;
}

/**
 * Path to a specific tag
 * @example "users/abc123/tags/tag345"
 */
export function getUserTagPath(userId: string, tagId: string): string {
  return `users/${userId}/tags/${tagId}`;
}

// ============================================================================
// GLOBAL PATHS (Public sequences)
// ============================================================================

/**
 * Path to the public sequences collection (denormalized for Browse)
 * @example "publicSequences"
 */
export function getPublicSequencesPath(): string {
  return "publicSequences";
}

/**
 * Path to a specific public sequence
 * @example "publicSequences/seq456"
 */
export function getPublicSequencePath(sequenceId: string): string {
  return `publicSequences/${sequenceId}`;
}

/** Immutable media-eligible snapshots of published sequences. */
export function getSequenceRevisionPath(revisionId: string): string {
  return `sequenceRevisions/${revisionId}`;
}

// ============================================================================
// PERSONAL MUSEUM PATHS
// ============================================================================

/**
 * Path to a user's personal-museum collection.
 * @example "users/abc123/personal-museum"
 */
export function getPersonalMuseumPath(userId: string): string {
  return `users/${userId}/personal-museum`;
}

/**
 * Path to the single personal-museum doc for a user.
 * @example "users/abc123/personal-museum/main"
 */
export function getPersonalMuseumDocPath(userId: string): string {
  return `users/${userId}/personal-museum/main`;
}

// ============================================================================
// METADATA PATHS (Immutable fork lineage)
// ============================================================================

/**
 * Path to sequence metadata collection (immutable fork chain)
 * @example "sequenceMetadata"
 */
export function getSequenceMetadataCollectionPath(): string {
  return "sequenceMetadata";
}

/**
 * Path to a specific sequence's metadata
 * @example "sequenceMetadata/seq456"
 */
export function getSequenceMetadataPath(sequenceId: string): string {
  return `sequenceMetadata/${sequenceId}`;
}

// ============================================================================
// SYSTEM CATALOG PATHS
// ============================================================================

/**
 * Path to the system catalogs collection.
 *
 * Catalogs are algorithmically enumerated source pools. They are distinct from
 * released printable Decks, which live in the separate `deckReleases/`
 * collection (see getDeckReleasesPath). This collection was historically named
 * `decks/`; it was migrated to `catalogs/` so the name matches its contents.
 * The legacy `decks/` collection is retained (copy-don't-delete) as a rollback
 * safety net until `catalogs/` is verified live in production.
 * @example "catalogs"
 */
export function getSystemCatalogsPath(): string {
  return "catalogs";
}

/**
 * Path to a specific system catalog
 * @example "catalogs/l1-quartered-loop"
 */
export function getSystemCatalogPath(catalogId: string): string {
  return `catalogs/${catalogId}`;
}

/**
 * Path to sequences within a system catalog
 * @example "catalogs/l1-quartered-loop/sequences"
 */
export function getSystemCatalogSequencesPath(catalogId: string): string {
  return `catalogs/${catalogId}/sequences`;
}

/**
 * Path to a specific sequence within a system catalog
 * @example "catalogs/l1-quartered-loop/sequences/alpha1-AB"
 */
export function getSystemCatalogSequencePath(
  catalogId: string,
  sequenceId: string
): string {
  return `catalogs/${catalogId}/sequences/${sequenceId}`;
}

// ============================================================================
// DECK RELEASE PATHS
// ============================================================================

export function getDeckReleasesPath(): string {
  return "deckReleases";
}

export function getDeckReleaseCounterPath(): string {
  return "deckReleases/counter";
}

export function getDeckReleaseManifestsPath(): string {
  return "deckReleases/counter/manifests";
}

export function getDeckReleaseManifestPath(deckNumber: number): string {
  return `deckReleases/counter/manifests/${String(deckNumber).padStart(3, "0")}`;
}

/**
 * Per-card exact-reprint data for a release, keyed by the card's 0-based
 * position in `DeckRelease.sequences[]`. Kept out of the manifest document so
 * a deck's saved SequenceData never risks the 1 MiB Firestore document limit
 * (a manifest holding hundreds of full SequenceData objects inline could
 * exceed it; one doc per card cannot).
 * @example "deckReleases/counter/manifests/003/cards"
 */
export function getDeckReleaseCardsPath(deckNumber: number): string {
  return `${getDeckReleaseManifestPath(deckNumber)}/cards`;
}

/**
 * @example "deckReleases/counter/manifests/003/cards/7"
 */
export function getDeckReleaseCardPath(
  deckNumber: number,
  cardIndex: number
): string {
  return `${getDeckReleaseCardsPath(deckNumber)}/${cardIndex}`;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Firestore collection names used by the Library module
 */
export const LIBRARY_COLLECTIONS = {
  /** User's library sequences */
  SEQUENCES: "sequences",
  /** User's collections (folders) */
  COLLECTIONS: "collections",
  /** User's acts (playlists) */
  ACTS: "acts",
  /** User's custom tags */
  TAGS: "tags",
  /** Global public sequences index */
  PUBLIC_SEQUENCES: "publicSequences",
  /** Immutable retained subjects for exact performance associations. */
  SEQUENCE_REVISIONS: "sequenceRevisions",
  /** Global sequence metadata (fork lineage) */
  SEQUENCE_METADATA: "sequenceMetadata",
} as const;

/**
 * Maximum limits for library operations
 */
export const LIBRARY_LIMITS = {
  /** Max sequences per user */
  MAX_SEQUENCES_PER_USER: 1000,
  /** Max collections per user */
  MAX_COLLECTIONS_PER_USER: 100,
  /** Max acts per user */
  MAX_ACTS_PER_USER: 50,
  /** Max tags per user */
  MAX_TAGS_PER_USER: 100,
  /** Max sequences per collection */
  MAX_SEQUENCES_PER_COLLECTION: 500,
  /** Max sequences per act */
  MAX_SEQUENCES_PER_ACT: 100,
  /** Max tags per sequence */
  MAX_TAGS_PER_SEQUENCE: 20,
  /** Default query limit */
  DEFAULT_QUERY_LIMIT: 50,
} as const;
