/**
 * Co-exported types from retired interface contracts.
 */

import type { SequenceVisibility } from "#lib/shared/library/domain/models/library-sequence.js";

// === From ILibraryRepository ===

export interface LibraryStats {
  /** Total sequences in library */
  totalSequences: number;
  /** Sequences created by user */
  createdSequences: number;
  /** Sequences forked from others */
  forkedSequences: number;
  /** Public sequences */
  publicSequences: number;
  /** Private sequences */
  privateSequences: number;
}

export interface LibraryQueryOptions {
  /** Filter by source type */
  source?: "created" | "forked" | "all";
  /** Filter by visibility */
  visibility?: SequenceVisibility | "all";
  /** Filter by collection ID */
  collectionId?: string;
  /** Filter by tag IDs */
  tagIds?: string[];
  /** Filter by favorite status */
  isFavorite?: boolean;
  /** Search query (name, word) */
  searchQuery?: string;
  /** Sort field */
  sortBy?: "name" | "createdAt" | "updatedAt" | "sequenceLength";
  /** Sort direction */
  sortDirection?: "asc" | "desc";
  /** Maximum results */
  limit?: number;
  /** Pagination offset */
  offset?: number;
}

/**
 * Opaque continuation returned by the library repository. Callers pass it back
 * unchanged; the repository owns the Firestore ordering details inside it.
 */
export interface LibraryPageCursor {
  readonly sortValue: unknown;
  readonly documentId: string;
}

export interface LibrarySequencePage<TSequence> {
  readonly sequences: TSequence[];
  readonly nextCursor: LibraryPageCursor | null;
  readonly exhausted: boolean;
}

// === From ILibrarySaveService ===

export interface SaveToLibraryOptions {
  /** TKA name (auto-generated from sequence letters) */
  name: string;
  /** Optional custom display name */
  displayName?: string;
  /** Visibility level. Defaults to public when omitted. */
  visibility?: SequenceVisibility;
  /** Tag names to apply */
  tags: string[];
  /** Optional notes */
  notes: string;
  /** UI path that initiated the save, for lifecycle funnel breakdowns. */
  analyticsSource?:
    | "create_save_panel"
    | "viewer"
    | "share_intake"
    | "scan_import"
    | "video_record"
    | "retro"
    | "fuse";
}

export interface SaveProgress {
  /** Current step (1-5, where 5 is complete) */
  step: number;
  /** Human-readable step label */
  stepLabel: string;
}

export interface SaveResult {
  /** The saved sequence ID */
  sequenceId: string;
  /** URL of the uploaded thumbnail (if successful) */
  thumbnailUrl?: string;
  /** True when the sequence was written to the durable local (Dexie) store. */
  persisted: boolean;
  /** True when the save was made by a guest (anonymous / unauthenticated) user. */
  isGuest: boolean;
}
