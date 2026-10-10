/**
 * LibrarySequence - Extended SequenceData with library-specific fields
 *
 * Core model for sequences stored in a user's library.
 * Extends the base SequenceData with ownership, visibility, organization, and attribution.
 */

import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { SequenceTag } from "./sequence-tag";

/**
 * How the sequence entered the user's library
 */
export type SequenceSource = "created" | "forked" | "imported";

/**
 * Visibility level for library sequences
 * - private: Only visible to the owner
 * - unlisted: Accessible via direct link, not in public feeds
 * - public: Browseable in Browse and public feeds
 */
export type SequenceVisibility = "private" | "unlisted" | "public";

/**
 * Attribution metadata for forked sequences
 */
export interface ForkAttribution {
  /** Original sequence ID in the source user's library */
  readonly originalSequenceId: string;
  /** User ID of the original creator */
  readonly originalCreatorId: string;
  /** Display name of original creator (denormalized for display) */
  readonly originalCreatorName: string;
  /** Profile photo URL of original creator (denormalized) */
  readonly originalCreatorPhotoUrl?: string;
  /** When this fork was created */
  readonly forkedAt: Date;
  /** Chain of fork ancestors for deep fork lineage (oldest first) */
  readonly forkChain?: readonly string[];
}

/**
 * LibrarySequence - A sequence in a user's library
 *
 * Stored at: users/{userId}/sequences/{sequenceId}
 */
export interface LibrarySequence extends SequenceData {
  /** User ID of the library owner */
  readonly ownerId: string;

  /** How this sequence entered the library */
  readonly source: SequenceSource;

  /** Fork attribution (only present if source === "forked") */
  readonly forkAttribution?: ForkAttribution;

  /** Current visibility state (defaults to "public") */
  readonly visibility: SequenceVisibility;

  /** When visibility was last changed */
  readonly visibilityChangedAt?: Date;

  /** Whether sequence is featured (admin-controlled) */
  readonly isFeatured?: boolean;

  /** Collection IDs this sequence belongs to */
  readonly collectionIds: readonly string[];

  /** User-defined tag IDs (legacy - use sequenceTags instead) */
  readonly tagIds: readonly string[];

  /** Structured tags with source tracking (replaces tagIds) */
  readonly sequenceTags: readonly SequenceTag[];

  /** User's personal notes about this sequence */
  readonly notes?: string;

  // ENGAGEMENT METRICS (denormalized for sorting/display)

  /** Number of times this has been forked by others */
  readonly forkCount: number;

  /** Number of times this has been viewed (if public) */
  readonly viewCount: number;

  /** Number of users who starred/liked this */
  readonly starCount: number;

  /**
   * Monotonically increasing version counter for conflict detection.
   * Incremented on every save. Used to detect when the same sequence
   * was edited on multiple devices while one was offline.
   * - 0 for legacy sequences without versioning
   * - 1+ for versioned sequences
   */
  readonly _version?: number;

  /**
   * SHA-256 hash of the sequence's motion content (steps, positions, turns,
   * orientations). Two sequences with the same hash are the same physical
   * movement pattern. Used to detect when an edit creates a new variation
   * vs. a metadata-only update.
   *
   * Optional because legacy sequences saved before this feature won't have it.
   * Computed and stored on every save going forward.
   */
  readonly contentHash?: string;

  /**
   * Identity-hash basis `contentHash` was computed under (see HASH_VERSION_V1 /
   * HASH_VERSION_V2 / HASH_VERSION_V3 in sequence-content-hasher). Absent === V1. Lets fork
   * detection compare hashes on a common basis and lazy-rehash across a version
   * bump instead of spuriously forking.
   */
  readonly contentHashVersion?: number;

  /** When the sequence was soft-deleted. Null means not deleted. */
  readonly deletedAt?: Date | null;

  /** Whether the sequence is in the recycle bin */
  readonly isDeleted?: boolean;

  /**
   * Original creation date - when this exact sequence was first saved anywhere.
   * This is the sequence's "birthday" and NEVER changes after being set.
   * - For legacy sequences: imported from PNG metadata date_added
   * - For new sequences: set to createdAt on first save
   * - For forked sequences: set to fork time (not original's birthday)
   */
  readonly birthday?: Date;

  /** When added to THIS user's library (may differ from birthday) */
  readonly createdAt: Date;

  /** When last modified */
  readonly updatedAt: Date;

  /** When last accessed/viewed */
  readonly lastAccessedAt?: Date;
}

/**
 * Options for creating a new LibrarySequence
 */
export interface CreateLibrarySequenceOptions {
  source?: SequenceSource;
  forkAttribution?: ForkAttribution;
  visibility?: SequenceVisibility;
  collectionIds?: string[];
  tagIds?: string[];
  sequenceTags?: SequenceTag[];
  notes?: string;
  /** Explicit birthday to use (e.g., from legacy import). Defaults to createdAt. */
  birthday?: Date;
}

export function createLibrarySequence(
  sequenceData: SequenceData,
  ownerId: string,
  options: CreateLibrarySequenceOptions = {}
): LibrarySequence {
  const now = new Date();

  return {
    ...sequenceData,
    ownerId,
    source: options.source ?? "created",
    forkAttribution: options.forkAttribution,
    visibility: options.visibility ?? "public",
    collectionIds: options.collectionIds ?? [],
    tagIds: options.tagIds ?? [],
    sequenceTags: options.sequenceTags ?? [],
    notes: options.notes,
    forkCount: 0,
    viewCount: 0,
    starCount: 0,
    birthday: options.birthday ?? now, // Birthday defaults to creation time
    createdAt: now,
    updatedAt: now,
  };
}

export function updateLibrarySequence(
  sequence: LibrarySequence,
  updates: Partial<LibrarySequence>
): LibrarySequence {
  return {
    ...sequence,
    ...updates,
    updatedAt: new Date(),
  };
}

/**
 * Check if a sequence is owned by the given user
 */
export function isOwnedBy(sequence: LibrarySequence, userId: string): boolean {
  return sequence.ownerId === userId;
}

/**
 * Check if a sequence is forked
 */
export function isForked(sequence: LibrarySequence): boolean {
  return sequence.source === "forked" && !!sequence.forkAttribution;
}

/**
 * Check if a sequence is public
 */
export function isPublic(sequence: LibrarySequence): boolean {
  return sequence.visibility === "public";
}
