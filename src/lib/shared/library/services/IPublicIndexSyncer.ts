import type { LibrarySequence } from "#lib/shared/library/domain/models/library-sequence.js";
import type { PublicDuplicateError } from "./public-sequence-persister";

export interface IPublicIndexSyncer {
  syncToPublicIndex(sequence: LibrarySequence, userId: string): Promise<void>;
  /**
   * Read-only: why this user cannot publish this sequence (its content is
   * already in the gallery, or its id is another creator's post), or null.
   * Run before any write so a save can stay private instead of failing.
   */
  findPublishConflict(
    sequence: LibrarySequence,
    userId: string
  ): Promise<PublicDuplicateError | null>;
  updateThumbnails(sequenceId: string, thumbnails: string[]): Promise<void>;
  /** `ownerId` limits removal to that user's own mirror. */
  removeFromPublicIndex(sequenceId: string, ownerId?: string): Promise<void>;
}
