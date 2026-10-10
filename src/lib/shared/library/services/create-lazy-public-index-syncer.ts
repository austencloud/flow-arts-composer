import type { LibrarySequence } from "#lib/shared/library/domain/models/library-sequence.js";
import type { IPublicIndexSyncer } from "./IPublicIndexSyncer";

type PublicIndexSyncerLoader = () => Promise<IPublicIndexSyncer>;

/**
 * Keeps the public-index implementation out of the critical startup chunk
 * while making its repository dependency available synchronously.
 */
export function createLazyPublicIndexSyncer(
  load: PublicIndexSyncerLoader
): IPublicIndexSyncer {
  let pending: Promise<IPublicIndexSyncer> | null = null;

  function getSyncer(): Promise<IPublicIndexSyncer> {
    if (!pending) {
      pending = load().catch((error: unknown) => {
        pending = null;
        throw error;
      });
    }
    return pending;
  }

  return {
    async syncToPublicIndex(
      sequence: LibrarySequence,
      userId: string
    ): Promise<void> {
      const syncer = await getSyncer();
      return syncer.syncToPublicIndex(sequence, userId);
    },

    async updateThumbnails(
      sequenceId: string,
      thumbnails: string[]
    ): Promise<void> {
      const syncer = await getSyncer();
      return syncer.updateThumbnails(sequenceId, thumbnails);
    },

    async removeFromPublicIndex(sequenceId: string): Promise<void> {
      const syncer = await getSyncer();
      return syncer.removeFromPublicIndex(sequenceId);
    },
  };
}
