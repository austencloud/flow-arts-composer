import type { CreatorIntent } from "#lib/shared/foundation/domain/models/creator-intent.js";
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
  /**
   * Narrow patch of an already-public sequence's `creatorIntent` (its saved
   * look and prop pair). Replaces the stored map whole and restamps the
   * projection, without replaying a full publish.
   */
  updateCreatorIntent(
    sequenceId: string,
    creatorIntent: CreatorIntent
  ): Promise<void>;
  /** `ownerId` limits removal to that user's own mirror. */
  removeFromPublicIndex(sequenceId: string, ownerId?: string): Promise<void>;
}
