import type { LibrarySequence } from "#lib/shared/library/domain/models/library-sequence.js";

export interface IPublicIndexSyncer {
  syncToPublicIndex(sequence: LibrarySequence, userId: string): Promise<void>;
  updateThumbnails(sequenceId: string, thumbnails: string[]): Promise<void>;
  removeFromPublicIndex(sequenceId: string): Promise<void>;
}
