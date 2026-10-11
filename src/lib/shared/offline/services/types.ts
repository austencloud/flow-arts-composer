import type { LibrarySequence } from "#lib/shared/library/domain/models/library-sequence.js";
import type { PublicSequenceIndex } from "#lib/shared/foundation/domain/models/public-sequence-index.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";

/** Converts a PublicSequenceIndex doc into a SequenceData for gallery display. */
export type GallerySequenceConverter = (data: PublicSequenceIndex, id: string) => SequenceData;

/**
 * Represents a detected version conflict between local and server state
 */
export interface VersionConflict {
  /** The sequence ID with conflicting versions */
  readonly sequenceId: string;
  /** The local version of the sequence (user's pending changes) */
  readonly localVersion: LibrarySequence;
  /** The server version of the sequence (from another device) */
  readonly serverVersion: LibrarySequence;
}

/**
 * User's choice for resolving a conflict
 */
export type ConflictResolution = "keep-local" | "use-server";

/**
 * Callback invoked when a conflict is detected and needs user input
 */
export type ConflictPromptCallback = (
  conflict: VersionConflict
) => Promise<ConflictResolution>;
